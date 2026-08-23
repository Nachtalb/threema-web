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

import {LogService} from './log';
import {SettingsService} from './settings';

/**
 * Keeps downloaded media around so it does not have to be fetched from the
 * phone again after a reload.
 *
 * The Cache API is used rather than session storage: it stores binaries
 * directly instead of base64, and is not capped at a few megabytes. The cache
 * is deleted when the session ends, so nothing outlives the tab.
 */
export class BlobCacheService {
    private static readonly CACHE_NAME = 'threema-blobs';

    private readonly log: Logger;
    private readonly settingsService: SettingsService;

    public static $inject = ['LogService', 'SettingsService'];

    constructor(logService: LogService, settingsService: SettingsService) {
        this.log = logService.getLogger('BlobCache-S');
        this.settingsService = settingsService;
        // Turning the setting off should not leave the old media behind
        this.settingsService.cacheMediaChange.attach((enabled: boolean) => {
            if (!enabled) {
                this.clear().catch((error) => this.log.warn('Could not clear the blob cache: ' + error));
            }
        });
    }

    private get available(): boolean {
        return typeof caches !== 'undefined' && this.settingsService.media.getCacheMedia();
    }

    private static url(key: string): string {
        return `/blob-cache/${encodeURIComponent(key)}`;
    }

    /**
     * The blob stored under this key, if any.
     */
    public async get(key: string): Promise<threema.BlobInfo | null> {
        if (!this.available) {
            return null;
        }
        try {
            const cache = await caches.open(BlobCacheService.CACHE_NAME);
            const response = await cache.match(BlobCacheService.url(key));
            if (response === undefined) {
                return null;
            }
            return {
                buffer: await response.arrayBuffer(),
                mimetype: response.headers.get('content-type') || '',
                filename: response.headers.get('x-filename') || '',
            };
        } catch (error) {
            this.log.warn('Could not read cached blob: ' + error);
            return null;
        }
    }

    /**
     * Keep a blob for the rest of the session.
     */
    public async set(key: string, blobInfo: threema.BlobInfo): Promise<void> {
        if (!this.available) {
            return;
        }
        try {
            const cache = await caches.open(BlobCacheService.CACHE_NAME);
            await cache.put(BlobCacheService.url(key), new Response(blobInfo.buffer, {
                headers: {
                    'content-type': blobInfo.mimetype,
                    'x-filename': blobInfo.filename,
                },
            }));
        } catch (error) {
            // A full disk quota is not worth failing the download over
            this.log.warn('Could not cache blob: ' + error);
        }
    }

    /**
     * Throw everything away, e.g. when the session is deleted.
     */
    public async clear(): Promise<void> {
        // Not gated on the setting: turning it off has to clear what is there
        if (typeof caches === 'undefined') {
            return;
        }
        try {
            await caches.delete(BlobCacheService.CACHE_NAME);
        } catch (error) {
            this.log.warn('Could not clear the blob cache: ' + error);
        }
    }
}
