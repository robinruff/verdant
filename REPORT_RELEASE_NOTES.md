# Verdant v1.6.3 — Printout ZIP integration

Every new garden backup ZIP includes the same schema-2 garden data (`data.json`
and `images/*.bin`) and these supplemental files at the ZIP root:

- `printout.typ` (entry point)
- `map.typ`, `geometry.typ`, `tiles.typ`, `cluster-tiles.typ`, `auto-grid.typ`,
  `side-labels.typ` (support modules)
- `README.md` (print instructions, backup-data documentation, and editor link)

Extract the ZIP and run:

```sh
typst compile printout.typ garden-printout.pdf
```

The Typst printout remains standalone and separate from the app. Small gardens
use the full A3 landscape map with side labels; larger gardens receive a full
map and clustered A4 landscape detail pages. The inventory, reference pages,
and journals are A4 portrait.

The exported data schema and image bytes are unchanged. Restore accepts older data-only ZIPs, previous print ZIPs using
`PRINT_README.txt`, and new ZIPs containing `README.md`;
unexpected, incomplete, or CRC-corrupt print source files are rejected. The
print bundle is shipped offline in the web app and preloaded before starting a
backup, avoiding silently incomplete exports. Typst itself is not embedded in
the app or backup and must be installed separately.

Validated: 14 Node regression test scripts passed, including print-enabled ZIP
round-trip and data-only backward compatibility; the portable offline build
and its integrity verifier succeeded. The print template was inherited from
the clustered leader-line portrait version, which has not been successfully
compiled/rendered using a real Typst compiler in this environment.

## Follow-up — simpler PWA backup UI, portable README, and editor links

The Backup/Restore screen and export success message no longer mention Typst
or show the compile command. The exported ZIP's root `README.md` explains how
to compile the PDF, how schema-2 `data.json` and image blobs are structured,
and how to import the original ZIP through the hosted Verdant editor at
https://verdant.robin-ruff-98.workers.dev. The PDF's cover/map page displays
this editor URL with import instructions; all page footers contain a clickable
"Edit in Verdant" link. `editor-url` in `printout.typ` configures the target.

This release also recognizes both old `PRINT_README.txt` and new `README.md`
print bundles when restoring, without changing schema-2 garden data.

## Follow-up — portable photo profile and Settings version correction

A new backup now explicitly includes the effective `photoOptimization` record
under `data.settings` even if the user has never saved a custom profile. It
contains `targetKB`, `maxDimension`, and `format`, and is validated before any
restore writes. When restoring an older schema-2 backup without this setting,
Verdant applies its known JPEG / 300 KB / 1600 px defaults instead of retaining
the destination browser's unrelated settings. Previously stored image blobs
are preserved, without recompression or transcode during export/restore.

The Settings footer and HTML page title now display Verdant **1.6.3** rather
than 1.6.2. Package metadata and both normal and offline service-worker cache
versions have been updated to 1.6.3, making the new deployed files replace
the previous cached code without clearing garden storage.

Validation: 15 Node regression scripts pass, including a simulated end-to-end
ZIP export/restore of photo profiles and a failed-input transaction check; the
portable offline build and static verifier pass. No actual browser deployment
or Typst PDF compilation is claimed.
