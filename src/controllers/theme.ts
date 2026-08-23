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

import {SettingsService} from '../services/settings'
import {ThemeService} from '../services/theme';

/**
 * This controller handles theming.
 */
export class ThemeController {
    // Theme name, as registered with angular-material
    public theme: string;

    // Background class
    public backgroundClass: string;

    // 'scheme-light' or 'scheme-dark' when the setting overrides the system,
    // empty while it follows it
    public schemeClass: string;

    private readonly settingsService: SettingsService;
    private readonly themeService: ThemeService;

    public static $inject = ['$scope', 'ThemeService', 'SettingsService'];
    constructor($scope, themeService: ThemeService, settingsService: SettingsService) {
        this.settingsService = settingsService;
        this.themeService = themeService;

        // Listen to theme changes. ThemeService posts this for a brand change
        // and for a colour scheme change alike, including when the system
        // flips while the setting follows it.
        themeService.evtThemeChange.attach(() => {
            $scope.$apply(() => this.applyScheme());
        });

        // Set background class
        this.backgroundClass = ThemeController.getBackgroundClass(settingsService.background.getBlur());

        // Listen to background blur changes
        settingsService.backgroundBlurChange.attach((blur: boolean) => {
            $scope.$apply(() => this.backgroundClass = ThemeController.getBackgroundClass(blur));
        })

        // Colour scheme
        this.applyScheme();
    }

    private applyScheme(): void {
        const scheme = this.settingsService.appearance.getColourScheme();
        this.schemeClass = scheme === 'system' ? '' : `scheme-${scheme}`;
        this.theme = this.themeService.materialTheme;
    }

    private static getBackgroundClass(blur: boolean): string {
        return blur ? '' : 'background-sharp';
    }
}
