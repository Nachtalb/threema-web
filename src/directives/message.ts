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

// tslint:disable:max-line-length

import {saveAs} from 'file-saver';

import {firefoxWorkaroundPdfDownload, hasValue} from '../helpers';
import * as clipboard from '../helpers/clipboard';
import {BrowserInfo} from '../helpers/browser_info';
import {getSenderIdentity} from '../helpers/messages';
import {BrowserService} from '../services/browser';
import {LogService} from '../services/log';
import {MessageService} from '../services/message';
import {ReceiverService} from '../services/receiver';
import {WebClientService} from '../services/webclient';
import {hasAckDecReactions} from './message_group_reactions';
import {hasMetaInfo} from './message_meta';
import {hasEmojiReactions} from './message_emoji_reactions';

export default [
    'BrowserService',
    'LogService',
    'MessageService',
    'ReceiverService',
    'WebClientService',
    '$mdDialog',
    '$mdToast',
    '$translate',
    '$rootScope',
    function(browserService: BrowserService,
             logService: LogService,
             messageService: MessageService,
             receiverService: ReceiverService,
             webClientService: WebClientService,
             $mdDialog: ng.material.IDialogService,
             $mdToast: ng.material.IToastService,
             $translate: ng.translate.ITranslateService,
             $rootScope: ng.IRootScopeService) {
        const log = logService.getLogger('Message-C');
        return {
            restrict: 'E',
            scope: {},
            bindToController: {
                type: '=eeeType',
                receiver: '=eeeReceiver',
                message: '=eeeMessage',
                previousMessage: '=?eeePreviousMessage',
                nextMessage: '=?eeeNextMessage',
                resolution: '=?eeeResolution',
            },
            controllerAs: 'ctrl',
            controller: [function() {
                // Determine browser
                this.browserInfo = browserService.getBrowser();

                this.$onInit = function() {

                    // Defaults and variables
                    if (this.resolution == null) {
                        this.resolution = 'low';
                    }

                    // Find contact
                    this.contact = webClientService.contacts.get(
                        getSenderIdentity(this.message, webClientService.me.id),
                    );

                    // Show...
                    this.isStatusMessage = this.message.isStatus;
                    this.isContactMessage = !this.message.isStatus
                        && webClientService.contacts.has(getSenderIdentity(this.message, webClientService.me.id));
                    this.isGroup = this.type as threema.ReceiverType === 'group';
                    this.isContact = this.type as threema.ReceiverType === 'contact';
                    this.isBusinessReceiver = receiverService.isBusinessContact(this.receiver);
                    this.isEdited = hasValue(this.message.lastEditedAt);

                    this.showName = !this.message.isOutbox && this.isGroup;
                    // Only the last message of a run by the same sender gets a
                    // tail, so a burst reads as one block. The corners facing
                    // a neighbour in the run are tightened instead.
                    const sameSender = (other) =>
                        hasValue(other)
                        && other.isStatus !== true
                        && other.isOutbox === this.message.isOutbox
                        && getSenderIdentity(other, webClientService.me.id)
                            === getSenderIdentity(this.message, webClientService.me.id);
                    this.followsSameSender = sameSender(this.previousMessage);
                    this.precedesSameSender = sameSender(this.nextMessage);
                    this.showTail = !this.precedesSameSender;
                    // The avatar belongs to the tail, at the bottom of the run
                    this.showAvatar = this.showName && this.showTail;
                    this.showText = this.message.type === 'text' || this.message.caption;
                    this.showMedia = this.message.type !== 'text';
                    this.showState = messageService.showStatusIcon(this.message as threema.Message, this.receiver);
                    this.showGroupReactions =
                        !webClientService.appCapabilities.emojiReactions && this.isGroup
                        && webClientService.appCapabilities.groupReactions && hasAckDecReactions(this.message);
                    this.showEmojiReactions = webClientService.appCapabilities.emojiReactions && hasEmojiReactions(this.message);
                    this.hasMetaInfo = hasMetaInfo(this.message);
                    this.showQuote = this.message.quote !== undefined;
                    this.showVoipInfo = this.message.type === 'voipStatus';

                    this.access = messageService.getAccess(
                        this.message,
                        this.receiver,
                        webClientService.appCapabilities,
                        webClientService.me.id,
                    );

                    this.ack = (ack: boolean) => {
                        webClientService.ackMessage(this.receiver, this.message, ack);
                    };

                    this.quote = () => {
                        // set message as quoted
                        webClientService.setQuote(this.receiver, this.message);
                    };

                    this.delete = (ev) => {
                        const confirm = $mdDialog.confirm()
                            .title($translate.instant('messenger.CONFIRM_DELETE_TITLE'))
                            .textContent($translate.instant('common.ARE_YOU_SURE'))
                            .targetEvent(ev)
                            .ok($translate.instant('common.YES'))
                            .cancel($translate.instant('common.CANCEL'));
                        $mdDialog.show(confirm).then((result) => {
                            webClientService.deleteMessage(this.receiver, this.message);
                        }, () => { /* do nothing */});
                    };

                    this.copyToClipboard = (ev: MouseEvent) => {
                        // Get copyable text
                        const text = messageService.getQuoteText(this.message);
                        if (text === null) {
                            return;
                        }

                        // Copy to clipboard
                        let toastString = 'messenger.COPIED';
                        try {
                            clipboard.copyString(text, (this.browserInfo as BrowserInfo).isSafari());
                        } catch (error) {
                            log.warn('Could not copy text to clipboard:', error);
                            toastString = 'messenger.COPY_ERROR';
                        }

                        // Show toast
                        const toast = $mdToast.simple()
                            .textContent($translate.instant(toastString))
                            .position('bottom center');
                        $mdToast.show(toast);
                    };

                    this.download = (ev) => {
                        this.downloading = true;
                        webClientService.requestBlob(this.message.id, this.receiver)
                            .then((blobInfo: threema.BlobInfo) => {
                                $rootScope.$apply(() => {
                                    this.downloading = false;

                                    switch (this.message.type) {
                                        case 'image':
                                        case 'video':
                                        case 'file':
                                        case 'audio':
                                            saveAs(
                                                new Blob(
                                                    [blobInfo.buffer],
                                                    {type: firefoxWorkaroundPdfDownload(blobInfo.mimetype)},
                                                ),
                                                blobInfo.filename
                                            );
                                            break;
                                        default:
                                            log.warn('Ignored download request for message type', this.message.type);
                                    }
                                });
                            })
                            .catch((error) => {
                                // TODO: Handle this properly / show an error message
                                log.error(`Error downloading blob: ${error}`);
                                this.downloading = false;
                            });
                    };

                    this.isDownloading = () => {
                        return this.downloading;
                    };

                    this.showHistory = (ev) => {
                        // Shown inside the context menu rather than as a
                        // dialog, so the menu is not torn down.
                        if (ev !== undefined) {
                            ev.stopPropagation();
                        }
                        this.detailsOpen = true;
                    };

                    this.hideHistory = (ev) => {
                        if (ev !== undefined) {
                            ev.stopPropagation();
                        }
                        this.detailsOpen = false;
                    };
                };
            }],
            link: function(scope: any, element: ng.IAugmentedJQuery, attrs) {
                // Prevent status messages from being draggable
                const domElement: HTMLElement = element[0];
                if (scope.ctrl.isStatusMessage) {
                    domElement.ondragstart = () => false;
                }
            },
            templateUrl: 'directives/message.html',
        };
    },
];
