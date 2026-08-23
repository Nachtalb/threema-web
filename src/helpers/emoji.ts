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
 * Emoji rendering, backed by iamcal's emoji-js and the Apple image set.
 *
 * The library owns the awkward parts: which codepoint maps to which image
 * file, zero-padded keycaps, skin tone variants and the shortname index.
 */
import EmojiConvertor from 'emoji-js';

const converter = new EmojiConvertor();
converter.img_set = 'apple';
converter.img_sets.apple.path = 'emoji/img/';
converter.allow_native = false;
converter.replace_mode = 'img';
converter.include_title = true;
converter.allow_caps = true;

/**
 * The same data, but rendering to the characters themselves rather than to
 * images. Used to resolve shortnames the library spells differently than the
 * picker does.
 */
const toNative = new EmojiConvertor();
toNative.allow_native = true;
toNative.replace_mode = 'unified';
toNative.allow_caps = true;

/**
 * The library's own matcher, built from the same data it renders from, so the
 * two can never disagree about which sequences are emoji.
 */
const EMOJI_REGEX: RegExp = (() => {
    converter.init_unified();
    return converter.rx_unified;
})();

/**
 * Every shortname the library knows, bare and without the surrounding colons.
 * Built once; the data does not change at runtime.
 */
const SHORTNAMES: Map<string, string> = (() => {
    const names = new Map<string, string>();
    for (const codepoint of Object.keys(converter.data)) {
        const entry = converter.data[codepoint];
        const emoji = entry[0][0];
        for (const shortname of entry[3]) {
            names.set(shortname, emoji);
        }
    }
    return names;
})();

/**
 * The image file for an emoji, or `null` when the library does not know it.
 */
function imagePath(emoji: string): string | null {
    // The library renders a full <img> tag; we only want its source
    const rendered = converter.replace_unified(emoji);
    const match = /src="([^"]+)"/.exec(rendered);
    return match === null ? null : match[1];
}

/**
 * The codepoint an image file was built from, e.g. `1f9df-200d-2640-fe0f`.
 */
function codepointOf(path: string): string {
    return path.substring(path.lastIndexOf('/') + 1).replace(/\.png$/, '');
}

/**
 * Convert emoji unicode characters to images.
 */
export function emojify(text: string): string {
    const tokens = parseEmoji(text);
    let output = '';
    for (const token of tokens) {
        if (isEmojiInfo(token)) {
            output += `<img class="em" draggable="false" `;
            output += `alt="${token.emojiString}" src="${token.imgPath}" data-c="${token.codepoint}">`;
        } else {
            // Plain text
            output += token;
        }
    }
    return output;
}

function isEmojiInfo(token: threema.EmojiInfo | string): token is threema.EmojiInfo {
    return typeof token !== 'string';
}

/**
 * Convert emoji unicode characters to structured EmojiInfo objects.
 */
export function parseEmoji(text: string): (threema.EmojiInfo | string)[] {
    const result: (threema.EmojiInfo | string)[] = [];
    const regex = new RegExp(EMOJI_REGEX.source, 'g');

    let match: RegExpExecArray | null;
    let endIndex = 0;

    // tslint:disable-next-line:no-conditional-assignment
    while ((match = regex.exec(text)) !== null) {
        const emoji = match[0];
        const startIndex = regex.lastIndex - emoji.length;

        if (endIndex < startIndex) {
            result.push(text.substring(endIndex, startIndex));
        }
        endIndex = regex.lastIndex;

        const path = imagePath(emoji);
        if (path === null) {
            // Not in the image set; leave it as the character itself
            result.push(emoji);
        } else {
            result.push({
                emojiString: emoji,
                imgPath: path,
                codepoint: codepointOf(path),
            });
        }
    }

    if (endIndex < text.length) {
        result.push(text.substring(endIndex));
    }

    return result;
}

/**
 * Translate a shortname to UTF8.
 *
 * If the shortname is unknown, `null` will be returned.
 *
 * Case will be ignored (the input will be converted to lowercase).
 */
export function shortnameToUtf8(shortname: string): string | null {
    const name = shortname.toLowerCase();
    const direct = SHORTNAMES.get(name);
    if (direct !== undefined) {
        return direct;
    }

    // The picker names skin tones `wave_tone3`; the library addresses them as
    // `:wave::skin-tone-4:`, counting the toneless variant as the first.
    const toned = /^(.+)_tone([1-5])$/.exec(name);
    if (toned === null || !SHORTNAMES.has(toned[1])) {
        return null;
    }
    const rendered = toNative.replace_colons(`:${toned[1]}::skin-tone-${Number(toned[2]) + 1}:`);
    return rendered.startsWith(':') ? null : rendered;
}

/**
 * The shortnames starting with the given text, e.g. "smi" for "smile".
 *
 * Names come back bare, without the surrounding colons, which is what
 * `shortnameToUtf8` expects.
 */
export function shortnamesStartingWith(prefix: string, limit: number): string[] {
    const needle = prefix.toLowerCase();
    const found: string[] = [];
    for (const shortname of SHORTNAMES.keys()) {
        if (shortname.startsWith(needle)) {
            found.push(shortname);
            if (found.length === limit) {
                break;
            }
        }
    }
    return found;
}

/**
 * Enlarge 1-3 emoji.
 */
const pattern = /<img class="em([" ])([^>]*>)/g;
const singleEmojiThreshold = 3;
const singleEmojiClassName = 'large-emoji';
export function enlargeSingleEmoji(text: string, enlarge: boolean = false): string {
    if (!enlarge) {
        return text;
    }
    const matches = text.match(pattern);
    if (matches != null && matches.length >= 1 && matches.length <= singleEmojiThreshold) {
        if (text.replace(pattern, '').length === 0) {
            text = text.replace(pattern, '<img class="em ' + singleEmojiClassName + '$1$2');
        }
    }
    return text;
}
