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

import {hexToU8a, jumpToMessage, u8aToBase64} from '../helpers';
import {MessageService} from '../services/message';
import {WebClientService} from '../services/webclient';

// tslint:disable:max-line-length

export default [
    'MessageService',
    'WebClientService',
    function(messageService: MessageService, webClientService: WebClientService) {
        return {
            restrict: 'EA',
            scope: {},
            bindToController: {
                quote: '=eeeQuote',
                receiver: '=?eeeReceiver',
                message: '=?eeeMessage',
            },
            controllerAs: 'ctrl',
            controller: [function() {
                this.contact = () => webClientService.contacts.get(this.quote.identity);

                /**
                 * Resolve the quoted message by its id.
                 *
                 * iOS reports the Threema message id as the message id, base64
                 * encoded, so the hex id a quote carries has to be converted.
                 */
                const findById = (messageId: string): threema.Message | null => {
                    if (this.receiver === undefined) {
                        return null;
                    }
                    const candidates = [messageId];
                    try {
                        candidates.push(u8aToBase64(hexToU8a(messageId)));
                    } catch { /* not hex, only try it verbatim */ }
                    for (const message of webClientService.messages.getList(this.receiver)) {
                        if (candidates.indexOf(message.id) !== -1) {
                            return message;
                        }
                    }
                    return null;
                };

                /**
                 * Resolve the quoted message by its content.
                 *
                 * Android reports a local database id rather than the Threema
                 * message id, so a quote cannot be resolved by id at all
                 * there. The quoted text and its author are known though,
                 * which identifies the message in practice.
                 */
                const findByContent = (): threema.Message | null => {
                    if (this.receiver === undefined || this.message === undefined) {
                        return null;
                    }
                    const wanted = this.quote.text;
                    if (wanted === undefined || wanted === null || wanted.length === 0) {
                        return null;
                    }
                    const me = webClientService.me.id;
                    let match: threema.Message | null = null;
                    for (const message of webClientService.messages.getList(this.receiver)) {
                        // Only look at messages older than the quoting one
                        if (message.sortKey >= this.message.sortKey) {
                            break;
                        }
                        const identity = message.isOutbox ? me : message.partnerId;
                        if (identity !== this.quote.identity) {
                            continue;
                        }
                        if (messageService.getQuoteText(message) !== wanted) {
                            continue;
                        }
                        // Keep looking; the newest match before the quote wins
                        match = message;
                    }
                    return match;
                };

                const findQuoted = (): threema.Message | null => {
                    const message = findById(this.quote.messageId) ?? findByContent();
                    return message !== null && document.getElementById(`message-${message.id}`) !== null
                        ? message
                        : null;
                };

                /**
                 * Return whether the quoted message is currently reachable. It
                 * may not be loaded, or may be too old to still be in the
                 * conversation.
                 */
                this.canJump = () => findQuoted() !== null;

                this.jumpToQuoted = () => {
                    const message = findQuoted();
                    if (message !== null) {
                        jumpToMessage(message.id);
                    }
                };
            }],
            template: `
                <div class="message-quote-content" ng-style="{'border-color': ctrl.contact().color}" role="blockquote"
                     ng-class="{jumpable: ctrl.canJump()}" ng-click="ctrl.jumpToQuoted()">
                    <span class="message-name" ng-style="{'color': ctrl.contact().color}"
                        ng-bind-html="ctrl.contact().displayName | escapeHtml | emojify"></span>
                    <span class="message-quote" ng-bind-html="ctrl.quote.text | escapeHtml | markify | emojify | linkify | mentionify | nlToBr"></span>
                </div>
            `,
        };
    },
];
