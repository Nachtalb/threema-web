/**
 * This file is part of Threema Web.
 *
 * Threema Web is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
 * General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Threema Web. If not, see <http://www.gnu.org/licenses/>.
 */

import {Transition as UiTransition, TransitionService as UiTransitionService} from '@uirouter/angularjs';
import {saveAs} from 'file-saver';

import {bufferToUrl, firefoxWorkaroundPdfDownload, hasValue} from '../helpers';
import {LogService} from '../services/log';
import {MediaboxService} from '../services/mediabox';
import {MessageService} from '../services/message';
import {TimeoutService} from '../services/timeout';
import {WebClientService} from '../services/webclient';

/**
 * Play a video in a dialog, with the option to keep it.
 */
function showVideoDialog(
    $mdDialog: ng.material.IDialogService,
    blobInfo: threema.BlobInfo,
): void {
    $mdDialog.show({
        controllerAs: 'ctrl',
        controller: function() {
            // A video is far too large to inline as a data url
            const url = URL.createObjectURL(
                new Blob([blobInfo.buffer], {type: blobInfo.mimetype}));
            this.videoSrc = url;
            this.cancel = () => {
                URL.revokeObjectURL(url);
                $mdDialog.cancel();
            };
            this.save = () => saveAs(
                new Blob([blobInfo.buffer], {type: blobInfo.mimetype}),
                blobInfo.filename,
            );
        },
        template: `
            <md-dialog class="video-dialog" translate-attr="{'aria-label': 'messageTypes.video'}">
                    <md-dialog-content>
                        <video controls autoplay ng-src="{{ ctrl.videoSrc | unsafeResUrl }}">
                            Your browser does not support the <code>video</code> element.
                        </video>
                    </md-dialog-content>
                    <md-dialog-actions layout="row">
                      <md-button ng-click="ctrl.save()">
                         <span translate>common.SAVE</span>
                      </md-button>
                      <md-button ng-click="ctrl.cancel()">
                         <span translate>common.OK</span>
                      </md-button>
                    </md-dialog-actions>
            </md-dialog>`,
        parent: angular.element(document.body),
        clickOutsideToClose: true,
    });
}

