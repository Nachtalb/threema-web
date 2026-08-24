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
 * The emoji picker: search, sections, skin tones and the recently used row.
 *
 * The compose area and the caption input both drive the same picker, so the
 * behaviour lives here rather than in either of them. What differs between the
 * two — where a chosen emoji goes, and where focus returns — is passed in.
 */

import {isActionTrigger} from '../helpers';
import {SettingsService} from '../services/settings';
import {isKeyboardEvent} from '../typeguards';

/** Where the picker delivers what it was asked for. */
export interface EmojiPickerHost {
    /** Put the chosen emoji wherever the host is writing. */
    insert(emoji: string): void;
    /** The picker asked to be closed, e.g. with escape. */
    close(): void;
}

/** The height of a section heading, which sticks while its section scrolls. */
const HEADING_HEIGHT = 26;

/**
 * Drives one picker element. Attach on open, detach on close: the handlers are
 * bound to the element's children, which the caller may throw away in between.
 */
export class EmojiPicker {
    private readonly picker: Element;
    private readonly settingsService: SettingsService;
    private readonly host: EmojiPickerHost;
    private readonly searchPlaceholder: string;

    // The emoji under the keyboard cursor
    private focused: HTMLElement | null = null;

    private readonly onEmojiClick = (ev: Event) => this.onEmojiChosen(ev);
    private readonly onSectionClick = (ev: Event) => this.onSectionSelected(ev as MouseEvent);
    private readonly onSkintone = (ev: Event) => this.onSkintoneSelected(ev);
    private readonly onKeyDown = (ev: KeyboardEvent) => this.handleKeyDown(ev);
    private readonly onScroll = () => this.markCurrentSection();

    constructor(
        picker: Element,
        settingsService: SettingsService,
        host: EmojiPickerHost,
        searchPlaceholder: string,
    ) {
        this.picker = picker;
        this.settingsService = settingsService;
        this.host = host;
        this.searchPlaceholder = searchPlaceholder;
    }

    /** Wire the picker up and show what was used recently. */
    public attach(): void {
        this.addSearch();
        this.fillRecentSection();

        this.picker.querySelectorAll('.content .em').forEach(
            (em) => em.addEventListener('click', this.onEmojiClick));
        this.picker.querySelectorAll('.tabs button').forEach(
            (button) => button.addEventListener('click', this.onSectionClick));
        this.picker.querySelectorAll('.skins img').forEach((img) => {
            img.addEventListener('click', this.onSkintone);
            img.addEventListener('keydown', this.onSkintone);
        });

        const content = this.picker.querySelector('.content');
        content.addEventListener('keydown', this.onKeyDown);
        content.addEventListener('scroll', this.onScroll);
        this.markCurrentSection();

        this.focusSearch();
    }

    /** Unbind everything and forget the last search. */
    public detach(): void {
        this.picker.querySelectorAll('.content .em').forEach(
            (em) => em.removeEventListener('click', this.onEmojiClick));
        this.picker.querySelectorAll('.tabs button').forEach(
            (button) => button.removeEventListener('click', this.onSectionClick));
        this.picker.querySelectorAll('.skins img').forEach((img) => {
            img.removeEventListener('click', this.onSkintone);
            img.removeEventListener('keydown', this.onSkintone);
        });

        const content = this.picker.querySelector('.content');
        content.removeEventListener('keydown', this.onKeyDown);
        content.removeEventListener('scroll', this.onScroll);
        this.setFocused(null);

        // Reopen on the full list rather than the last search
        const search = this.picker.querySelector('.emoji-search') as HTMLInputElement;
        if (search !== null && search.value !== '') {
            search.value = '';
            this.applySearch('');
        }
    }

    /** Put the caret in the search box, so typing filters straight away. */
    public focusSearch(): void {
        const search = this.picker.querySelector('.emoji-search') as HTMLInputElement;
        if (search !== null) {
            search.focus();
        }
    }

