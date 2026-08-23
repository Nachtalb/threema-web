/**
 * Separator-insensitive shortname search: `flag-ch` must be found by
 * `flag_ch`, `flag ch` and `flagch` alike.
 */
import {shortnamesStartingWith, shortnameToUtf8} from '../../src/helpers/emoji';

let failures = 0;

function check(what: string, actual: unknown, expected: unknown): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures += 1;
        console.error(`FAIL ${what}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
    } else {
        console.log(`ok   ${what}`);
    }
}

const SWISS = shortnameToUtf8('flag-ch');
check('the flag exists at all', typeof SWISS === 'string' && SWISS.length > 0, true);

// Resolving a name, whichever separator was typed
check('flag_ch resolves', shortnameToUtf8('flag_ch'), SWISS);
check('flag ch resolves', shortnameToUtf8('flag ch'), SWISS);
check('flagch resolves', shortnameToUtf8('flagch'), SWISS);
check('FLAG_CH resolves', shortnameToUtf8('FLAG_CH'), SWISS);

// The suggestion list finds it the same ways
for (const typed of ['flag-c', 'flag_c', 'flag c', 'flagc']) {
    const hits = shortnamesStartingWith(typed, 40);
    check(`"${typed}" suggests flag-ch`, hits.includes('flag-ch'), true);
}

// An exact prefix still wins the top spot
const exact = shortnamesStartingWith('flag-ch', 5);
check('an exact match comes first', exact[0], 'flag-ch');

// The looser match must not swamp a plain prefix search
const smile = shortnamesStartingWith('smi', 10);
check('a plain prefix still works', smile.every((n) => n.replace(/[-_]/g, '').startsWith('smi')), true);

// Names with an underscore work the other way round too
const CAT = shortnameToUtf8('joy_cat');
check('joy-cat finds joy_cat', shortnameToUtf8('joy-cat'), CAT);
check('joycat finds joy_cat', shortnameToUtf8('joycat'), CAT);

// Nonsense still resolves to nothing
check('nonsense stays null', shortnameToUtf8('definitely not an emoji'), null);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
