/**
 * The day separator must skip messages that carry no date. The unread marker
 * is inserted locally without one, and rendering it produced
 * "NaN. date.month_short.undefined NaN".
 */

// The rule as implemented in ConversationController.startsNewDayFor
function startsNewDayFor(messages: Array<{date?: number}>, index: number): boolean {
    const message = messages[index];
    if (message === undefined || message.date === undefined || message.date === null) {
        return false;
    }
    const previous = messages[index - 1];
    if (previous === undefined) {
        return true;
    }
    const day = (of: {date?: number}) => {
        const date = new Date(of.date * 1000);
        return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
    };
    for (let at = index - 1; at >= 0; at--) {
        const earlier = messages[at];
        if (earlier.date !== undefined && earlier.date !== null) {
            return day(earlier) !== day(message);
        }
    }
    return true;
}

let failures = 0;

function check(what: string, actual: unknown, expected: unknown): void {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        failures += 1;
        console.error(`FAIL ${what}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
    } else {
        console.log(`ok   ${what}`);
    }
}

const MONDAY = Math.floor(new Date('2026-08-17T10:00:00Z').getTime() / 1000);
const LATER = MONDAY + 60;
const TUESDAY = Math.floor(new Date('2026-08-18T10:00:00Z').getTime() / 1000);

check('the first message opens a day', startsNewDayFor([{date: MONDAY}], 0), true);
check('same day does not', startsNewDayFor([{date: MONDAY}, {date: LATER}], 1), false);
check('a new day does', startsNewDayFor([{date: MONDAY}, {date: TUESDAY}], 1), true);

// The unread marker: no date of its own, and it must not hide a real boundary
const withMarker = [{date: MONDAY}, {}, {date: TUESDAY}];
check('the marker itself never opens a day', startsNewDayFor(withMarker, 1), false);
check('a boundary across the marker still shows', startsNewDayFor(withMarker, 2), true);

const sameDayMarker = [{date: MONDAY}, {}, {date: LATER}];
check('no boundary across the marker on one day', startsNewDayFor(sameDayMarker, 2), false);

// A marker at the very top leaves the first real message opening the day
check('marker first, message still opens the day', startsNewDayFor([{}, {date: MONDAY}], 1), true);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
