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
import {AsyncEvent} from 'ts-events';

import {LogService} from './log';

class ComposeAreaSettings {
    private readonly settingsService: SettingsService;

    constructor(settingsService: SettingsService) {
        this.settingsService = settingsService;
    }

    public getSubmitKey(): threema.ComposeAreaSubmitKey {
        return this.parseSubmitKey(this.settingsService.retrieveUntrustedKeyValuePair('submitKey', false));
    }

    public setSubmitKey(submitKey: string | threema.ComposeAreaSubmitKey): void {
        this.settingsService.storeUntrustedKeyValuePair('submitKey', this.parseSubmitKey(submitKey).toString());
    }

    private parseSubmitKey(submitKey: any): threema.ComposeAreaSubmitKey {
        try {
            submitKey = parseInt(submitKey, 10);
        } catch {
            // Ignored
        }
        switch (submitKey) {
            case threema.ComposeAreaSubmitKey.Enter: // fallthrough
            case threema.ComposeAreaSubmitKey.CtrlEnter:
                // Valid
                return submitKey;
            default:
                // Invalid or not set. Fall back to 'Enter'.
                return threema.ComposeAreaSubmitKey.Enter;
        }
    }
}

class BackgroundSettings {
    private readonly settingsService: SettingsService;

    constructor(settingsService: SettingsService) {
        this.settingsService = settingsService;
    }

    public getBlur(): boolean {
        return this.settingsService.retrieveUntrustedKeyValuePair('backgroundBlur', false) !== 'false';
    }

    public setBlur(blur: boolean): void {
        this.settingsService.storeUntrustedKeyValuePair('backgroundBlur', blur ? 'true' : 'false');

        // Swap to the variant matching the new setting. The blurred default
        // uses a smaller, more heavily compressed image.
        const image = document.getElementById('background-image') as HTMLImageElement | null;
        if (image !== null && image.src !== '') {
            const base = image.src.replace(/\.sharp\.avif$/, '.avif');
            image.src = blur ? base : base.replace(/\.avif$/, '.sharp.avif');
        }

        // Emit change
        this.settingsService.backgroundBlurChange.post(blur);
    }
}

class MediaSettings {
    private readonly settingsService: SettingsService;

    constructor(settingsService: SettingsService) {
        this.settingsService = settingsService;
    }

    public getAutoLoadGifs(): boolean {
        return this.settingsService.retrieveUntrustedKeyValuePair('autoLoadGifs', false) !== 'false';
    }

    public setAutoLoadGifs(enabled: boolean): void {
        this.settingsService.storeUntrustedKeyValuePair('autoLoadGifs', enabled ? 'true' : 'false');
    }

    public getCacheMedia(): boolean {
        return this.settingsService.retrieveUntrustedKeyValuePair('cacheMedia', false) !== 'false';
    }

    public setCacheMedia(enabled: boolean): void {
        this.settingsService.storeUntrustedKeyValuePair('cacheMedia', enabled ? 'true' : 'false');
        this.settingsService.cacheMediaChange.post(enabled);
    }
}

class NotificationSettings {
    private readonly settingsService: SettingsService;

    constructor(settingsService: SettingsService) {
        this.settingsService = settingsService;
    }

    public getNotifyReactions(): boolean {
        return this.settingsService.retrieveUntrustedKeyValuePair('notifyReactions', false) !== 'false';
    }

    public setNotifyReactions(enabled: boolean): void {
        this.settingsService.storeUntrustedKeyValuePair('notifyReactions', enabled ? 'true' : 'false');
    }
}

/**
 * The settings service can update variables for settings and persist them to
 * LocalStorage.
 */
export class SettingsService {
    public readonly settingsChangedEvent = new AsyncEvent<void>();
    private static STORAGE_KEY_PREFIX = 'settings-';
    public readonly composeArea: ComposeAreaSettings;
    public readonly background: BackgroundSettings;
    public readonly media: MediaSettings;
    public readonly notifications: NotificationSettings;
    private readonly log: Logger;
    private storage: Storage;

    // Events
    public backgroundBlurChange = new AsyncEvent<boolean>();
    public cacheMediaChange = new AsyncEvent<boolean>();

    public static $inject = ['$window', 'LogService'];
    constructor($window: ng.IWindowService, logService: LogService) {
        this.log = logService.getLogger('Settings-S');
        this.storage = $window.localStorage;
        this.composeArea = new ComposeAreaSettings(this);
        this.background = new BackgroundSettings(this);
        this.media = new MediaSettings(this);
        this.notifications = new NotificationSettings(this);
    }

    /**
     * Store settings key-value pair in LocalStorage.
     */
    public storeUntrustedKeyValuePair(key: string, value: string): void {
        this.log.debug('Storing settings key:', key);
        this.storage.setItem(SettingsService.STORAGE_KEY_PREFIX + key, value);
        this.settingsChangedEvent.post();
    }

    /**
     * Retrieve settings key-value pair from LocalStorage.
     *
     * If the `alwaysCreate` flag is set to `true`, then the key is created
     * with an empty value if it does not yet exist.
     */
    public retrieveUntrustedKeyValuePair(key: string, alwaysCreate: boolean = true): string {
        this.log.debug('Retrieving settings key:', key);
        if (this.hasUntrustedKeyValuePair(key)) {
            return this.storage.getItem(SettingsService.STORAGE_KEY_PREFIX + key);
        } else {
            if (alwaysCreate) {
                this.storeUntrustedKeyValuePair(key, '');
            }
            return '';
        }
    }

    /**
     * Remove settings key-value pair from LocalStorage if it exists.
     */
    public removeUntrustedKeyValuePair(key: string): void {
        this.log.debug('Removing settings key:', key);
        this.storage.removeItem(SettingsService.STORAGE_KEY_PREFIX + key);
        this.settingsChangedEvent.post();
    }

    /**
     * Return whether key-value pair is present in LocalStorage.
     *
     * Note that this will return `true` for empty values!
     */
    private hasUntrustedKeyValuePair(key: string): boolean {
        const item: string = this.storage.getItem(SettingsService.STORAGE_KEY_PREFIX + key);
        return item !== null;
    }
}
