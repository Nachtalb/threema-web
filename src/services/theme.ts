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

import {AsyncEvent} from 'ts-events';
import {Logger} from 'ts-log';

import {LogService} from './log';
import {SettingsService} from './settings';

export class ThemeService {
    // Angular services
    private $interval: ng.IIntervalService;

    // Logging
    private readonly log: Logger;

    // Events
    public evtThemeChange = new AsyncEvent<threema.Theme>();

    // Private attributes
    private _theme: threema.Theme = threema.Theme.Regular;

    public static $inject = ['$interval', 'LogService', 'SettingsService'];
    constructor($interval: ng.IIntervalService, logService: LogService,
                private readonly settingsService: SettingsService) {
        this.$interval = $interval;
        this.log = logService.getLogger('Theme-S', 'color: #fff; background-color: #cc9900');

        // The stylesheet follows the colour scheme on its own, but the
        // angular-material theme is a class applied from here, so anything
        // already on screen has to be told when the scheme changes.
        settingsService.colourSchemeChange.attach(() => this.evtThemeChange.post(this._theme));

        // ... including when the system flips while the setting follows it.
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const onSchemeChange = () => {
            if (settingsService.appearance.getColourScheme() === 'system') {
                this.evtThemeChange.post(this._theme);
            }
        };
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', onSchemeChange);
        } else {
            // Safari below 14 only has the deprecated API
            media.addListener(onSchemeChange);
        }

        this.log.debug(`Initializing with theme ${this.theme}`);
    }

    /**
     * Return the current theme.
     */
    public get theme(): threema.Theme {
        return this._theme;
    }

    /**
     * The angular-material theme to draw with, which is the brand theme plus
     * its dark variant when the dark scheme applies.
     *
     * Every md-theme in the app resolves through here, so the naming lives in
     * one place.
     */
    public get materialTheme(): string {
        const scheme = this.settingsService.appearance.getColourScheme();
        const dark = scheme === 'system'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : scheme === 'dark';
        return dark ? `${this._theme}dark` : this._theme;
    }

    /**
     * Change the theme.
     */
    public changeTheme(theme: threema.Theme) {
        this._theme = theme;
        this.evtThemeChange.post(theme);
    }
}
