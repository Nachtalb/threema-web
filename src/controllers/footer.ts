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

import {isActionTrigger} from '../helpers';
import {TroubleshootingController} from './troubleshooting';

/**
 * Handle footer information.
 */
export class FooterController {
    private $mdDialog: ng.material.IDialogService;

    private config: threema.Config;

    public static $inject = ['CONFIG', '$mdDialog'];
    constructor(CONFIG: threema.Config, $mdDialog: ng.material.IDialogService) {
        this.$mdDialog = $mdDialog;
        this.config = CONFIG;
    }

    public showTroubleshooting(ev?: KeyboardEvent): void {
        if (ev !== undefined && !isActionTrigger(ev)) {
            return;
        }
        this.$mdDialog.show({
            controller: TroubleshootingController,
            controllerAs: 'ctrl',
            templateUrl: 'partials/dialog.troubleshooting.html',
            parent: angular.element(document.body),
            clickOutsideToClose: true,
            fullscreen: true,
        });
    }

    /**
     * Return the changelog URL.
     */
    public get changelogUrl(): string {
        return `${this.config.GIT_REPO}/blob/${this.config.GIT_BRANCH}/CHANGELOG.md`;
    }
}
