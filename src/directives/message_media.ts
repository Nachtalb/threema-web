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

import {bufferToUrl, firefoxWorkaroundPdfDownload, hasValue, mayHaveAlpha} from '../helpers';
import {LogService} from '../services/log';
import {MediaboxService} from '../services/mediabox';
import {MessageService} from '../services/message';
import {SettingsService} from '../services/settings';
import {TimeoutService} from '../services/timeout';
import {WebClientService} from '../services/webclient';

/**
 * The size of the media, from whichever field the message type carries it in.
 * Zero when it is not known, in which case progress cannot be measured.
 */
function mediaSize(message: threema.Message): number {
    if (message.video !== undefined && message.video.size !== undefined) {
        return message.video.size;
    }
    if (message.file !== undefined) {
        return message.file.size;
    }
    return 0;
}

export default [
    'LogService',
    'WebClientService',
    'MediaboxService',
    'MessageService',
    'TimeoutService',
    'SettingsService',
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
             settingsService: SettingsService,
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
                    this.isTransparent = false;
                    // How far the current download has got, 0..1, or null when
                    // it cannot be told
                    this.downloadProgress = null;
                    this.downloadedBytes = 0;
                    this.progress = () => this.downloadProgress;
                    this.received = () => this.downloadedBytes;

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
                        return previewUri !== null ? `url("${previewUri}")` : 'none';
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
                        if (this.uploading || this.wasInView === inView) {
                            // do nothing
                            return;
                        }
                        this.wasInView = inView;

                        // Gifs are short and meant to loop, so fetch them as
                        // soon as they are on screen rather than on a click.
                        if (inView && this.isGif && !this.downloaded && !this.downloading
                            && settingsService.media.getAutoLoadGifs()) {
                            this.download();
                        }

                        if (message.thumbnail === undefined) {
                            return;
                        }

                        if (!inView) {
                            if (loadingThumbnailTimeout !== null) {
                                timeoutService.cancel(loadingThumbnailTimeout);
                            }
                            this.thumbnailDownloading = false;
                            this.thumbnail = null;
                        } else {
                            if (this.thumbnail === null) {
                                const setThumbnail = (buf: ArrayBuffer) => {
                                    const format = webClientService.appCapabilities.imageFormat.thumbnail;
                                    // A cropped picture would cut the shape a
                                    // transparent one is drawn as, so it is
                                    // shown whole instead.
                                    this.isTransparent = mayHaveAlpha(buf, format);
                                    this.thumbnail = bufferToUrl(
                                        buf,
                                        format,
                                        log,
                                    );
                                };

                                if (message.thumbnail.img !== undefined) {
                                    setThumbnail(message.thumbnail.img);
                                    return;
                                } else {
                                    // Anything fetched earlier this session is
                                    // put back straight away, with no delay and
                                    // no spinner.
                                    webClientService.cachedThumbnail(this.receiver, message)
                                        .then((cached) => {
                                            if (cached === null || this.thumbnail !== null) {
                                                return;
                                            }
                                            $timeout(() => {
                                                message.thumbnail.img = cached;
                                                setThumbnail(cached);
                                            });
                                        })
                                        .catch(() => {
                                            // Nothing stored; the request below covers it
                                        });

                                    // The request is held back a moment so
                                    // scrolling past does not fetch anything,
                                    // and the spinner only appears if the
                                    // thumbnail is genuinely slow to arrive.
                                    loadingThumbnailTimeout = timeoutService.register(() => {
                                        if (this.thumbnail !== null) {
                                            return;
                                        }
                                        let settled = false;
                                        timeoutService.register(() => {
                                            if (!settled) {
                                                this.thumbnailDownloading = true;
                                            }
                                        }, 150, true, 'thumbnailSpinner');
                                        webClientService
                                            .requestThumbnail(this.receiver, message)
                                            .then((img) => $timeout(() => {
                                                settled = true;
                                                setThumbnail(img);
                                                this.thumbnailDownloading = false;
                                            }))
                                            .catch((error) => {
                                                settled = true;
                                                this.thumbnailDownloading = false;
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

                    // Show a piece of media in the big viewer, and teach the
                    // viewer how to walk to the ones either side of it within
                    // this conversation.
                    const VIEWABLE = ['image', 'video'];
                    const openInViewer = (start: threema.Message, receiver: threema.Receiver) => {
                        let showing: threema.Message = start;

                        const step = (forward: boolean): threema.Message | null => {
                            const list = webClientService.messages
                                .getList(receiver)
                                .filter((m) => VIEWABLE.indexOf(m.type) !== -1);
                            const at = list.findIndex((m) => m.id === showing.id);
                            if (at === -1) {
                                return null;
                            }
                            return list[at + (forward ? 1 : -1)] || null;
                        };

                        const show = (msg: threema.Message) => {
                            showing = msg;
                            mediaboxService.messageId = msg.id;
                            // Open on the best picture the message has to hand.
                            // `preview` is a tiny blurred placeholder, so it is
                            // only a last resort.
                            const bestThumb = (): string | null => {
                                if (msg.id === start.id && hasValue(this.thumbnail)) {
                                    return this.thumbnail;
                                }
                                if (!hasValue(msg.thumbnail)) {
                                    return null;
                                }
                                if (hasValue(msg.thumbnail.img)) {
                                    return bufferToUrl(
                                        msg.thumbnail.img,
                                        webClientService.appCapabilities.imageFormat.thumbnail,
                                        log);
                                }
                                if (hasValue(msg.thumbnail.previewDataUrl)) {
                                    return msg.thumbnail.previewDataUrl;
                                }
                                if (hasValue(msg.thumbnail.preview)) {
                                    return bufferToUrl(msg.thumbnail.preview, 'image/jpeg', log);
                                }
                                return null;
                            };
                            const thumb = bestThumb();

                            // A cached blob arrives in the same tick, so only
                            // announce a download once it is actually slow.
                            let settled = false;
                            timeoutService.register(() => {
                                if (!settled && showing.id === msg.id && mediaboxService.isOpen) {
                                    mediaboxService.setPending(thumb, msg.caption || '', true);
                                }
                            }, 150, true, 'mediaboxSpinner');
                            mediaboxService.setPending(thumb, msg.caption || '', false);

                            // Follow the bytes so a slow download does not look
                            // like a hang
                            const expected = mediaSize(msg);
                            let shownThumb = thumb;
                            webClientService.watchTransfer(expected, (fraction, received) => {
                                if (settled || showing.id !== msg.id || !mediaboxService.isOpen) {
                                    return;
                                }
                                // A better thumbnail may have arrived since the
                                // box opened; show it rather than sitting on the
                                // blurry one.
                                const better = bestThumb();
                                if (better !== null && better !== shownThumb) {
                                    shownThumb = better;
                                    mediaboxService.setPending(better, msg.caption || '', true);
                                }
                                mediaboxService.setProgress(fraction, received);
                                $rootScope.$evalAsync();
                            });

                            webClientService.requestBlob(msg.id, receiver)
                                .then((info: threema.BlobInfo) => $rootScope.$apply(() => {
                                    settled = true;
                                    webClientService.stopWatchingTransfer();
                                    // The user may have paged on, or shut the
                                    // box, while this was in flight
                                    if (showing.id !== msg.id || !mediaboxService.isOpen) {
                                        return;
                                    }
                                    mediaboxService.setMedia(
                                        info.buffer, info.filename, info.mimetype, msg.caption || '');
                                }))
                                .catch((error) => {
                                    settled = true;
                                    webClientService.stopWatchingTransfer();
                                    log.error('Could not load media: ' + error);
                                });
                        };

                        mediaboxService.hasNeighbour = (forward: boolean) => step(forward) !== null;
                        mediaboxService.loadNeighbour = (forward: boolean) => {
                            const next = step(forward);
                            if (next !== null) {
                                show(next);
                            }
                        };
                        show(start);
                    };

                    // Download function
                    this.download = () => {
                        log.debug('Download blob');
                        if (this.uploading) {
                            log.debug('Cannot download, still uploading');
                            return;
                        }
                        const receiver: threema.Receiver = this.receiver;

                        // Pictures and videos open in the viewer straight away
                        if (VIEWABLE.indexOf(message.type) !== -1) {
                            openInViewer(message, receiver);
                            this.downloaded = true;
                            return;
                        }

                        if (this.downloading) {
                            log.debug('Download already in progress...');
                            return;
                        }
                        this.downloading = true;
                        this.downloadProgress = null;
                        webClientService.watchTransfer(
                            mediaSize(message),
                            (fraction, received) => {
                                this.downloadProgress = fraction;
                                this.downloadedBytes = received;
                                $rootScope.$evalAsync();
                            });
                        webClientService.requestBlob(message.id, receiver)
                            .then((blobInfo: threema.BlobInfo) => {
                                $rootScope.$apply(() => {
                                    log.debug('Blob loaded');
                                    webClientService.stopWatchingTransfer();
                                    this.downloadProgress = null;
                                    this.downloading = false;
                                    this.downloaded = true;
                                    const options = {type: blobInfo.mimetype};

                                    switch (message.type) {
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
                                    webClientService.stopWatchingTransfer();
                                    this.downloadProgress = null;
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
