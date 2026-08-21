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

import {hasValue} from '../helpers';

// Extend global APIs
declare global {
    interface Window {
        AppDataStore: {
            setValue: (key: string, value: unknown) => void;
            getValue: (key: string) => unknown;
        }
    }
}

/**
 * Stores the session password for the lifetime of the app.
 *
 * The desktop app provides the AppDataStore API. In a browser, sessionStorage
 * is used instead: it survives a reload but is cleared when the tab is closed.
 */
export class InMemorySession {
    private static SESSION_PASSWORD_STORAGE_KEY = 'inMemorySessionPassword';

    public storeAvailable(): boolean {
        return hasValue(window.AppDataStore) || this.sessionStorageAvailable();
    }

    /**
     * sessionStorage may be unavailable if the user blocked storage access,
     * in which case accessing the property throws.
     */
    private sessionStorageAvailable(): boolean {
        try {
            return hasValue(window.sessionStorage);
        } catch (error) {
            return false;
        }
    }

    public getPassword(): string | undefined {
        if (hasValue(window.AppDataStore)) {
            const sessionPassword = window.AppDataStore.getValue(InMemorySession.SESSION_PASSWORD_STORAGE_KEY);
            return typeof sessionPassword === 'string' ? sessionPassword : undefined;
        }
        if (!this.sessionStorageAvailable()) {
            return undefined;
        }
        const stored = window.sessionStorage.getItem(InMemorySession.SESSION_PASSWORD_STORAGE_KEY);
        return stored === null ? undefined : stored;
    }

    public setPassword(password: string) {
        if (hasValue(window.AppDataStore)) {
            window.AppDataStore.setValue(InMemorySession.SESSION_PASSWORD_STORAGE_KEY, password);
            return;
        }
        if (!this.sessionStorageAvailable()) {
            return;
        }
        if (password === undefined) {
            window.sessionStorage.removeItem(InMemorySession.SESSION_PASSWORD_STORAGE_KEY);
        } else {
            window.sessionStorage.setItem(InMemorySession.SESSION_PASSWORD_STORAGE_KEY, password);
        }
    }

    public clearPassword() {
        this.setPassword(undefined);
    }
}