    /** Walk the grid with the arrow keys and pick with enter. */
    public handleKeyDown(ev: KeyboardEvent): void {
        const emoji = this.visibleEmoji();
        if (emoji.length === 0) {
            return;
        }

        const at = this.focused === null ? -1 : emoji.indexOf(this.focused);
        const step = (to: number) => {
            ev.preventDefault();
            this.setFocused(emoji[Math.max(0, Math.min(to, emoji.length - 1))]);
        };

        switch (ev.key) {
            case 'ArrowRight':
                step(at + 1);
                break;
            case 'ArrowLeft':
                step(at - 1);
                break;
            case 'ArrowDown':
            case 'ArrowUp':
                ev.preventDefault();
                this.stepRow(emoji, at, ev.key === 'ArrowDown');
                break;
            case 'Enter':
            case ' ':
                if (this.focused !== null) {
                    ev.preventDefault();
                    this.pick(this.focused);
                }
                break;
            case 'Escape':
                ev.preventDefault();
                this.host.close();
                break;
            default:
                break;
        }
    }

    /**
     * Move a row at a time. The rows wrap, so the emoji below is the first one
     * further down that is at least as far along as this one. Running off
     * either end lands on the last emoji in that direction.
     */
    private stepRow(emoji: HTMLElement[], at: number, down: boolean): void {
        if (at === -1) {
            this.setFocused(emoji[0]);
            return;
        }
        const from = emoji[at].getBoundingClientRect();
        for (let i = down ? at + 1 : at - 1; down ? i < emoji.length : i >= 0; down ? i++ : i--) {
            const box = emoji[i].getBoundingClientRect();
            if (box.top !== from.top && (down ? box.left >= from.left : box.left <= from.left)) {
                this.setFocused(emoji[i]);
                return;
            }
        }
        this.setFocused(emoji[down ? emoji.length - 1 : 0]);
    }

    private setFocused(em: HTMLElement | null): void {
        if (this.focused !== null) {
            this.focused.classList.remove('focused');
        }
        this.focused = em;
        if (em !== null) {
            em.classList.add('focused');
            em.scrollIntoView({block: 'nearest'});
        }
    }

    /** The emoji on screen, in the order they are laid out. */
    private visibleEmoji(): HTMLElement[] {
        return Array.from(this.picker.querySelectorAll('.content .em'))
            .filter((em: HTMLElement) => em.offsetParent !== null) as HTMLElement[];
    }

    private onEmojiChosen(ev: Event): void {
        if (ev.type !== 'click' && !(isKeyboardEvent(ev) && isActionTrigger(ev))) {
            return;
        }
        ev.stopPropagation();
        if (isKeyboardEvent(ev)) {
            ev.preventDefault();
        }
        this.pick(ev.target as Element);
    }

    private pick(em: Element): void {
        const emoji = em.textContent;
        this.host.insert(emoji);
        this.settingsService.emoji.addRecent(emoji);
    }

    /** A section icon is clicked: scroll to it rather than swapping lists. */
    private onSectionSelected(ev: MouseEvent): void {
        ev.stopPropagation();
        const button = (ev.target as Element).closest('button');
        if (button === null) {
            return;
        }
        const content = this.picker.querySelector('.content') as HTMLElement;
        // The section, not its heading: a stuck heading reports where it is
        // pinned rather than where it belongs.
        const section = this.picker.querySelector(
            `.section[data-section="${button.getAttribute('data-section')}"]`) as HTMLElement;
        if (section !== null) {
            content.scrollTop = section.offsetTop - HEADING_HEIGHT;
            this.markCurrentSection();
        }
    }

    private onSkintoneSelected(ev: Event): void {
        if (ev.type !== 'click' && !(isKeyboardEvent(ev) && isActionTrigger(ev))) {
            return;
        }
        ev.stopPropagation();
        if (isKeyboardEvent(ev)) {
            ev.preventDefault();
        }
        this.picker.setAttribute('data-skintone', (ev.target as Element).getAttribute('data-tone'));
    }

