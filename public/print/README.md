# Verdant garden backup and printout

This ZIP is a complete **Verdant garden backup**. It also contains a self-contained
[Typst](https://typst.app/) template to make a printable garden report. You do
not need to transform the backup data, run a preprocessor, or install Typst
packages.

## Create the PDF printout

1. Extract **the entire ZIP** to one directory, keeping `data.json`, `images/`,
   and the `.typ` files alongside this README.
2. Install the Typst command-line compiler on your computer or phone.
3. Open a terminal in the extracted directory and run:

   ```sh
   typst compile printout.typ garden-printout.pdf
   ```

The PDF is written to `garden-printout.pdf` in the same directory. The full map
uses A3 landscape: a small garden gets leader-line labels on that map, while
larger gardens get clustered A4 landscape detail maps. The plant inventory,
plant-type reference, and journals are A4 portrait. Journal photographs remain
with the corresponding entry.

To customize the result, edit the **CUSTOMIZE** settings at the top of
`printout.typ`, then compile again. These include language, journal coverage,
map tiling, and label style. A calibrated map is needed to place plants on
images; without calibration the other record pages can still be generated.

## Open or edit the garden in Verdant

**Editor:** https://verdant.robin-ruff-98.workers.dev

Open that URL in a browser, go to **Back up & restore → Restore garden**, select
this **original ZIP**, and follow the verification and confirmation steps.
Restoring **replaces the garden currently saved in that browser**. Export and
save a backup of any existing garden there first. The PDF is for reading and
printing; it is **not** a replacement for the editable ZIP backup.

The same editor link is included as a clickable link in the generated PDF.
The URL may be updated later; `editor-url` near the beginning of `printout.typ`
controls the link in newly generated PDFs.

## What is in this ZIP?

```text
data.json            Garden records and references to images
images/
  00001.bin          Map background or journal photograph (example)
  00002.bin          Another saved image (example)
printout.typ         Main Typst document; run the compile command above
map.typ              Map calibration and coordinate conversion
geometry.typ         Shared geometric helpers
tiles.typ            Fixed-grid map and legend rendering
auto-grid.typ        Fixed-grid selection
cluster-tiles.typ    Cluster-aware partitioning
side-labels.typ      Leader-line labels
README.md            This guide
```

`data.json` is UTF-8 JSON. Its structure is:

```json
{
  "format": "verdant-garden-backup",
  "schemaVersion": 2,
  "exportedAt": "<ISO timestamp>",
  "data": {
    "plants": [],
    "plantTypes": [],
    "settings": [],
    "images": []
  }
}
```

- **`data.plants`**: one object per plant; includes a stable `id`,
  `plantTypeId`, optional `nickname`, `geometry` (GeoJSON-like `Point`,
  `LineString`, or `Polygon` in geographic coordinates), and a `statuses`
  array of journal entries. Entries have identifiers and timestamps and can
  contain notes, health/removal state, ratings, or photo references via
  `imageId` (older) and/or `imageIds` (newer).
- **`data.plantTypes`**: shared plant-type records keyed by `id`. They can
  contain `species`, `scientificName`, `family`, `genus`, localized names
  (`nameEn`, `nameEs`, `nameDe`), color, and reference links.
- **`data.settings`**: garden configuration, including `gardenTitle`,
  `photoOptimization`, and `map`. Every new backup includes the **effective
  photo settings**, even when using untouched defaults: `targetKB` (approximate
  target file size in KB), `maxDimension` (maximum width or height in pixels),
  and `format` (`image/jpeg` or `image/webp`). For example:

  ```json
  {"id":"photoOptimization","targetKB":300,"maxDimension":1600,"format":"image/jpeg"}
  ```

  These settings are restored with the garden and apply to **newly added
  photos**. Restoring does not recompress, resize, or convert archived images;
  the files retain their actual sizes and types. An older backup without this
  record uses Verdant's default photo settings after import, not the importing
  device's previous preferences. The map record references its `imageId`,
  pixel `width`/`height`, and supported calibration (`points` or geospatial
  metadata). Device-specific API keys are not exported.
- **`data.images`**: image metadata records with `id`, original `name`,
  `mimeType`, and `path` pointing into `images/`. These references connect
  map backgrounds and journal photos to their stored files.

Files such as `images/00001.bin` contain the **original image bytes**;
`.bin` is the ZIP filename extension, not the image encoding. Read the
corresponding `mimeType` in `data.images` to identify JPEG, PNG, WebP, etc.
Do not rename these paths or change image IDs if you want to restore the ZIP.
The Typst files are extra convenience files; the backup data remains
**Verdant schema version 2** and is restorable in Verdant.

## Keep the backup safe

Keep the ZIP itself as your editable backup, including `data.json` and all
`images/` files. For restoring, select the original ZIP rather than a PDF or
an extracted `data.json`. The exported ZIP does not contain the Typst compiler.
