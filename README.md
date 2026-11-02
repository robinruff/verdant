# Verdant

An offline-first garden inventory PWA. Map plants, keep photo journals, organize
species, and export ZIP backups with printable reports. Built with Vue 3,
MapLibre and IndexedDB; no backend required.

Garden data stays in your browser. Optional Pl@ntNet identification requires
internet access and your own API key, which is never included in backups.

## Development

Requires Node.js 20+ and npm.

```bash
npm ci
npm run dev -- --port 5173 --strictPort
```

Open **http://127.0.0.1:5173/**. Source changes reload automatically; development
skips offline service-worker registration. Keep the hostname and port stable to
retain browser data.

## Build and deploy

```bash
VERDANT_EDITOR_URL=https://garden.example.org/ npm run build
```

Serve only the contents of `dist/` over HTTPS (or localhost). The build bundles
runtime dependencies for offline use. Browsers need WebGL2 and ES2022 support.

`VERDANT_EDITOR_URL` sets the public link in backup instructions and PDFs, in
both development and builds. It defaults to `https://example.org/verdant/` and
must be an HTTP(S) URL without credentials, query or fragment. Pass it explicitly;
`.env` files are not loaded automatically.

`VERDANT_OUT_DIR` overrides `dist/`. Use a dedicated directory: builds empty it.

**When updating, keep the same origin and never clear site storage. Export and
verify a ZIP backup first.**

## Backups

Use **Settings → Back up & restore** to export or restore a garden. Backups include
records, photos, map data and photo settings. **Repair photos only** recovers
matching photos from an original backup without replacing garden records.

Backups also contain Typst templates. Extract the ZIP, then run:

```bash
typst compile printout.typ garden-printout.pdf
```

Install Typst separately. See the README inside each backup for details and
[the printout guide](tools/printout/README.md) for the synthetic demo.

Compatibility: IndexedDB `verdant-garden-v2`, version 1; backup format
`verdant-garden-backup`, schema 2. Older data-only backups remain supported.

## Validation

```bash
npm test
npm run build
npm run verify:dist
```

Before deploying, check map rendering, offline startup and large-photo backups
on target phones, including Safari iOS and Firefox Android.

## License

[MIT](LICENSE). Third-party components retain their own licenses; see
[THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt), regenerated during builds.
