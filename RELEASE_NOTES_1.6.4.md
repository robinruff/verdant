# Verdant 1.6.4 — Backup compatibility hotfix

**Fixes**

1. Removed the backup/restore code's dependency on the recently added
   `VerdantPhotos.backupSettings` function. Backups still include the effective
   photo profile; existing photos remain untouched, and older backups without
   a photo profile receive the defaults (300 KB, 1600 px, JPEG).
2. Implemented the missing `clearStagedZips` function, scoped to Verdant's
   temporary `verdant-stage-*.zip` files in OPFS. No garden data is cleared by
   ordinary export or download operations.
3. Bumped app title, Settings footer and service worker caches to 1.6.4.
   Precached the versioned photo-helper URL to minimize stale-script mixing.
4. Preserved the printout template, ZIP README, editor link, schema 2 backup
   format, original photo bytes and previous garden contents.

**Validation:** 16 Node regression tests and static offline build verification.
Browser interaction smoke test could not complete because local HTTP navigation
was blocked by the execution environment. Typst PDF compilation is not part
of this hotfix and was not run.

**Deployment:** Unzip the offline deployment archive over the existing app
files at the **same origin**. Do not clear site data. Reopen/reload after the
new service worker activates. Keep an external garden ZIP backup.
