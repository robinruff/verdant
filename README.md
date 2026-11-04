<p align="center">
  <img src="public/icons/verdant.svg" width="80" height="80" alt="Verdant sprout logo">
</p>
<h1 align="center">Verdant</h1>
<p align="center">An offline-first garden journal to map your plants, collect photos, and watch your garden grow.</p>

Map plants, keep photo journals, organize species, and export ZIP backups with
printable reports. Built with Vue 3, MapLibre and IndexedDB; no backend required.

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

## Installation

Choose the **Install Verdant** icon beside Help to open the browser’s installation prompt when
available, or see installation steps for your browser and device. The button is
hidden when Verdant detects that it is running as an installed app. Installation
detection is limited; the browser menu may still offer installation.

On the first visit, Verdant offers installation help once. Choosing **No thanks**
(or Escape) remembers the dismissal in this browser. **Show me how** opens the
same installation flow as the icon; the icon remains available afterward.
A full reset also clears this choice, so the offer appears when you reopen Verdant.

Garden data stays in its browser. Export a backup before switching browsers,
then restore it in the new browser.

## Full reset

Choose the erase action in Settings and type **RESET**. Verdant closes its
garden and management tools, deletes its stored data, then reloads automatically
into a new garden.

Reset deletes both current and legacy garden databases, local settings and API
key, the installation choice, temporary ZIPs, and Verdant’s offline cache and
service worker. Downloaded backups are unaffected. If another window blocks
deletion, close other Verdant tabs, installed-app windows and rescue pages.
Errors stay visible rather than silently reloading after an incomplete reset.

## Backups

Use the **Back up & restore** card directly in **Settings** to export or restore a garden. Backups include
records, photos, map data and photo settings. **Repair photos only** recovers
matching photos from an original backup without replacing garden records; find it
under **More options**, alongside the rescue link. Update checks are under
**Offline & storage**.

Choose **Create backup** to build and verify a ZIP, then **Download ZIP** in the
modal. After checking that it saved, choose **Done** to discard the temporary copy.
You can retry the download before closing. Closing without downloading discards
the temporary ZIP; an interrupted session's temporary ZIP is removed when you next
create a backup.

Backup actions show progress, confirmations, results, and errors in a shared modal.
Restore and photo repair can be cancelled until final replacement starts;
cancellation keeps the existing garden. After a successful import or repair, choose
**Open garden** to return to the map.

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
