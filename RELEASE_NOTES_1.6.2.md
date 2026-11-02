# Verdant v1.6.2 — deployable asset cleanup

## Included

- Complete static deployment (`verdant-v1.6.2-static-dist.zip`) built from the
  cleaned v1.6.2 sources and supplied official MapLibre GL JS 5.12.0
  precompiled distribution files, including its embedded Web Worker.
- No `fetch_maplibre.py`, CDN, or npm required for the deployed application.
- One SPA entry at `index.html` (normally `/`), with locally hosted versioned
  JS/CSS assets; PWA manifest and Service Worker remain separate.
- Deleted legacy versioned HTML pages, redundant app/styles copies, and
  obsolete backup/photo-management pages from the published artifact.
- Retained the independent read-only `verdant-rescue.html` page.
- Source ZIP includes a reproducible offline packaging script and the
  precompiled MapLibre files **as well as** a conventional npm/Vite build path.

## Data safety

The existing IndexedDB name/version, record IDs, images, and schema-2 ZIP
backup format are unchanged. Make a verified external backup before upgrading.
Retain the original hostname/port and never clear browser site data.

## Verification

- 13/13 Node regression tests passed.
- Isolated Chromium tests passed for garden workspace switching, Settings
  cleanup, ZIP creation/verification, restore, and photo-optimization UI.
- Deployable file verification and JavaScript syntax checks passed.
- Bundled MapLibre globals loaded in an isolated headless Chromium context.
- **Limitations:** the local server was blocked by the execution environment;
  full production-page startup and WebGL rendering, offline PWA install/update,
  and real-device Safari/Firefox backup performance are not verified here.

## Build distinction

The delivered dist is a **portable static distribution**, assembled with
`node scripts/build-offline.mjs` from the precompiled MapLibre/Vue artifacts.
It is not a Vite-optimized bundle because npm registry access was unavailable.
It is deployable as ordinary static files and requires no build environment.
