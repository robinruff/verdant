## Dependency security update

MapLibre GL JS is pinned to **6.16.0** and Vite to **6.4.5** to address the
reported npm advisories. Run `npm ci` to install the committed dependency lockfile.
The Vite build bundles MapLibre and its separate local module worker from npm.
The former vendored MapLibre copy and standalone offline builder have been removed.
MapLibre 6 requires **WebGL2** and modern ES2022-capable browsers. Check map
rendering on target phones before deployment. Browser data and backup schemas
are unchanged. Service-worker caches use a new `security1` suffix to replace
previous assets without clearing IndexedDB. The dependency audit reports zero
known vulnerabilities at the time of this update.

## Print-ready backup ZIPs

**New:** Settings → Back up & restore → Create backup produces the same
schema-2 backup (`data.json` plus `images/`) **and** seven `.typ` files plus
`README.md` at the ZIP root. After downloading, extract the ZIP and run
`typst compile printout.typ garden-printout.pdf` from the extracted folder.
No copying of templates, preprocessors, external Typst packages, or backup
schema changes are needed. Typst CLI must be installed separately.
Printable-report instructions and data-format documentation live in the
`README.md` bundled inside each exported ZIP, not in the PWA interface.
The PDF links to https://verdant.robin-ruff-98.workers.dev for restoring/editing.

Restoring works with old data-only ZIPs, previous print bundles with
`PRINT_README.txt`, and new ZIPs containing `README.md`. The exporter refuses to make a backup when its local
print source files are unavailable, rather than silently omitting them.
The print template is the latest portrait-reference / clustered-leader-line
version; configure it by editing `printout.typ` in the extracted folder.

## Release 1.6.5 — iPhone photo import and repair

- **Safer ZIP import:** Imported photos are read into fresh, detached image
  Blobs, one at a time, before entering IndexedDB. Each staged copy is read
  back and verified against the source bytes **before** the garden's records
  are replaced in a single transaction. Failed staging leaves the existing
  garden records untouched. The repair/restore process needs enough temporary
  browser storage for an additional copy of the imported photographs.
- **Repair photos only:** Under Settings → Back up & restore, select the
  original ZIP and press **Repair photos only…**. This restores matching
  journal-photo bytes but does not replace plant records, journals, settings,
  the map, or photographs added after the import. It is intended for existing
  imported gardens where journal pictures show as broken on iOS.
- **iPhone file picker:** The ZIP selection is a native, visible file input
  without restrictive MIME filters. If a file stored in a cloud provider cannot
  be selected, copy it to **Files → On My iPhone** before picking it.
- **Safari storage permission:** A rejected request for persistent storage is
  now explained as a browser decision, not a failed garden save. Keep downloaded
  ZIP backups even if persistence is granted.
- Bumped Settings version, application code, and offline cache to **1.6.5**.
  **No IndexedDB schema migration or backup format change.** Map and printout
  files and their appearance are unchanged.

**Verification:** 17 Node.js regression scripts and offline build integrity
checks pass. iPhone Safari and Chrome behavior cannot be verified in this
container; the photo-repair path is a targeted fix for a plausible WebKit
Blob/IndexedDB problem, not a guaranteed diagnosis of every broken picture.

After deploying, reopen Verdant from the **same website address and browser
profile**. Allow the updated service worker to activate, then reload if the
old version still appears. Do not delete site data to force the update.

# Verdant Garden PWA — v1.6.5

Offline-first Vue 3 garden inventory, with MapLibre GL JS 6.16.0, IndexedDB,
local photos, and disk-backed ZIP backups.

## Portable photo settings in backups

Every new backup embeds the garden's **effective photo optimization profile** in
`data.json`, under `data.settings` as `photoOptimization` (`targetKB`,
`maxDimension`, and `format`). Even when no customized setting has been saved,
the default JPEG / 300 KB / 1600 px profile is explicitly included. Restoring
older schema-2 backups that omitted this setting selects those defaults rather
than retaining the importing browser's previous photo profile. Existing images
are copied without recompression or conversion during backup and restore;
photo limits apply to *future* uploads or an explicitly initiated optimization.
The Pl@ntNet API key stays local and is never exported.

## Ready-to-deploy ZIP (no build tools on your server)

Use the **offline-deploy ZIP** shipped with this release. Unzip it and upload the **contents**
of the archive to the directory your web server serves. Open its `index.html`
through your site's normal address (`/`, or the deployment directory).

MapLibre's JavaScript, CSS, and Web Worker are bundled locally. No Python,
`fetch_maplibre.py`, npm, remote CDN, or internet connection is required at
runtime. `sw.js`, the manifest, and icons remain separate static assets to
provide installable PWA/offline behavior. The only optional internet service
used by the application is the user-initiated Pl@ntNet API.

Do **not** clear Firefox/Safari site data when replacing your deployed files:
that would risk deleting your plants, journal entries, settings, photographs,
and local map imagery. Export and verify a backup first. Use the same origin
(hostname, scheme and port) to retain the existing IndexedDB.

## Building from source

Use Node.js 20+ and npm from the project directory:

```bash
npm ci
npm run build
```

npm installs the locked dependencies, including MapLibre and Vite. The build
bundles MapLibre's JavaScript, stylesheet, and worker into `dist/`; no manual
MapLibre download is needed. Dependency installation needs registry access
unless the packages are already cached. The deployed application remains
self-contained and works offline through its service worker.

Publish only the contents of `dist/`. Verify with `npm run verify:dist`,
and run `npm test` for regressions. See `THIRD_PARTY_LICENSES.txt` in the
deployable directory for the MapLibre license.

## Deployable files

The clean distribution contains only `index.html`, `assets/` (Vue/MapLibre/app
JS and CSS, plus lazy Settings modules), the required local helper scripts,
`icons/`, `manifest.webmanifest`, `sw.js`, `THIRD_PARTY_LICENSES.txt`, and
`verdant-rescue.html` for independent emergency read-only recovery.

Do **not** deploy `src/`, `scripts/`, `tests/`, `docs/`, or
`node_modules/` from the source project.

The previous `vue-v*.html`, old `backup-v*` / `photos-v*` pages, redundant
`app-v*.js`/`styles-v*.css`, and MapLibre downloader scripts are not part of
the v1.6.5 distribution. You may remove them from the deployed **code folder**
after confirming the new application works. **Never** delete or reset browser
storage as part of cleanup. Retain a separate copy of your backup.

## Compatibility and testing

- IndexedDB database `verdant-garden-v2`, version `1`: unchanged.
- ZIP backup format `verdant-garden-backup`, schema `2`: unchanged.
- Service Worker cache: new `verdant-shell-v1.6.5-security1` in the provided
  Vite static build; does not modify browser databases.
- Project title, taxonomy, GPS, journal, map, backup, restore, and photo
  optimization are preserved from v1.6.1.
- Local Node regressions and offline distribution integrity checks passed.
  Direct Chromium browser navigation was blocked in the build environment;
  actual WebGL display and offline startup must be checked on Firefox Android
  and Safari iOS. Large photo backups should be tested on the target phone.

No production garden data or Pl@ntNet key is included in either ZIP.
