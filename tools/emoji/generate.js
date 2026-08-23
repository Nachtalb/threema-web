#!/usr/bin/env node
/**
 * Generate the emoji picker and its spritesheet stylesheet.
 *
 * The data and the images come from `emoji-datasource-apple`; the codepoint
 * and sheet arithmetic comes from `emoji-js`, so none of it is reimplemented
 * here. This only decides the order and emits markup.
 *
 * Run from the repository root:
 *
 *     node tools/emoji/generate.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PKG = path.join(ROOT, 'node_modules', 'emoji-datasource-apple');
const EmojiConvertor = require(path.join(ROOT, 'node_modules', 'emoji-js'));

const categories = JSON.parse(fs.readFileSync(path.join(PKG, 'categories.json')));
const data = JSON.parse(fs.readFileSync(path.join(PKG, 'emoji.json')));
const converter = new EmojiConvertor();

// The sections, in order. `categories.json` splits smileys from people and
// adds a `Component` group of bare skin-tone swatches, which are not pickable.
const SECTIONS = [
    {id: 'people', name: 'Smileys &amp; People', icon: 'smile', from: ['Smileys & Emotion', 'People & Body']},
    {id: 'nature', name: 'Animals &amp; Nature', icon: 'dog', from: ['Animals & Nature']},
    {id: 'food', name: 'Food &amp; Drink', icon: 'hamburger', from: ['Food & Drink']},
    {id: 'activity', name: 'Activity', icon: 'soccer', from: ['Activities']},
    {id: 'travel', name: 'Travel &amp; Places', icon: 'airplane', from: ['Travel & Places']},
    {id: 'objects', name: 'Objects', icon: 'bulb', from: ['Objects']},
    {id: 'symbols', name: 'Symbols', icon: 'heart', from: ['Symbols']},
    {id: 'flags', name: 'Flags', icon: 'checkered_flag', from: ['Flags']},
];

const TONES = ['1F3FB', '1F3FC', '1F3FD', '1F3FE', '1F3FF'];
const TONE_NAMES = ['Light Skin Tone', 'Medium-Light Skin Tone', 'Medium Skin Tone',
    'Medium-Dark Skin Tone', 'Dark Skin Tone'];

const byShortname = new Map();
for (const entry of data) {
    for (const name of entry.short_names) {
        if (!byShortname.has(name)) {
            byShortname.set(name, entry);
        }
    }
}

/** The character an entry stands for. */
function char(unified) {
    return unified.split('-').map((p) => String.fromCodePoint(parseInt(p, 16))).join('');
}

/** The css class carrying this emoji's place on the spritesheet. */
function spriteClass(unified) {
    return 'em-' + unified.toLowerCase();
}

// Every emoji that ends up on the sheet, so the stylesheet can be written
const sheetCells = new Map();
function remember(unified, x, y) {
    sheetCells.set(unified.toLowerCase(), [x, y]);
}