export default [
    'LogService',
    'WebClientService',
    'MediaboxService',
    'MessageService',
    'TimeoutService',
    '$rootScope',
    '$mdDialog',
    '$timeout',
    '$transitions',
    '$translate',
    '$filter',
    '$window',
    function(logService: LogService,
             webClientService: WebClientService,
             mediaboxService: MediaboxService,
             messageService: MessageService,
             timeoutService: TimeoutService,
             $rootScope: ng.IRootScopeService,
             $mdDialog: ng.material.IDialogService,
             $timeout: ng.ITimeoutService,
             $transitions: UiTransitionService,
             $translate: ng.translate.ITranslateService,
             $filter: ng.IFilterService,
             $window: ng.IWindowService) {
        const log = logService.getLogger('MessageMedia-C');
        return {
            restrict: 'EA',
            scope: {},
            bindToController: {
                message: '=eeeMessage',
                receiver: '=eeeReceiver',
                showDownloading: '=eeeShowDownloading',
            },
            controllerAs: 'ctrl',
            controller: [function() {
                // On state transitions, clear mediabox
                $transitions.onStart({}, function(trans: UiTransition) {
                    mediaboxService.clearMedia();
                });

                this.$onInit = function() {
                    const message = this.message as threema.Message;
                    this.type = message.type;

                    // Downloading
                    this.downloading = false;
                    this.thumbnailDownloading = false;
                    this.downloaded = false;

                    // Uploading
                    this.uploading = message.temporaryId !== undefined
                        && message.temporaryId !== null;

                    // AnimGIF detection
                    this.isGif = message.type === 'file' && message.file.type === 'image/gif';

                    // Has a preview thumbnail
                    this.hasPreviewThumbnail = (): boolean => {
                        return hasValue(message.thumbnail) && (
                            hasValue(message.thumbnail.previewDataUrl) || hasValue(message.thumbnail.preview));
                    };

                    // Preview thumbnail
                    this.getThumbnailPreviewUri = (): string | null => {
                        // Cache thumbnail preview URI
                        if (hasValue(message.thumbnail.previewDataUrl)) {
                            return message.thumbnail.previewDataUrl;
                        }
                        if (hasValue(message.thumbnail.preview)) {
                            message.thumbnail.previewDataUrl = bufferToUrl(
                                message.thumbnail.preview,
                                webClientService.appCapabilities.imageFormat.thumbnail,
                                log,
                            );
                            return message.thumbnail.previewDataUrl;
                        }
                        return null;
                    };
                    // TODO: Uuuuugly!
                    this.getThumbnailPreviewUriStyle = (): string => {
                        const previewUri = hasValue(message.thumbnail) ? this.getThumbnailPreviewUri() : null;
                        return previewUri !== null ? `url(${previewUri})` : 'none';
                    };

                    // Only show thumbnails for images, videos and GIFs
                    // If a preview image is not available, we fall back to
                    // icons depending on the type.
                    this.thumbnail = null;
                    if (message.thumbnail !== undefined) {
                        this.thumbnailStyle = {
                            width: this.message.thumbnail.width + 'px',
                            height: this.message.thumbnail.height + 'px',
                        };
                    }

                    let loadingThumbnailTimeout: ng.IPromise<void> = null;

                    this.wasInView = false;
                    this.thumbnailInView = (inView: boolean) => {
                        if (this.uploading || message.thumbnail === undefined || this.wasInView === inView) {
                            // do nothing
                            return;
                        }
                        this.wasInView = inView;

                        if (!inView) {
                            if (loadingThumbnailTimeout !== null) {
                                timeoutService.cancel(loadingThumbnailTimeout);
                            }
                            this.thumbnailDownloading = false;
                            this.thumbnail = null;
                        } else {
                            if (this.thumbnail === null) {
                                const setThumbnail = (buf: ArrayBuffer) => {
                                    this.thumbnail = bufferToUrl(
                                        buf,
                                        webClientService.appCapabilities.imageFormat.thumbnail,
                                        log,
                                    );
                                };

                                if (message.thumbnail.img !== undefined) {
                                    setThumbnail(message.thumbnail.img);
                                    return;
                                } else {
                                    this.thumbnailDownloading = true;
                                    loadingThumbnailTimeout = timeoutService.register(() => {
                                        webClientService
                                            .requestThumbnail(this.receiver, message)
                                            .then((img) => $timeout(() => {
                                                setThumbnail(img);
                                                this.thumbnailDownloading = false;
                                            }))
                                            .catch((error) => {
                                                // TODO: Handle this properly / show an error message
                                                const description = `Thumbnail request has been rejected: ${error}`;
                                                this.log.error(description);
                                            });
                                    }, 1000, false, 'thumbnail');
                                }
                            }
                        }
                    };

                    // For locations, retrieve the coordinates
                    this.location = null;
                    if (message.location !== undefined) {
                        this.location = message.location;
                        this.downloaded = true;
                    }

                    // Open map link in new window using mapLink-filter
                    this.openMapLink = () => {
                        $window.open($filter<any>('mapLink')(this.location), '_blank');
                    };

                    // Download function
                    this.download = () => {
                        log.debug('Download blob');
                        if (this.uploading) {
                            log.debug('Cannot download, still uploading');
                            return;
                        }
                        if (this.downloading) {
                            log.debug('Download already in progress...');
                            return;
                        }
                        const receiver: threema.Receiver = this.receiver;
                        this.downloading = true;
                        webClientService.requestBlob(message.id, receiver)
                            .then((blobInfo: threema.BlobInfo) => {
                                $rootScope.$apply(() => {
                                    log.debug('Blob loaded');
                                    this.downloading = false;
                                    this.downloaded = true;
                                    const options = {type: blobInfo.mimetype};

                                    switch (message.type) {
                                        case 'image':
                                            const caption = message.caption || '';
                                            // Let the box page through the
                                            // other pictures in this chat.
                                            let showing: threema.Message = message;
                                            const step = (forward: boolean): threema.Message | null => {
                                                const list = webClientService.messages
                                                    .getList(receiver)
                                                    .filter((m) => m.type === 'image');
                                                const at = list.findIndex((m) => m.id === showing.id);
                                                if (at === -1) {
                                                    return null;
                                                }
                                                return list[at + (forward ? 1 : -1)] || null;
                                            };
                                            mediaboxService.hasNeighbour =
                                                (forward: boolean) => step(forward) !== null;
                                            mediaboxService.loadNeighbour = (forward: boolean) => {
                                                const next = step(forward);
                                                if (next === null) {
                                                    return;
                                                }
                                                webClientService.requestBlob(next.id, receiver)
                                                    .then((info: threema.BlobInfo) => {
                                                        $rootScope.$apply(() => {
                                                            showing = next;
                                                            mediaboxService.setMedia(
                                                                info.buffer,
                                                                info.filename,
                                                                info.mimetype,
                                                                next.caption || '',
                                                            );
                                                        });
                                                    })
                                                    .catch((error) =>
                                                        log.error('Could not load neighbouring image: ' + error));
                                            };
                                            mediaboxService.setMedia(
                                                blobInfo.buffer,
                                                blobInfo.filename,
                                                blobInfo.mimetype,
                                                caption,
                                            );
                                            break;
                                        case 'video':
                                            showVideoDialog($mdDialog, blobInfo);
                                            break;
                                        case 'file':
                                            if (message.file.type === 'image/gif') {
                                                // Show inline
                                                this.blobBufferUrl = bufferToUrl(
                                                    blobInfo.buffer, 'image/gif', log);
                                                // Hide thumbnail
                                                this.showThumbnail = false;
                                            } else {
                                                options.type = firefoxWorkaroundPdfDownload(options.type);
                                                saveAs(
                                                    new Blob(
                                                        [blobInfo.buffer],
                                                        options
                                                    ),
                                                    blobInfo.filename
                                                );
                                            }
                                            break;
                                        case 'audio':
                                            // Plays inline, in the message
                                            this.blobBufferUrl = URL.createObjectURL(
                                                new Blob([blobInfo.buffer], options));
                                            break;
                                        default:
                                            log.warn('Ignored download request for message type', message.type);
                                    }
                                });
                            })
                            .catch((error) => {
                                $rootScope.$apply(() => {
                                    this.downloading = false;
                                    let contentString;
                                    switch (error) {
                                        case 'blobDownloadFailed':
                                            contentString = 'error.BLOB_DOWNLOAD_FAILED';
                                            break;
                                        case 'blobDecryptFailed':
                                            contentString = 'error.BLOB_DECRYPT_FAILED';
                                            break;
                                        default:
                                            contentString = 'error.ERROR_OCCURRED';
                                            break;
                                    }
                                    const confirm = $mdDialog.alert()
                                        .title($translate.instant('common.ERROR'))
                                        .textContent($translate.instant(contentString))
                                        .ok($translate.instant('common.OK'));
                                    $mdDialog.show(confirm);
                                });
                            });
                    };

                    this.isLoading = () => {
                        return this.uploading || this.isDownloading();
                    };

                    this.isDownloading = () => {
                        return this.downloading
                            || this.thumbnailDownloading
                            || (this.showDownloading && this.showDownloading());
                    };
                };
            }],
            templateUrl: 'directives/message_media.html',
        };
    },
];
