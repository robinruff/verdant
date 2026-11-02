// Verdant v1.6.3 — standalone, pure-Typst printout PDF.
// Place beside an extracted Verdant schema-2 ZIP's data.json and images/.
// Compile: typst compile printout.typ garden-printout.pdf
// All content is local. No network access or Typst packages are required.

#import "map.typ": marker-pixel, within-map, is-calibrated, photo-format
#import "tiles.typ": draw-overview, draw-tile, tile-legend, tile-key
#import "auto-grid.typ": select-grid, inspect-tile
#import "cluster-tiles.typ": make-cluster-tiles
#import "side-labels.typ": draw-side-labels, max-labels, max-overview-labels

// CUSTOMIZE ---------------------------------------------------------------
#let journal-level = "all"  // "none" / "latest" / "all"
#let journal-photos = true   // true to add photos to the journal appendix
#let include-removed = true  // false excludes physically removed plants
#let report-language = "en"  // common-name preference: "en", "es", "de"
#let editor-url = "https://example.org/verdant/" // where to edit/import the backup
#let tile-label-mode = "side-columns"  // "side-columns" or "badges" (original)
#let tile-side-dot-diameter = 1.8 // mm for leader-line map dots
#let map-layout = "auto"      // "auto", "single", "clustered", "fixed-grid"
#let single-map-max-plants = 30 // full A3 map with side labels if <= threshold
#let tile-max-plants = 30       // label capacity target for clustered detail pages
#let clustering-max-tiles = 12 // hard upper limit on clustered pages
#let cluster-min-crop-fraction = 0.15 // avoid extreme zoom for tiny groups
#let tile-mode = "auto"        // ONLY fixed-grid: "auto" or "manual"
#let tile-columns = 3          // manual: vertical subdivisions
#let tile-rows = 2             // manual: horizontal subdivisions
#let auto-max-columns = 5      // automatic search limits (keep modest on a phone)
#let auto-max-rows = 4
#let auto-max-cells = 16       // potential cells per candidate grid
#let auto-max-pages = 12       // occupied detail pages per candidate
#let tile-marker-diameter = 4.0 // numbered detail-map badge diameter in mm
#let tile-marker-padding = 0.5  // extra required gap between badges in mm
#let tile-outer-marker-margin = 0.02 // trim empty sides; add 2% around occupied markers
#let tile-context-margin = 0.06 // show 6% beyond each tile edge (background only)
// ------------------------------------------------------------------------

#let backup = json("data.json")
#assert(backup.at("format") == "verdant-garden-backup", message: "Not a Verdant backup")
#assert(backup.at("schemaVersion") == 2, message: "Requires Verdant schema-2 data.json")
#let data = backup.data
#let types = data.plantTypes
#let images = data.images
#let setting(id) = data.settings.find(s => s.id == id)
#let garden-setting = setting("gardenTitle")
#let garden = if garden-setting == none or garden-setting.at("value", default: "") == "" { "My Garden" } else { garden-setting.value }
#let map-setting = setting("map")
#let raw-date(s) = if s == none or s == "" { "—" } else { str(s).slice(0, calc.min(10, str(s).len())) }
#let text-or(value, alternative: "—") = if value == none or str(value).trim() == "" { alternative } else { str(value) }
#let type-of(plant) = types.find(t => t.id == plant.at("plantTypeId", default: none))
#let common(t) = {
  if t == none { return "Unknown plant" }
  let primary = if report-language == "es" { t.at("nameEs", default: "") }
    else if report-language == "de" { t.at("nameDe", default: "") }
    else { t.at("nameEn", default: "") }
  text-or(primary, alternative: text-or(t.at("scientificName", default: none), alternative: "Unnamed type"))
}
#let species(t) = if t == none { "—" } else { text-or(t.at("species", default: none), alternative: text-or(t.at("scientificName", default: none))) }
#let plant-name(p) = text-or(p.at("nickname", default: none), alternative: common(type-of(p)))
#let ordered-entries(p) = p.at("statuses", default: ()).sorted(key: e => (e.timestamp, e.id))
#let latest-entry(p) = {
  let entries = ordered-entries(p)
  if entries.len() == 0 { none } else { entries.last() }
}
#let status-of(p) = {
  let alive = true
  let removed = false
  let rating = none
  for e in ordered-entries(p) {
    if e.at("alive", default: none) != none { alive = e.alive }
    if e.at("removed", default: none) != none { removed = e.removed }
    if e.at("ratingClear", default: false) { rating = none }
    else if e.at("rating", default: none) != none { rating = e.rating }
  }
  (alive: alive, removed: removed, rating: rating)
}
#let status-label(s) = if s.removed { "Removed" } else if s.alive { "Living" } else { "Dead" }
#let selected-plants = data.plants.filter(p => include-removed or not status-of(p).removed)
#let numbered = selected-plants.sorted(key: p => (plant-name(p), p.id)).enumerate().map(pair => (number: pair.at(0) + 1, plant: pair.at(1)))
#let used-types = types.sorted(key: t => (text-or(t.at("family", default: "")), text-or(t.at("genus", default: "")), species(t)))
#let map-available = map-setting != none and images.any(i => i.id == map-setting.imageId)
#let map-positioned = map-available and is-calibrated(map-setting)
#let mapped = if map-positioned { numbered.filter(row => within-map(map-setting, marker-pixel(map-setting, row.plant))) } else { () }
#assert(tile-label-mode == "side-columns" or tile-label-mode == "badges",
  message: "tile-label-mode must be side-columns or badges")
