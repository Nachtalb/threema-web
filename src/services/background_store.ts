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
 * Stores a background picture the user picked themselves.
 *
 * IndexedDB rather than local storage: a photo runs to several megabytes,
 * well past the ~5MB local storage holds for the whole origin, and it takes
 * a blob directly instead of base64.
 */
export class BackgroundStoreService {
    private static readonly DB_NAME = 'threema-background';
    private static readonly STORE = 'image';
    private static readonly KEY = 'custom';

    private open(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(BackgroundStoreService.DB_NAME, 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore(BackgroundStoreService.STORE);
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    private transact<T>(
        mode: IDBTransactionMode,
        run: (store: IDBObjectStore) => IDBRequest<T>,
    ): Promise<T> {
        return this.open().then((db) => new Promise<T>((resolve, reject) => {
            const request = run(
                db.transaction(BackgroundStoreService.STORE, mode)
                    .objectStore(BackgroundStoreService.STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }));
    }

    /**
     * The stored picture, or null when the random defaults are in use.
     */
    public async get(): Promise<Blob | null> {
        try {
            const blob = await this.transact<Blob>(
                'readonly', (store) => store.get(BackgroundStoreService.KEY));
            return blob === undefined ? null : blob;
        } catch (error) {
            return null;
        }
    }

    public async set(blob: Blob): Promise<void> {
        await this.transact(
            'readwrite', (store) => store.put(blob, BackgroundStoreService.KEY));
    }

    public async clear(): Promise<void> {
        try {
            await this.transact(
                'readwrite', (store) => store.delete(BackgroundStoreService.KEY));
        } catch (error) {
            // Nothing stored; the defaults are already in use
        }
    }
}