    /** Mark the tab of whichever section is at the top of the list. */
    private markCurrentSection(): void {
        const content = this.picker.querySelector('.content');
        const top = content.getBoundingClientRect().top;
        let current = null;
        // The headings stick, so compare their sections' extent rather than the
        // headings themselves. A section counts as current once its heading has
        // reached the top.
        Array.from(this.picker.querySelectorAll('.section')).forEach((section: HTMLElement) => {
            if (section.hidden) {
                return;
            }
            const box = section.getBoundingClientRect();
            if (box.top - top <= HEADING_HEIGHT && box.bottom - top > HEADING_HEIGHT) {
                current = section.getAttribute('data-section');
            }
        });
        Array.from(this.picker.querySelectorAll('.tabs button')).forEach((button: Element) => {
            button.classList.toggle('current', button.getAttribute('data-section') === current);
        });
    }

    /** Rebuild the recently used row from what has been picked. */
    private fillRecentSection(): void {
        const section = this.picker.querySelector('.section-recent') as HTMLElement;
        const heading = this.picker.querySelector(
            '.category-name[data-section="recent"]') as HTMLElement;
        const recent = this.settingsService.emoji.getRecent();
        section.innerHTML = '';
        section.hidden = recent.length === 0;
        heading.hidden = recent.length === 0;
        for (const emoji of recent) {
            const source = this.picker.querySelector(
                `.section:not(.section-recent) .em[data-c="${codepointOf(emoji)}"]`);
            if (source === null) {
                continue;
            }
            const copy = source.cloneNode(true) as HTMLElement;
            // The tone filter would hide a copy that carries one
            copy.removeAttribute('data-t');
            section.appendChild(copy);
        }
    }

    /**
     * Filter the emoji by their shortcode, e.g. ":smirk:". Separators are
     * ignored, so "flag_ch" and "flagch" both find ":flag-ch:".
     */
    private applySearch(needle: string): void {
        const term = needle.trim().toLowerCase().replace(/[-_\s:]/g, '');
        this.picker.classList.toggle('searching', term !== '');
        // The recently used row holds copies of emoji that also sit in their
        // own category, so a match would show up twice.
        const seen = new Set<string>();
        Array.from(this.picker.querySelectorAll('.content .em')).forEach((em: Element) => {
            const shortcode = (em.getAttribute('data-s') || '').toLowerCase().replace(/[-_\s:]/g, '');
            const codepoint = em.getAttribute('data-c') || '';
            const matches = term !== '' && shortcode.includes(term) && !seen.has(codepoint);
            if (matches) {
                seen.add(codepoint);
            }
            em.classList.toggle('search-hidden', term !== '' && !matches);
        });
        // The best match is ready for enter, no arrows needed
        this.setFocused(term === '' ? null : this.visibleEmoji()[0] ?? null);
    }

    /**
     * A search box above the emoji, added here because the picker markup does
     * not carry one.
     */
    private addSearch(): void {
        if (this.picker.querySelector('.emoji-search') !== null) {
            return;
        }
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'emoji-search';
        search.setAttribute('aria-label', 'Search emoji');
        search.placeholder = this.searchPlaceholder;
        search.addEventListener('input', () => this.applySearch(search.value));
        // Typing must not reach the host's own key handling, but the arrows and
        // enter still walk the results rather than moving the caret in the box.
        search.addEventListener('keydown', (ev) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape']
                    .includes(ev.key)) {
                ev.preventDefault();
                this.handleKeyDown(ev);
                return;
            }
            // Ctrl+. still closes the picker from in here
            if (ev.key === '.' && ev.ctrlKey) {
                return;
            }
            ev.stopPropagation();
        });
        this.picker.insertBefore(search, this.picker.querySelector('.content'));
    }
}

/** The codepoint an emoji is stored under in the picker. */
function codepointOf(emoji: string): string {
    return [...emoji].map((c) => c.codePointAt(0).toString(16)).join('-');
}