#assert(("auto", "single", "clustered", "fixed-grid").contains(map-layout),
  message: "map-layout must be auto, single, clustered, or fixed-grid")
#assert(type(single-map-max-plants) == int and single-map-max-plants >= 1,
  message: "single-map-max-plants must be positive")
#let connector-mode = tile-label-mode == "side-columns"
#let report-layout = if map-layout == "auto" {
  if mapped.len() <= single-map-max-plants and mapped.len() <= max-overview-labels {
    "single"
  } else { "clustered" }
} else { map-layout }
#let can-show-single-labels = mapped.len() <= max-overview-labels
#let scoring-diameter = if connector-mode { tile-side-dot-diameter } else { tile-marker-diameter }
#let scoring-padding = if connector-mode { 0.3 } else { tile-marker-padding }
#let selected-grid = if mapped.len() > 0 and report-layout == "clustered" {
  let clustered = make-cluster-tiles(map-setting, mapped,
    capacity: if connector-mode { calc.min(tile-max-plants, max-labels) } else { tile-max-plants },
    max-pages: clustering-max-tiles,
    outer-margin: tile-outer-marker-margin,
    marker-diameter: scoring-diameter,
    min-crop-fraction: cluster-min-crop-fraction)
  // In clustered mode, marker overlaps DO NOT affect scoring or feasibility.
  // Also avoid an O(n^2) per-tile collision scan on memory-limited devices.
  let annotated = clustered.tiles.map(t => t + (metrics: (
    collisions: 0, coincident: 0, min-spacing: none,
    examples: (), worst-deficit: 0.0,
  )))
  (tiles: annotated, columns: none, rows: none,
    page-count: clustered.page-count, collisions: 0, coincident: 0,
    min-spacing: none, worst-deficit: 0.0, utilization: 0.0,
    candidates: clustered.checked,
    feasible: clustered.overflow == 0, overflow: clustered.overflow)
} else if mapped.len() > 0 and report-layout == "fixed-grid" {
  select-grid(map-setting, mapped, mode: tile-mode,
    columns: tile-columns, rows: tile-rows,
    max-columns: auto-max-columns, max-rows: auto-max-rows,
    max-cells: auto-max-cells, max-pages: auto-max-pages,
    marker-diameter: scoring-diameter, marker-padding: scoring-padding,
    viewport-width: if connector-mode { 155.0 } else { 245.0 },
    viewport-height: if connector-mode { 136.0 } else { 125.0 },
    max-per-tile: if connector-mode { max-labels } else { none },
    outer-margin: tile-outer-marker-margin,
    context-margin: tile-context-margin)
} else {
  (tiles: (), columns: none, rows: none, page-count: 0,
    collisions: 0, coincident: 0, min-spacing: none,
    worst-deficit: 0.0, utilization: 0.0, candidates: 0,
    feasible: true, overflow: 0)
}
#let detailed-tiles = selected-grid.tiles
#let spacing-label(value) = if value == none { "n/a (singletons)" } else { str(calc.round(value, digits: 2)) + " mm" }
#let grid-summary = if report-layout == "clustered" {
  (
    "Gap-aware clustering; ",
    str(selected-grid.page-count),
    " detail tiles; ",
    str(selected-grid.candidates),
    " gap cuts evaluated; ",
    str(selected-grid.overflow),
    " labels beyond tile capacity.",
  ).join("")
} else if report-layout == "fixed-grid" {
  (
    "Grid ",
    str(selected-grid.columns),
    " × ",
    str(selected-grid.rows),
    " (",
    tile-mode,
    "; ",
    str(selected-grid.candidates),
    " candidates); ",
    str(selected-grid.page-count),
    " occupied tiles; ",
    str(selected-grid.collisions),
    " overlapping marker pairs.",
  ).join("")
} else { "Entire garden map with leader-line labels; no detail tiles required." }
#let unplaced = if map-positioned { numbered.filter(row => not within-map(map-setting, marker-pixel(map-setting, row.plant))) } else { numbered }
#let entry-photo-ids(entry) = {
  if entry == none { return () }
  let old = entry.at("imageId", default: none)
  let ids = entry.at("imageIds", default: ())
  let all = if old == none { ids } else { (old,) + ids }
  all.dedup()
}
#let photo-for(id, w: 42mm) = {
  let meta = images.find(i => i.id == id)
  if meta == none { [] }
  else { image(read(meta.path, encoding: none), format: photo-format(meta), width: w, fit: "contain") }
}
#let note-of(e) = if e == none { "—" } else { text-or(e.at("note", default: none)) }
#let total-photos = images.filter(i => i.id != (if map-setting == none { "" } else { map-setting.imageId })).len()

