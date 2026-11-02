// Verdant printout: deterministic fixed rectangular grid (pure Typst).
// All geometric coordinates are original map IMAGE PIXELS.
// Each mapped plant is assigned to exactly one non-empty grid cell.
#import "map.typ": marker-pixel, photo-format
#import "geometry.typ"

#let field(d, k, fallback: none) = if d == none { fallback } else { d.at(k, default: fallback) }
#let get-type(row, types) = types.find(t => t.id == field(row.plant, "plantTypeId"))
#let color-of(row, types) = {
  let t = get-type(row, types)
  let raw = if t == none { "#275e44" } else { field(t, "color", fallback: "#275e44") }
  if type(raw) != str or not raw.starts-with("#") or (raw.len() != 7 and raw.len() != 4) { rgb("275e44") } else { rgb(raw) }
}
#let scientific(row, types) = {
  let t = get-type(row, types)
  if t == none { return "Unknown species" }
  let v = field(t, "species", fallback: "")
  if v == none or v == "" { v = field(t, "scientificName", fallback: "") }
  if v == none or v == "" { "Unknown species" } else { v }
}
#let common(row, types, language: "en") = {
  let t = get-type(row, types)
  if t == none { return "" }
  let name-key = if language == "es" { "nameEs" } else if language == "de" { "nameDe" } else { "nameEn" }
  let v = field(t, name-key, fallback: "")
  if v == none { "" } else { v }
}

