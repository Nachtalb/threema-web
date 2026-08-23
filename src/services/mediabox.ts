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

/**
 * This service is responsible for showing / hiding the media box.
 */
export class MediaboxService {
    /**
     * This event is triggered every time the media element changes.
     *
     * The boolean parameter indicates whether media content is available or not.
     */
    public evtMediaChanged = new AsyncEvent<boolean>();

    /**
     * Everything the box needs to show one item, and to walk to the next.
     */
    public data: ArrayBuffer | null = null;
    public caption: string = '';
    public filename: string = '';
    public mimetype: string = '';

    /**
     * A picture to show while the real thing is still downloading.
     */
    public previewUrl: string | null = null;
    public loading: boolean = false;

    /**
     * How far the download has got, 0..1, or null when the size is not known.
     */
    public progress: number | null = null;

    /**
     * Bytes received so far, for when the size is not known and a percentage
     * cannot be worked out.
     */
    public received: number = 0;

    /**
     * How to reach the media either side of the one on show, so the box can
     * be paged through without knowing anything about conversations.
     */
    public loadNeighbour: ((forward: boolean) => void) | null = null;
    public hasNeighbour: ((forward: boolean) => boolean) | null = null;

    /**
     * The message the shown media belongs to, so the box can jump back to it.
     */
    public messageId: string | null = null;

    /**
     * Whether the box is on screen. A download still in flight must not put
     * it back up once the user has closed it.
     */
    public isOpen: boolean = false;

    /**
     * Open the box straight away on the thumbnail, before the full media has
     * arrived. Keeps clicking a picture from feeling slow.
     *
     * `loading` drives the spinner, and stays off until the wait is long
     * enough to be worth mentioning.
     */
    public setPending(previewUrl: string | null, caption: string, loading: boolean = true) {
        this.data = null;
        this.filename = '';
        this.mimetype = '';
        this.caption = caption;
        this.previewUrl = previewUrl;
        this.loading = loading;
        this.progress = null;
        this.isOpen = true;
        this.evtMediaChanged.post(true);
    }

    /**
     * How far the current download has got. Called as bytes arrive, so it does
     * not go through the change event.
     */
    public setProgress(fraction: number | null, received: number = 0) {
        this.progress = fraction;
        this.received = received;
    }

    /**
     * Update media data.
     */
    public setMedia(data: ArrayBuffer, filename: string, mimetype: string, caption: string) {
        this.data = data;
        this.filename = filename;
        this.mimetype = mimetype;
        this.caption = caption;
        this.previewUrl = null;
        this.loading = false;
        this.progress = null;
        this.isOpen = true;
        this.evtMediaChanged.post(data !== null);
    }

    /**
     * Clear media data.
     */
    public clearMedia() {
        this.dismiss();
        this.evtMediaChanged.post(false);
    }

    /**
     * The user shut the box. Same as clearing it, but without an event, which
     * the box has no use for having closed itself.
     */
    public dismiss() {
        this.data = null;
        this.filename = '';
        this.mimetype = '';
        this.caption = '';
        this.previewUrl = null;
        this.loading = false;
        this.loadNeighbour = null;
        this.hasNeighbour = null;
        this.messageId = null;
        this.isOpen = false;
    }

}
