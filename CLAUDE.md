# CLAUDE.md

Fork of [threema-ch/threema-web](https://github.com/threema-ch/threema-web),
which is in maintenance mode upstream. Default branch is
`hate-driven-development`. Threema Web is a static client-side app: the phone
is the backend, reached over SaltyRTC. There is no server-side account.

TypeScript + AngularJS 1 + angular-material, bundled by webpack.

## Commands

Bun, not npm. `bunx`, not `npx`.

```bash
bun install
bun run devserver        # http://localhost:9966
bun run lint             # tslint
bunx tsc -p tsconfig.json --noEmit
bun run build
```

Verify with both `bun run lint` and `tsc --noEmit`; tslint alone misses type
errors. Filter tsc output to `^src/` — `node_modules/@types/node` produces
unrelated errors that are not ours.

## Conventions

**Commits** — Conventional Commits, subject line only. A body only when it
explains something the diff cannot. Commits are GPG-signed.

**Changelog** — `CHANGELOG.md` has an `Unreleased` section at the top. Only log
changes a user would notice. Something introduced and then fixed within the same
batch of work never existed for anyone; leave it out.

**Comments** — for non-obvious code only. No narration of what the next line
plainly does.

## Translations

23 catalogs in `public/i18n/`, managed by Transifex upstream. Adding or removing
a key means touching all of them.

Do **not** round-trip them through `json.load`/`json.dumps`. The files contain
`\uXXXX` escapes that `ensure_ascii=False` silently expands, producing a
thousand-line diff of unrelated churn. Edit the raw text with a regex over whole
entry lines, then check every file still parses.

New keys fall back to English until translated — angular-translate has no
per-key fallback, so an untranslated key shows the English string, not a missing
one.

## Settings

A setting is four parts:

1. A class in `src/services/settings.ts` with a getter/setter, plus an
   `AsyncEvent` on `SettingsService` if anything needs to react.
2. A `md-switch` in `src/partials/dialog.settings.html`. Toggles, not checkboxes
   or radio groups — every setting here is binary.
3. A boolean field and setter on `SettingsController` in
   `src/partials/messenger.ts`, mapping to whatever the service stores.
4. A translation key under `settings.`.

To drive CSS from a setting, add a body class in `ThemeController`
(`src/controllers/theme.ts`) and react to the service's event. See
`background-sharp` and `user-interface-minimal`.

## Dev server

`webpack.dev.js` compiles the SCSS through webpack so it live-reloads. Production
still compiles it separately via `bun run build:css` into a plain `<link>`.

Two things that silently break this, both already fixed — don't reintroduce them:

- `allowedHosts` must include `localhost`. The server binds `127.0.0.1`, and
  browsing as `localhost` is otherwise rejected as an "Invalid Host/Origin
  header", which kills the HMR websocket with no visible error.
- Nothing may watch `public/css`. A sass watcher writing there triggers a full
  page reload before HMR can apply anything.

A CSS change reloads the page rather than swapping styles in place: the app's
entry does a dynamic `import('./app')` with no HMR accept boundary, so updates
bubble to the root and fall back to a reload. The session survives that (see
below), so it is tolerable.

`userconfig.overrides.js` 404s in dev. `index.html` loads it unconditionally and
only `.example` ships. Expected, not a bug.

## Backgrounds

`public/img/backgrounds/` holds `bgN.avif` (quality 30, used blurred) and
`bgN.sharp.avif` (quality 65, used when blur is off). `public/js/background.js`
picks one at random before Angular boots, reading the blur setting straight from
localStorage. Its `COUNT` must match the number of images.

When regenerating from source photos:

- Apply the EXIF orientation with `ImageOps.exif_transpose` **before** stripping
  metadata, or portrait shots are saved sideways.
- Write pixels into a fresh `Image` so no EXIF survives. The sources carry GPS.
- Verify by checking the JPEG/AVIF segments, not by grepping for "Exif" —
  compressed pixel data produces false matches.

## Session persistence

`IN_MEMORY_SESSION_PASSWORD` is on. `InMemorySession` stores the session
password in `AppDataStore` when the desktop app provides it, otherwise in
`sessionStorage`, so a reload does not ask for the password again and the tab
closing clears it. `welcome.ts` reconnects immediately when a stored password is
found.