// Apply the grid to the plant-occupied extent, not to the whole image.
// Rows and columns count all grid cells, including empty ones.
// Empty cells do not generate pages. Cell ownership is half-open:
// exact internal boundary points belong to the cell to the right/below.
#let make-tiles(map, plants, columns: 3, rows: 2, marker-diameter: 4.0, outer-margin: 0.02) = {
  assert(type(columns) == int and columns >= 1, message: "tile-columns must be a positive integer")
  assert(type(rows) == int and rows >= 1, message: "tile-rows must be a positive integer")
  assert(outer-margin >= 0 and outer-margin <= 1, message: "tile-outer-marker-margin must be between 0 and 1")
  assert(marker-diameter > 0, message: "tile-marker-diameter must be positive")
  if plants.len() == 0 { return () }
  let located = geometry.prepare(map, plants, radius: marker-diameter / 2.0)
  let extent = geometry.occupied-bounds(located, map.width, map.height,
    marker-diameter: marker-diameter, outer-margin: outer-margin)
  let result = ()
  for r in range(rows) {
    for c in range(columns) {
      let x0 = extent.x0 + geometry.width(extent) * c / columns
      let x1 = extent.x0 + geometry.width(extent) * (c + 1) / columns
      let y0 = extent.y0 + geometry.height(extent) * r / rows
      let y1 = extent.y0 + geometry.height(extent) * (r + 1) / rows
      let bounds = geometry.box(x0, y0, x1, y1)
      let assigned = located.filter(item => {
        let x = item.pixel.x
        let y = item.pixel.y
        let inside-x = x >= x0 and (x < x1 or (c == columns - 1 and x <= x1))
        let inside-y = y >= y0 and (y < y1 or (r == rows - 1 and y <= y1))
        inside-x and inside-y
      })
      if assigned.len() > 0 {
        result.push((bounds: bounds, rows: assigned, grid-row: r + 1,
          grid-column: c + 1, unresolved: false, depth: 0))
      }
    }
  }
  let assigned-count = result.map(t => t.rows.len()).sum()
  assert(assigned-count == located.len(), message: "Some markers were not assigned to a grid tile")
  result
}
#let map-image(map, images) = {
  let meta = images.find(i => i.id == map.imageId)
  if meta == none { none } else { meta }
}
#let draw-overview(map, images, rows, types: (), tiles: ()) = {
  let meta = map-image(map, images)
  if meta == none { return [Map image unavailable.] }
  let max-w = 365.0
  let max-h = 193.0
  let scale = calc.min(max-w / map.width, max-h / map.height)
  let w = map.width * scale * 1mm
  let h = map.height * scale * 1mm
  let photo = image(read(meta.path, encoding: none), format: photo-format(meta), width: w, height: h, fit: "contain")
  block(width: w, height: h, clip: true, stroke: 0.5pt + rgb("9fad9e"), [
    #place(top + left, photo)
    // Show every occupied fixed-grid tile over the full garden map.
    #for (index, tile) in tiles.enumerate() {
      let b = tile.bounds
      let x = b.x0 * scale * 1mm
      let y = b.y0 * scale * 1mm
      let tw = geometry.width(b) * scale * 1mm
      let th = geometry.height(b) * scale * 1mm
      place(top + left, dx: x, dy: y, rect(width: tw, height: th, stroke: 0.9pt + rgb("244c39"), fill: none))
      place(top + left, dx: x + 1mm, dy: y + 1mm, box(fill: rgb("ffffffcc"), inset: 1pt, text(size: 7pt, weight: "bold", fill: rgb("244c39"), "T" + str(index + 1))))
    }
    #for row in rows {
      let p = marker-pixel(map, row.plant)
      let x = p.x * scale * 1mm
      let y = p.y * scale * 1mm
      let ink = color-of(row, types)
      // Overview deliberately tolerates overlap.
      place(top + left, dx: x - 1.7mm, dy: y - 1.7mm, circle(
        radius: 1.7mm, fill: ink, stroke: 0.3pt + white,
        align(center + horizon, text(size: 5.5pt, weight: "bold", fill: white, str(row.number))),
      ))
    }
  ])
}
#let draw-tile(map, images, tile, types: (), page-width: 245.0, page-height: 125.0, marker-diameter: 4.0, context-margin: 0.06) = {
  let meta = map-image(map, images)
  if meta == none { return [Map image unavailable.] }
  let b = tile.bounds
  // Cropping may tighten to plants; the actual partition never changes.
  let crop = tile.at("crop-bounds", default: b)
  let view = geometry.detail-view(crop, map.width, map.height,
    context-margin: context-margin)
  let scale = geometry.fit-scale(view, viewport-width: page-width, viewport-height: page-height)
  let w = page-width * 1mm
  let h = page-height * 1mm
  let offset-x = (page-width - geometry.width(view) * scale) / 2.0
  let offset-y = (page-height - geometry.height(view) * scale) / 2.0
  let full-w = map.width * scale * 1mm
  let full-h = map.height * scale * 1mm
  let photo = image(read(meta.path, encoding: none), format: photo-format(meta), width: full-w, height: full-h, fit: "contain")
  block(width: w, height: h, clip: true, stroke: 0.55pt + rgb("9fad9e"), [
    #place(top + left, dx: (offset-x - view.x0 * scale) * 1mm,
      dy: (offset-y - view.y0 * scale) * 1mm, photo)
    // Outline the actual partition, distinct from the surrounding context.
    #place(top + left, dx: (offset-x + (b.x0 - view.x0) * scale) * 1mm,
      dy: (offset-y + (b.y0 - view.y0) * scale) * 1mm,
      rect(width: geometry.width(b) * scale * 1mm,
        height: geometry.height(b) * scale * 1mm,
        stroke: (paint: rgb("365943"), thickness: 0.6pt, dash: "dashed"), fill: none))
    #for row in tile.rows {
      let p = marker-pixel(map, row.plant)
      let x = (offset-x + (p.x - view.x0) * scale) * 1mm
      let y = (offset-y + (p.y - view.y0) * scale) * 1mm
      let ink = color-of(row, types)
      let radius = marker-diameter / 2 * 1mm
      place(top + left, dx: x - radius, dy: y - radius, circle(
        radius: radius, fill: ink, stroke: 0.35pt + white,
        align(center + horizon, text(size: 7pt, weight: "bold", fill: white, str(row.number))),
      ))
    }
  ])
}
#let tile-key(tile) = "T" + str(tile.index)
#let tile-legend(tile, types, language: "en") = {
  let items = tile.rows.sorted(key: r => r.number).map(row => {
    let ink = color-of(row, types)
    let sci = scientific(row, types)
    let name = common(row, types, language: language)
    let label = if name == "" or name == sci { emph(sci) } else { [#name · #emph(sci)] }
    box(width: 100%, [
      #box(width: 7mm, align(center + horizon, circle(
        radius: 2mm, fill: ink, stroke: 0.3pt + white,
        align(center + horizon, text(size: 6pt, weight: "bold", fill: white, str(row.number))),
      )))
      #h(1mm)
      #text(size: 7pt)[#label]
    ])
  })
  grid(columns: (1fr, 1fr, 1fr), column-gutter: 2mm, row-gutter: 1mm, ..items)
}
