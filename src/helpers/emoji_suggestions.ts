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
 * Emoji shortcode suggestions for a plain text input.
 *
 * The compose area has its own version of this built on the compose-area
 * library's caret handling. A bare `<input>` has none of that, so the word
 * under the caret is worked out from the value and the selection instead.
 */

import {emojify, shortnamesStartingWith, shortnameToUtf8, utf8ToShortname} from './emoji';
import {SettingsService} from '../services/settings';

const SUGGESTION_LIMIT = 12;

/** The shortcode being typed, and where it sits in the value. */
interface Needle {
    text: string;
    from: number;
    to: number;
}

/**
 * Watches an input for `:shortcode` and offers matching emoji in a strip above
 * it. Call `destroy()` when the input goes away.
 */
export class EmojiSuggestions {
    private readonly input: HTMLInputElement;
    private readonly settingsService: SettingsService;
    /** Told what the value became, so the host can update its model. */
    private readonly onInsert: (value: string, caret: number) => void;

    private strip: HTMLElement | null = null;
    private suggestions: string[] = [];
    private index = 0;
    // What the strip was last built for, so an unchanged word does not rebuild
    // it and throw away the selection the arrows just moved
    private needle: string | null = null;

    private readonly onInput = () => this.update();
    private readonly onKeyDown = (ev: KeyboardEvent) => this.handleKeyDown(ev);
    private readonly onBlur = () => this.hide();

    constructor(
        input: HTMLInputElement,
        settingsService: SettingsService,
        onInsert: (value: string, caret: number) => void,
    ) {
        this.input = input;
        this.settingsService = settingsService;
        this.onInsert = onInsert;

        input.addEventListener('input', this.onInput);
        input.addEventListener('keydown', this.onKeyDown);
        input.addEventListener('blur', this.onBlur);
    }

    public destroy(): void {
        this.input.removeEventListener('input', this.onInput);
        this.input.removeEventListener('keydown', this.onKeyDown);
        this.input.removeEventListener('blur', this.onBlur);
        this.hide();
    }

    /** Whether the strip is showing, and so owns enter and the arrows. */
    public isOpen(): boolean {
        return this.strip !== null;
    }

    /** The strip takes the arrows, enter and escape while it is showing. */
    private handleKeyDown(ev: KeyboardEvent): void {
        if (this.strip === null) {
            return;
        }
        switch (ev.key) {
            case 'ArrowRight':
                ev.preventDefault();
                this.index = Math.min(this.index + 1, this.suggestions.length - 1);
                this.render();
                break;
            case 'ArrowLeft':
                ev.preventDefault();
                this.index = Math.max(this.index - 1, 0);
                this.render();
                break;
            case 'Enter':
            case 'Tab':
                ev.preventDefault();
                // Enter would otherwise send the file
                ev.stopPropagation();
                this.insert(this.suggestions[this.index]);
                break;
            case 'Escape':
                ev.preventDefault();
                ev.stopPropagation();
                this.hide();
                break;
            default:
                break;
        }
    }

    /** The `:shortcode` the caret sits in, if any. */
    private wordAtCaret(): Needle | null {
        const caret = this.input.selectionStart;
        if (caret === null || caret !== this.input.selectionEnd) {
            return null;
        }
        const value = this.input.value;
        let from = caret;
        while (from > 0 && !/\s/.test(value[from - 1])) {
            from--;
        }
        let to = caret;
        while (to < value.length && !/\s/.test(value[to])) {
            to++;
        }
        const text = value.slice(from, to);
        // A lone ':' opens the list; a closing one means the shortcode is
        // finished and is replaced by `completeShortcode` instead.
        if (!text.startsWith(':') || (text.length > 1 && text.endsWith(':'))) {
            return null;
        }
        return {text: text.slice(1).toLowerCase(), from: from, to: to};
    }

    /**
     * Offer emoji whose shortcode starts with what has been typed after a ':'.
     * A bare ':' opens with the ones picked most recently.
     */
    private update(): void {
        this.completeShortcode();

        const word = this.wordAtCaret();
        if (word === null) {
            this.hide();
            return;
        }
        if (word.text === this.needle && this.strip !== null) {
            return;
        }
        this.needle = word.text;

        const recent = this.settingsService.emoji.getRecent()
            .map((emoji) => utf8ToShortname(emoji))
            .filter((name) => name !== null && name.startsWith(word.text));
        const rest = shortnamesStartingWith(word.text, SUGGESTION_LIMIT + recent.length)
            .filter((name) => !recent.includes(name));
        this.suggestions = [...recent, ...rest].slice(0, SUGGESTION_LIMIT);

        if (this.suggestions.length === 0) {
            this.hide();
            return;
        }
        this.index = 0;
        this.render();
    }

    /** Turn a finished `:shortcode:` into its emoji as soon as it is closed. */
    private completeShortcode(): void {
        const caret = this.input.selectionStart;
        if (caret === null) {
            return;
        }
        const value = this.input.value;
        let from = caret;
        while (from > 0 && !/\s/.test(value[from - 1])) {
            from--;
        }
        const typed = value.slice(from, caret);
        if (typed.length <= 2 || !typed.startsWith(':') || !typed.endsWith(':')) {
            return;
        }
        const emoji = shortnameToUtf8(typed.slice(1, -1));
        if (emoji === null) {
            return;
        }
        this.replace(from, caret, emoji);
        this.hide();
    }

    private insert(shortname: string): void {
        const word = this.wordAtCaret();
        const emoji = shortnameToUtf8(shortname);
        if (word === null || emoji === null) {
            this.hide();
            return;
        }
        this.replace(word.from, word.to, emoji);
        this.settingsService.emoji.addRecent(emoji);
        this.hide();
    }

    private replace(from: number, to: number, emoji: string): void {
        const value = this.input.value.slice(0, from) + emoji + this.input.value.slice(to);
        const caret = from + emoji.length;
        this.input.value = value;
        this.input.setSelectionRange(caret, caret);
        this.onInsert(value, caret);
    }

    private render(): void {
        if (this.strip === null) {
            this.strip = document.createElement('div');
            this.strip.className = 'emoji-suggestions';
            this.input.parentElement.appendChild(this.strip);
        }
        this.strip.innerHTML = '';
        this.suggestions.forEach((shortname, at) => {
            const item = document.createElement('span');
            item.className = 'suggestion' + (at === this.index ? ' selected' : '');
            // The picker's art, not the system font
            item.innerHTML = emojify(shortnameToUtf8(shortname));
            item.title = `:${shortname}:`;
            item.addEventListener('mousedown', (ev) => {
                // Keeps the caret where it is, so the word is still there
                ev.preventDefault();
                this.insert(shortname);
            });
            this.strip.appendChild(item);
        });
        const selected = this.strip.children[this.index];
        if (selected !== undefined) {
            (selected as HTMLElement).scrollIntoView({block: 'nearest', inline: 'nearest'});
        }
    }

    private hide(): void {
        if (this.strip !== null) {
            this.strip.remove();
            this.strip = null;
        }
        this.suggestions = [];
        this.index = 0;
        this.needle = null;
    }
}
