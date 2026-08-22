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

/**
 * Remembers which conversation was open and whether the profile sidebar was
 * showing, so a reload lands back where it left off.
 *
 * Kept in sessionStorage: closing the tab should forget it, just like the
 * session password.
 */
export class NavigationStateService {
    private static readonly KEY_CONVERSATION = 'nav-conversation';
    private static readonly KEY_DETAIL_OPEN = 'nav-detail-open';

    private readonly storage: Storage;

    public static $inject = ['$window'];
    constructor($window: ng.IWindowService) {
        this.storage = $window.sessionStorage;
    }

    public setConversation(type: string, id: string): void {
        this.storage.setItem(NavigationStateService.KEY_CONVERSATION, `${type}/${id}`);
    }

    public getConversation(): {type: string, id: string} | null {
        const value = this.storage.getItem(NavigationStateService.KEY_CONVERSATION);
        if (value === null) {
            return null;
        }
        const separator = value.indexOf('/');
        if (separator < 1) {
            return null;
        }
        return {type: value.substring(0, separator), id: value.substring(separator + 1)};
    }

    public clearConversation(): void {
        this.storage.removeItem(NavigationStateService.KEY_CONVERSATION);
    }

    public setDetailOpen(open: boolean): void {
        this.storage.setItem(NavigationStateService.KEY_DETAIL_OPEN, open ? 'true' : 'false');
    }

    public isDetailOpen(): boolean {
        return this.storage.getItem(NavigationStateService.KEY_DETAIL_OPEN) === 'true';
    }
}