#let green = rgb("235c43")
#let muted = rgb("66756b")
#let light = rgb("eaf0e9")
#set text(size: 10pt, fill: rgb("22352a"))
#set par(leading: 0.75em)
#set heading(numbering: none)
#show heading.where(level: 1): set text(fill: green, size: 18pt, weight: "bold")
#show heading.where(level: 2): set text(fill: green, size: 12pt, weight: "bold")
#show link: underline

// OVERVIEW — A3 landscape. Small gardens get labeled full-map leaders;
// larger gardens get the complete image, numbered markers, and tile outlines.
#set page(width: 420mm, height: 297mm, margin: (x: 16mm, y: 13mm), footer: align(right, text(size: 8pt, fill: muted)[Verdant · Printout · #link(editor-url)[Edit in Verdant]]))
#text(size: 11pt, weight: "bold", fill: green)[GARDEN PRINTOUT / SITE PLAN]
#v(3mm)
#text(size: 22pt, weight: "bold")[#garden]
#text(size: 9pt, fill: muted)[#(numbered.len()) plants · #types.len() plant types · #total-photos journal images · Backup: #raw-date(backup.at("exportedAt", default: none))]
#text(size: 8.5pt, fill: muted)[To edit this garden, open #link(editor-url)[#editor-url] and import the exported ZIP in *Back up & restore*.]
#v(4mm)
#if map-available {
  if map-positioned and mapped.len() > 0 {
    if report-layout == "single" and can-show-single-labels {
      let full-map = (bounds: (x0: 0.0, y0: 0.0, x1: map-setting.width, y1: map-setting.height), rows: mapped)
      align(center, draw-side-labels(map-setting, images, full-map,
        types: types, language: report-language, whole-map: true,
        dot-diameter: tile-side-dot-diameter))
    } else {
      align(center, draw-overview(map-setting, images, mapped, types: types,
        tiles: detailed-tiles))
    }
    v(3mm)
    text(size: 9pt, fill: muted)[#grid-summary Numbers match the inventory.]
    if report-layout == "single" and not can-show-single-labels {
      text(size: 9pt, fill: rgb("a13f2a"))[
        This forced single-map layout has too many entries for side labels
        (#mapped.len() plants; capacity #max-overview-labels). Showing numbered dots
        without lines instead. Choose automatic or clustered mode for readable labels.
      ]
    }
    if not selected-grid.feasible {
      v(1.5mm)
      text(size: 9pt, fill: rgb("a13f2a"))[
        #if report-layout == "clustered" {
          [Clustering reached its page limit or found locations that cannot be split.
          #selected-grid.overflow labels exceed the per-tile capacity;
          any tile exceeding 30 labels uses the numbered-dot legend fallback.]
        } else {
          [The fixed grid has unresolved marker collisions or too many labels
          within its configured limits.]
        }
      ]
    }
  } else {
    text(size: 9pt, fill: muted)[The map is missing usable calibration or has no mapped plants.]
  }
} else {
  rect(width: 100%, height: 120mm, fill: light, radius: 5pt, align(center + horizon)[No map image in this backup.])
}
#if unplaced.len() > 0 and map-positioned {
  v(2mm)
  text(size: 9pt, fill: muted)[Not on map: #unplaced.map(r => str(r.number)).join(", ")]
}

