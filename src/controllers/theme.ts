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

import {Logger} from 'ts-log';

import {LogService} from '../services/log';
import {ThemeService} from '../services/theme';
import {SettingsService} from '../services/settings'

/**
 * This controller handles theming.
 */
export class ThemeController {
    // Logging
    private readonly log: Logger;

    // Theme name
    public theme: string;

    // Background class
    public backgroundClass: string;

    // 'dark' while the dark scheme applies, empty otherwise
    public darkClass: string;

    public static $inject = ['$scope', 'LogService', 'ThemeService', 'SettingsService'];
    constructor($scope, logService: LogService, themeService: ThemeService, settingsService: SettingsService) {
        // Logging
        this.log = logService.getLogger('Theme-C', 'color: #000; background-color: #ffff99');

        // Initialize theme
        this.theme = themeService.theme;

        // Listen to theme changes
        themeService.evtThemeChange.attach((newTheme: threema.Theme) => {
            this.log.debug(`Updating theme: ${this.theme} -> ${newTheme}`);
            $scope.$apply(() => this.theme = newTheme);
        });

        // Set background class
        this.backgroundClass = ThemeController.getBackgroundClass(settingsService.background.getBlur());

        // Listen to background blur changes
        settingsService.backgroundBlurChange.attach((blur: boolean) => {
            $scope.$apply(() => this.backgroundClass = ThemeController.getBackgroundClass(blur));
        })

        // Colour scheme, which may follow the system
        this.darkClass = settingsService.appearance.prefersDark() ? 'dark' : '';
        settingsService.colourSchemeChange.attach(() => {
            $scope.$apply(() => {
                this.darkClass = settingsService.appearance.prefersDark() ? 'dark' : '';
            });
        });

        // Follow the system while it is what the setting asks for
        const system = window.matchMedia('(prefers-color-scheme: dark)');
        system.addEventListener('change', () => {
            if (settingsService.appearance.getColourScheme() === 'system') {
                $scope.$apply(() => {
                    this.darkClass = settingsService.appearance.prefersDark() ? 'dark' : '';
                });
            }
        });
    }

    private static getBackgroundClass(blur: boolean): string {
        return blur ? '' : 'background-sharp';
    }
}
