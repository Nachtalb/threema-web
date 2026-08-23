/**
 * When the ':' shortcode strip should appear. A lone ':' must open it; a
 * closed shortcode like ':smile:' must not, because that gets replaced with
 * the emoji instead.
 */

// The rule as implemented in updateSuggestions
function offersSuggestions(typed: string): boolean {
    return typed.startsWith(':') && !(typed.length > 1 && typed.endsWith(':'));
}

let failures = 0;

function check(what: string, actual: unknown, expected: unknown): void {
    if (actual !== expected) {
        failures += 1;
        console.error(`FAIL ${what}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
    } else {
        console.log(`ok   ${what}`);
    }
}

check('a lone ":" opens the strip', offersSuggestions(':'), true);
check('":s" opens it', offersSuggestions(':s'), true);
check('":smi" opens it', offersSuggestions(':smi'), true);
check('a closed ":smile:" does not', offersSuggestions(':smile:'), false);
check('"::" does not', offersSuggestions('::'), false);
check('plain text does not', offersSuggestions('hello'), false);
check('an empty word does not', offersSuggestions(''), false);
check('a trailing colon mid-word does not', offersSuggestions(':a:'), false);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