// DETAIL PAGES — ONLY when a clustered or fixed-grid layout is in use.
#set page(paper: "a4", flipped: true, margin: (x: 13mm, y: 12mm), footer: align(right, text(size: 8pt, fill: muted)[#garden · Map details · #link(editor-url)[Edit in Verdant]]))
#for (index, tile) in detailed-tiles.enumerate() {
  pagebreak()
  let item = tile + (index: index + 1)
  heading(level: 1, [Tile #tile-key(item)])
  let has-side-labels = connector-mode and tile.rows.len() <= max-labels
  let can-reuse-metrics = has-side-labels or (report-layout == "fixed-grid" and not connector-mode)
  let page-metrics = if can-reuse-metrics { tile.metrics } else {
    inspect-tile(tile, map-setting, diameter: tile-marker-diameter,
      padding: tile-marker-padding, context-margin: tile-context-margin)
  }
  let locality = if report-layout == "clustered" { "natural-gap cluster" }
    else { "grid row " + str(tile.grid-row) + ", column " + str(tile.grid-column) }
  text(size: 8pt, fill: muted)[#tile.rows.len() plants · #locality · undistorted image scale]
  if page-metrics.collisions > 0 and not has-side-labels {
    text(size: 8pt, fill: rgb("a13f2a"))[
      Map-marker overlaps: #page-metrics.collisions pair(s);
      report numbers #page-metrics.examples.join(", ").
    ]
  }
  v(2mm)
  if has-side-labels {
    align(center, draw-side-labels(map-setting, images, tile, types: types,
      language: report-language, context-margin: tile-context-margin,
      dot-diameter: tile-side-dot-diameter))
    v(2mm)
    text(size: 8pt, fill: muted)[Colored lines link actual plant positions to numbered species labels; small dots may coincide without triggering additional tiles.]
  } else {
    if connector-mode {
      text(size: 8pt, fill: rgb("a13f2a"))[
        This tile has #tile.rows.len() plants, exceeding the side-label limit
        (#max-labels). Using numbered badges and the original legend for this tile.
      ]
    }
    align(center, draw-tile(map-setting, images, tile, types: types,
      marker-diameter: tile-marker-diameter, context-margin: tile-context-margin))
    v(3mm)
    tile-legend(tile, types, language: report-language)
  }
}

// REFERENCE PAGES — A4 portrait. Reset `flipped` explicitly: the preceding
// detail-map pages use A4 landscape, and Typst set rules retain unspecified
// properties. A changed page set rule automatically starts a conforming page.
#set page(paper: "a4", flipped: false, margin: (x: 16mm, y: 18mm), footer: align(right, text(size: 8pt, fill: muted)[#garden · Verdant printout · #link(editor-url)[Edit in Verdant]]))

= Plant inventory
#text(size: 9pt, fill: muted)[Numbering matches the map. Records are sorted by name; numbers are report-specific, not Verdant database IDs.]
#v(3mm)
#let inventory-cells = numbered.map(row => {
  let p = row.plant
  let t = type-of(p)
  let s = status-of(p)
  let last = latest-entry(p)
  (
    [#row.number],
    [#plant-name(p)],
    [#species(t)],
    [#status-label(s)],
    [#raw-date(if last == none { none } else { last.timestamp })],
  )
}).flatten()
#table(
  columns: (9mm, 1.3fr, 1.3fr, 0.8fr, 0.8fr),
  stroke: (bottom: 0.35pt + rgb("d7dfd6")),
  inset: (x: 4pt, y: 6pt),
  table.header(
    table.cell(fill: light)[*No.*],
    table.cell(fill: light)[*Plant / nickname*],
    table.cell(fill: light)[*Species*],
    table.cell(fill: light)[*Status*],
    table.cell(fill: light)[*Last entry*],
  ),
  ..inventory-cells,
)

#pagebreak()
= Plant-type reference
#text(size: 9pt, fill: muted)[Taxonomy and common names come directly from the saved records. Missing names are not guessed.]
#v(3mm)
// Four columns fit A4 portrait without squeezing six long-name fields.
// The three localized common names remain available in each row.
#let type-cells = used-types.map(t => {
  let count = selected-plants.filter(p => p.at("plantTypeId", default: none) == t.id).len()
  (
    [#species(t)],
    [#text-or(t.at("family", default: none)) #linebreak() #text-or(t.at("genus", default: none))],
    [
      #text(weight: "bold", fill: muted)[EN] #text-or(t.at("nameEn", default: none))
      #linebreak()
      #text(weight: "bold", fill: muted)[ES] #text-or(t.at("nameEs", default: none))
      #linebreak()
      #text(weight: "bold", fill: muted)[DE] #text-or(t.at("nameDe", default: none))
    ],
    [#count],
  )
}).flatten()
#set text(size: 8.5pt)
#table(
  columns: (1.35fr, 1.0fr, 1.9fr, 9mm),
  stroke: (bottom: 0.35pt + rgb("d7dfd6")),
  inset: (x: 4pt, y: 5pt),
  table.header(
    table.cell(fill: light)[*Species*],
    table.cell(fill: light)[*Family / genus*],
    table.cell(fill: light)[*Common names*],
    table.cell(fill: light)[*\#*],
  ),
  ..type-cells,
)
#set text(size: 10pt)

#if journal-level != "none" {
  pagebreak()
  heading(level: 1, if journal-level == "latest" { "Journal — latest entries" } else { "Journal — complete history" })
  text(size: 9pt, fill: muted)[All dates and notes are taken from the original backup. Blank status fields do not reset earlier condition changes.]
  v(3mm)
  for row in numbered {
    let p = row.plant
    let history = ordered-entries(p).rev()
    let entries = if journal-level == "latest" { history.slice(0, calc.min(1, history.len())) } else { history }
    block(sticky: true, below: 1mm, text(weight: "bold", fill: green)[#row.number · #plant-name(p)])
    if entries.len() == 0 {
      text(size: 9pt, fill: muted)[No journal entries.]
    }
    for e in entries {
      let changes = ()
      if e.at("alive", default: none) != none { changes.push(if e.alive { "Living" } else { "Dead" }) }
      if e.at("removed", default: none) != none { changes.push(if e.removed { "Removed" } else { "Not removed" }) }
      if e.at("rating", default: none) != none { changes.push("Rating " + str(e.rating) + "/10") }
      block(below: 3mm, inset: (x: 6pt, y: 5pt), fill: rgb("f6f8f4"), radius: 3pt)[
        #text(size: 9pt, weight: "bold")[#raw-date(e.timestamp)]
        #if changes.len() > 0 { text(size: 8pt, fill: muted)[ — #changes.join(" · ")] }
        #if text-or(e.at("note", default: none), alternative: "") != "" { parbreak(); text(size: 9pt)[#e.note] }
        #if journal-photos {
          for photo-id in entry-photo-ids(e) {
            parbreak()
            photo-for(photo-id, w: 48mm)
          }
        }
      ]
    }
  }
}