function escapeAttribute(value) {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * One emoji in the grid. The span holds the character itself, which the
 * compose area reads back out of `textContent` when it is picked; the sprite
 * is drawn as its background.
 */
function span(unified, shortname, tone) {
    const attributes = [
        `class="em ${spriteClass(unified)}"`,
        'role="option"',
        'tabindex="-1"',
        `data-c="${unified.toLowerCase()}"`,
        `data-s=":${escapeAttribute(shortname)}:"`,
        `title=":${escapeAttribute(shortname)}:"`,
    ];
    if (tone !== undefined) {
        attributes.push(`data-t="${tone}"`);
    }
    return `        <span ${attributes.join(' ')}>${char(unified)}</span>`;
}

const lines = ['<div class="twemoji-picker" data-skintone="0">'];

// A row of section icons. Clicking one scrolls its section into view; the
// list itself is continuous.
lines.push('    <div class="tabs">');
lines.push('        <button type="button" class="tab-recent" data-section="recent" '
    + 'title="Recently used" aria-label="Recently used">'
    + '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">'
    + '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>'
    + '<path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round"/></svg></button>');
for (const section of SECTIONS) {
    const icon = byShortname.get(section.icon);
    lines.push(`        <button type="button" data-section="${section.id}" `
        + `title="${section.name}" aria-label="${section.name}">`
        + `<img src="emoji/img/${icon.image}" alt="${section.name}" height="22" width="22"></button>`);
}
lines.push('    </div>');

lines.push('    <div class="content" role="listbox" tabindex="0">');

// Filled in at runtime from what has actually been picked
lines.push('        <h3 class="category-name" data-section="recent" hidden>Recently used</h3>');
lines.push('        <div class="section section-recent" data-section="recent" hidden></div>');

for (const section of SECTIONS) {
    lines.push(`        <h3 class="category-name" data-section="${section.id}">${section.name}</h3>`);
    lines.push(`        <div class="section" data-section="${section.id}">`);

    for (const source of section.from) {
        for (const shortnames of Object.values(categories[source])) {
            for (const shortname of shortnames) {
                const entry = byShortname.get(shortname);
                if (entry === undefined || !entry.has_img_apple) {
                    continue;
                }
                remember(entry.unified, entry.sheet_x, entry.sheet_y);

                // Only offer a tone switch when every tone is drawn
                const variations = entry.skin_variations || {};
                const tones = TONES
                    .map((tone) => variations[tone])
                    .filter((variant) => variant !== undefined && variant.has_img_apple);
                const toned = tones.length === TONES.length;

                lines.push(span(entry.unified, entry.short_name, toned ? 0 : undefined));
                if (toned) {
                    tones.forEach((variant, i) => {
                        remember(variant.unified, variant.sheet_x, variant.sheet_y);
                        lines.push(span(variant.unified, `${entry.short_name}_tone${i + 1}`, i + 1));
                    });
                }
            }
        }
    }

    lines.push('        </div>');
}
lines.push('    </div>');

// The skin tone swatches, drawn from the hand that carries every tone
const hand = byShortname.get('raised_back_of_hand');
lines.push('    <div class="skins">');
lines.push(`        <img src="emoji/img/${hand.image}" width="22" height="22" data-tone="0" `
    + 'title="No Skin Tone" role="option" tabindex="0">');
TONES.forEach((tone, i) => {
    const variant = hand.skin_variations[tone];
    lines.push(`        <img src="emoji/img/${variant.image}" width="22" height="22" data-tone="${i + 1}" `
        + `title="${TONE_NAMES[i]}" role="option" tabindex="0">`);
});
lines.push('    </div>');
lines.push('</div>');

fs.writeFileSync(path.join(ROOT, 'src', 'partials', 'emoji-picker.html'), lines.join('\n') + '\n');

// --- the spritesheet stylesheet -----------------------------------------
// `sheet_size` is the grid's width in cells; emoji-js positions a cell by
// stepping across the remaining ones.
const steps = converter.sheet_size - 1;
const css = [
    '/* Generated by tools/emoji/generate.js. Do not edit. */',
    '.twemoji-picker .em {',
    '    background-image: url(sheet.png);',
    '    background-repeat: no-repeat;',
    `    background-size: ${converter.sheet_size * 100}%;`,
    '}',
    '',
];
for (const [unified, [x, y]] of [...sheetCells].sort()) {
    css.push(`.${spriteClass(unified)} { background-position: ${(x / steps * 100).toFixed(4)}% `
        + `${(y / steps * 100).toFixed(4)}%; }`);
}
fs.writeFileSync(path.join(ROOT, 'public', 'emoji', 'sheet.css'), css.join('\n') + '\n');

// --- the shortname order, for the ':' suggestions -----------------------
// emoji-js carries no category information, so the order comes from the same
// pass that builds the picker.
const order = [];
for (const section of SECTIONS) {
    for (const source of section.from) {
        for (const shortnames of Object.values(categories[source])) {
            for (const shortname of shortnames) {
                const entry = byShortname.get(shortname);
                if (entry !== undefined && entry.has_img_apple) {
                    order.push(entry.short_name);
                }
            }
        }
    }
}
const orderTs = [
    '/**',
    ' * This file is part of Threema Web.',
    ' *',
    ' * Threema Web is free software: you can redistribute it and/or modify it',
    ' * under the terms of the GNU Affero General Public License as published by',
    ' * the Free Software Foundation, either version 3 of the License, or (at',
    ' * your option) any later version.',
    ' *',
    ' * This program is distributed in the hope that it will be useful, but',
    ' * WITHOUT ANY WARRANTY; without even the implied warranty of',
    ' * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero',
    ' * General Public License for more details.',
    ' *',
    ' * You should have received a copy of the GNU Affero General Public License',
    ' * along with Threema Web. If not, see <http://www.gnu.org/licenses/>.',
    ' */',
    '',
    '/**',
    ' * Generated by tools/emoji/generate.js. Do not edit.',
    ' *',
    ' * The shortnames in the order the picker lists them, so a bare ":" offers',
    ' * the first category rather than an alphabetical jumble.',
    ' */',
    'export const SHORTNAME_ORDER: string[] = [',
    ...order.map((name) => `    '${name}',`),
    '];',
];
fs.writeFileSync(path.join(ROOT, 'src', 'helpers', 'emoji_order.ts'), orderTs.join('\n') + '\n');

console.log('picker  src/partials/emoji-picker.html');
console.log(`order   src/helpers/emoji_order.ts  (${order.length} shortnames)`);
console.log(`sheet   public/emoji/sheet.css  (${sheetCells.size} emoji, ${converter.sheet_size} cells wide)`);

