r"""Add the custom background keys under `settings.ui` in every catalog.

Edits the raw text so the \uXXXX escapes Transifex writes survive untouched.
"""
import glob
import json
import re

KEYS = [
    ('CUSTOM_BACKGROUND', 'Own background'),
    ('CHOOSE_BACKGROUND', 'Choose picture'),
    ('RESET_BACKGROUND', 'Use the default pictures'),
]

added = 0
for path in sorted(glob.glob('public/i18n/*.json')):
    raw = open(path, encoding='utf-8').read()
    if '"CUSTOM_BACKGROUND"' in raw:
        continue

    # Hang the new keys off the existing BACKGROUND_BLUR line
    m = re.search(r'^(\s*)"BACKGROUND_BLUR":\s*(".*?")(,?)$', raw, re.MULTILINE)
    if m is None:
        print('SKIP (no BACKGROUND_BLUR):', path)
        continue

    indent = m.group(1)
    # English fallback until translated; angular-translate has no per-key
    # fallback, so an untranslated key would render as the key itself.
    lines = ''.join(f'\n{indent}"{key}": "{text}",' for key, text in KEYS)
    insert_at = m.start()
    raw = raw[:insert_at] + lines.lstrip('\n') + '\n' + raw[insert_at:]
    open(path, 'w', encoding='utf-8').write(raw)
    added += 1

print('added to', added, 'catalogs')

for path in sorted(glob.glob('public/i18n/*.json')):
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    for key, _ in KEYS:
        assert key in data['settings']['ui'], f'{path}: {key}'
print('all catalogs parse and carry the new keys')
