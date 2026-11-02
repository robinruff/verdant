# Verdant 1.6.5 — iPhone journal-photo restore improvements

This release keeps the schema-2 backup ZIP, printout template, and plant data
model unchanged.

- ZIP restore detaches each image from the Files-selected ZIP, writes it to a
  temporary IndexedDB key, and checks its bytes on readback before a full
  garden replacement. Failure during staging does not clear existing records.
- **Repair photos only…** uses a selected existing Verdant ZIP to restore
  matching *journal* image bytes without changing plants, journals, newer
  photos, or the map image. Download a current backup before repair.
- The native ZIP input has no MIME filter that might prevent selection on iOS.
  When a third-party cloud file cannot be selected, copy it to On My iPhone.
- Safari's persistent-storage refusal is shown as nonfatal; normal IndexedDB
  storage can still be used, but regular ZIP backups remain essential.
- Version display/cache and source release are now 1.6.5.

**Tests:** 17 Node regression suites pass and offline deploy build verifies.
Safari iPhone and Chrome iPhone browser tests are not available here.
WebKit-dependent behavior remains a hypothesis pending device testing.
