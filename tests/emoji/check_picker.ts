/**
 * Every shortname the picker offers must resolve, or clicking that emoji
 * inserts nothing.
 */
import * as fs from 'fs';
import * as path from 'path';
import {parseEmoji, shortnameToUtf8} from '../../src/helpers/emoji';

const picker = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'partials', 'emoji-picker.html'), 'utf8');

const shortnames = [...picker.matchAll(/data-s=":([^"]+):"/g)].map((m) => m[1]);
const images = [...picker.matchAll(/src="emoji\/img\/([^"]+)"/g)].map((m) => m[1]);
const imgDir = path.join(__dirname, '..', '..', 'public', 'emoji', 'img');

const unresolved = shortnames.filter((name) => shortnameToUtf8(name) === null);
const missingArt = images.filter((file) => !fs.existsSync(path.join(imgDir, file)));

// Every emoji in the picker must also render back to an image
const unrenderable: string[] = [];
for (const name of shortnames) {
    const emoji = shortnameToUtf8(name);
    if (emoji === null) {
        continue;
    }
    const tokens = parseEmoji(emoji);
    if (tokens.length !== 1 || typeof tokens[0] === 'string') {
        unrenderable.push(name);
    }
}

console.log(`picker offers      ${shortnames.length} shortnames`);
console.log(`unresolved         ${unresolved.length} ${unresolved.slice(0, 5).join(' ')}`);
console.log(`unrenderable       ${unrenderable.length} ${unrenderable.slice(0, 5).join(' ')}`);
console.log(`tab icons missing  ${missingArt.length} ${missingArt.slice(0, 5).join(' ')}`);

const failed = unresolved.length + unrenderable.length + missingArt.length;
console.log(failed === 0 ? '\nall picker entries resolve and render' : `\n${failed} problem(s)`);
process.exit(failed === 0 ? 0 : 1);
