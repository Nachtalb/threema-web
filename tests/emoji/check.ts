/**
 * Check the emoji helpers against the real data, since a broken codepoint
 * mapping is invisible until a message renders wrong.
 *
 *     bunx tsx tools/emoji/check.ts
 */
import {emojify, parseEmoji, shortnamesStartingWith, shortnameToUtf8} from '../../src/helpers/emoji';

let failures = 0;

function check(what: string, actual: unknown, expected: unknown): void {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) {
        failures += 1;
        console.error(`FAIL ${what}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
    } else {
        console.log(`ok   ${what}`);
    }
}

// Shortnames resolve, including the tone suffixes the picker emits
check('shortnameToUtf8(grinning)', shortnameToUtf8('grinning'), '\u{1F600}');
check('shortnameToUtf8(GRINNING) is case insensitive', shortnameToUtf8('GRINNING'), '\u{1F600}');
check('shortnameToUtf8(wave_tone3)', shortnameToUtf8('wave_tone3'), '\u{1F44B}\u{1F3FD}');
check('shortnameToUtf8(nonsense)', shortnameToUtf8('definitely_not_an_emoji'), null);

// The autocomplete strip
const suggestions = shortnamesStartingWith('grin', 3);
check('shortnamesStartingWith(grin) count', suggestions.length, 3);
check('shortnamesStartingWith(grin) all match',
    suggestions.every((name) => name.startsWith('grin')), true);

// Parsing splits text from emoji and finds an image for each
const tokens = parseEmoji('hi \u{1F600} there \u2764\uFE0F');
check('parseEmoji token count', tokens.length, 4);
check('parseEmoji keeps leading text', tokens[0], 'hi ');
check('parseEmoji finds an image', (tokens[1] as threema.EmojiInfo).imgPath, 'emoji/img/1f600.png');
check('parseEmoji keeps the variation selector',
    (tokens[3] as threema.EmojiInfo).imgPath, 'emoji/img/2764-fe0f.png');

// Keycaps are the awkward case: the file name is zero padded
const keycap = parseEmoji('2\uFE0F\u20E3')[0] as threema.EmojiInfo;
check('parseEmoji keycap', keycap.imgPath, 'emoji/img/0032-fe0f-20e3.png');

// Skin tones carry through to their own image
const toned = parseEmoji('\u{1F44B}\u{1F3FD}')[0] as threema.EmojiInfo;
check('parseEmoji skin tone', toned.imgPath, 'emoji/img/1f44b-1f3fd.png');

// And the whole thing renders to an <img> the compose area understands
check('emojify', emojify('\u{1F600}'),
    '<img class="em" draggable="false" alt="\u{1F600}" src="emoji/img/1f600.png" data-c="1f600">');

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
