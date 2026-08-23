/**
 * The ':' suggestions: what a bare colon offers, and how a prefix narrows it.
 */
import {shortnamesStartingWith, shortnameToUtf8, utf8ToShortname} from '../../src/helpers/emoji';

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

// A bare ':' offers the first category, not an alphabetical jumble
const bare = shortnamesStartingWith('', 5);
check('bare ":" starts at the first category', bare[0], 'grinning');
check('bare ":" keeps picker order', bare, ['grinning', 'smiley', 'smile', 'grin', 'laughing']);

// A prefix narrows, and every hit really starts with it
const grin = shortnamesStartingWith('grin', 10);
check('prefix filters', grin.every((n) => n.startsWith('grin')), true);
check('prefix finds the obvious one', grin.includes('grinning'), true);

// Single letter works too; the old code needed two
const single = shortnamesStartingWith('p', 5);
check('single letter offers something', single.length, 5);
check('single letter filters', single.every((n) => n.startsWith('p')), true);

// The round trip a recently used entry makes
check('utf8ToShortname round trip', utf8ToShortname(shortnameToUtf8('pizza')), 'pizza');
check('utf8ToShortname on an unknown string', utf8ToShortname('nope'), null);

// Recently used entries must resolve back to a name the suggestions can show
for (const emoji of ['\u{1F600}', '\u2764\uFE0F', '\u{1F355}']) {
    const name = utf8ToShortname(emoji);
    check(`recent ${emoji} has a name`, typeof name === 'string' && name.length > 0, true);
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
