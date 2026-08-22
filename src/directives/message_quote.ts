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

import {hexToU8a, u8aToBase64} from '../helpers';
import {WebClientService} from '../services/webclient';

// tslint:disable:max-line-length

export default [
    'WebClientService',
    function(webClientService: WebClientService) {
        return {
            restrict: 'EA',
            scope: {},
            bindToController: {
                quote: '=eeeQuote',
            },
            controllerAs: 'ctrl',
            controller: [function() {
                this.contact = () => webClientService.contacts.get(this.quote.identity);

                /**
                 * Look up the quoted message in the DOM.
                 *
                 * A quote references the original by its Threema message id,
                 * which iOS also reports as the message id, only base64
                 * encoded. Android reports a local database id instead, which
                 * a quote cannot be resolved against at all.
                 */
                const findQuoted = (messageId: string): HTMLElement | null => {
                    const direct = document.getElementById(`message-${messageId}`);
                    if (direct !== null) {
                        return direct;
                    }
                    try {
                        return document.getElementById(`message-${u8aToBase64(hexToU8a(messageId))}`);
                    } catch {
                        return null;
                    }
                };

                /**
                 * Return whether the quoted message can be jumped to. It may
                 * be out of reach because it is not loaded, or because the
                 * connected device does not report resolvable message ids.
                 */
                this.canJump = () => findQuoted(this.quote.messageId) !== null;

                /**
                 * Scroll to the quoted message and flash it, so it is obvious
                 * which one was jumped to.
                 */
                this.jumpToQuoted = () => {
                    const target = findQuoted(this.quote.messageId);
                    if (target === null) {
                        return;
                    }
                    target.scrollIntoView({behavior: 'smooth', block: 'center'});

                    const message = target.querySelector('.message');
                    if (message === null) {
                        return;
                    }
                    // Restart the animation if the same message is hit twice
                    message.classList.remove('message-flash');
                    const reflow = (message as HTMLElement).offsetWidth;
                    if (reflow >= 0) {
                        message.classList.add('message-flash');
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
