// Verdant auto-grid selector — bounded exhaustive comparison of rectangular
// fixed-grid DIMENSIONS. Pure Typst; does not change the baseline renderer.
// Every collision is checked at the actual uniform print scale, after crop
// context expansion. No recursive search and no retained candidate history.
#import "tiles.typ": make-tiles
#import "geometry.typ"

#let pair-epsilon = 0.000001  // mm: tolerance for badge edge contact
#let same-pixel-epsilon = 0.0001  // source-image pixels

#let inspect-tile(tile, map, diameter: 4.0, padding: 0.5,
    context-margin: 0.06, viewport-width: 245.0, viewport-height: 125.0) = {
  let crop = tile.at("crop-bounds", default: tile.bounds)
  let view = geometry.detail-view(crop, map.width, map.height,
    context-margin: context-margin)
  let scale = geometry.fit-scale(view, viewport-width: viewport-width,
    viewport-height: viewport-height)
  let required = diameter + padding
  let collisions = 0
  let coincident = 0
  let minimum = none
  let worst-deficit = 0.0
  let examples = ()
  let members = tile.rows
  // Count every same-page collision, not just a nearest-neighbor sample.
  // The filter below uses only squared pixel distances until a pair is
  // close enough to contribute to the actual printed minimum spacing.
  for i in range(members.len()) {
    let a = members.at(i)
    for j in range(i + 1, members.len()) {
      let b = members.at(j)
      let dx = a.pixel.x - b.pixel.x
      let dy = a.pixel.y - b.pixel.y
      let separation = calc.sqrt(dx * dx + dy * dy) * scale
      if minimum == none or separation < minimum { minimum = separation }
      if separation + pair-epsilon < required {
        collisions += 1
        worst-deficit = calc.max(worst-deficit, required - separation)
        if examples.len() < 6 {
          examples.push(str(a.number) + "/" + str(b.number))
        }
      }
      if calc.abs(dx) <= same-pixel-epsilon and calc.abs(dy) <= same-pixel-epsilon {
        coincident += 1
      }
    }
  }
  let utilization = geometry.area(view) * scale * scale / (viewport-width * viewport-height)
  (collisions: collisions, coincident: coincident, min-spacing: minimum,
    worst-deficit: worst-deficit, examples: examples, utilization: utilization,
    view: view, scale: scale)
}

// Attach per-tile diagnostics for the detail page, and aggregate full-layout
// diagnostics without retaining arrays for all candidate grids.
#let inspect-grid(tiles, map, diameter: 4.0, padding: 0.5, context-margin: 0.06,
    viewport-width: 245.0, viewport-height: 125.0, max-per-tile: none) = {
  let annotated = ()
  let collisions = 0
  let coincident = 0
  let minimum = none
  let worst-deficit = 0.0
  let utilization = 0.0
  let overflow = 0
  for tile in tiles {
    if max-per-tile != none { overflow += calc.max(0, tile.rows.len() - max-per-tile) }
    let m = inspect-tile(tile, map, diameter: diameter, padding: padding,
      context-margin: context-margin, viewport-width: viewport-width,
      viewport-height: viewport-height)
    annotated.push(tile + (metrics: m))
    collisions += m.collisions
    coincident += m.coincident
    worst-deficit = calc.max(worst-deficit, m.worst-deficit)
    utilization += m.utilization
    if m.min-spacing != none {
      if minimum == none or m.min-spacing < minimum { minimum = m.min-spacing }
    }
  }
  let mean-utilization = if tiles.len() == 0 { 0.0 } else { utilization / tiles.len() }
  (tiles: annotated, page-count: annotated.len(), collisions: collisions,
    coincident: coincident, min-spacing: minimum, worst-deficit: worst-deficit,
    utilization: mean-utilization, overflow: overflow)
}

// Lexicographic choice. A collision-free candidate always wins. Among feasible
// candidates, prefer fewer occupied pages, then better minimum spacing, then
// greater map use. If NONE is feasible, minimize collision pairs first,
// then overlap severity and occupied pages; do not claim a solution exists.
#let preferable(a, b) = {
  if b == none { return true }
  if (a.overflow == 0) != (b.overflow == 0) { return a.overflow == 0 }
  if a.overflow != b.overflow { return a.overflow < b.overflow }
  if (a.collisions == 0) != (b.collisions == 0) { return a.collisions == 0 }
  if a.collisions == 0 {
    if a.page-count != b.page-count { return a.page-count < b.page-count }
  } else {
    if a.collisions != b.collisions { return a.collisions < b.collisions }
    if calc.abs(a.worst-deficit - b.worst-deficit) > 0.000001 {
      return a.worst-deficit < b.worst-deficit
    }
    if a.page-count != b.page-count { return a.page-count < b.page-count }
  }
  let distance-a = if a.min-spacing == none { 1000000.0 } else { a.min-spacing }
  let distance-b = if b.min-spacing == none { 1000000.0 } else { b.min-spacing }
  if calc.abs(distance-a - distance-b) > 0.000001 {
    return distance-a > distance-b
  }
  // When page count and spacing tie, do not subdivide empty space gratuitously.
  if a.columns * a.rows != b.columns * b.rows {
    return a.columns * a.rows < b.columns * b.rows
  }
  if calc.abs(a.utilization - b.utilization) > 0.000001 {
    return a.utilization > b.utilization
  }
  // Stable, predictable tie breaker: shallower grid, then fewer columns.
  if a.rows != b.rows { return a.rows < b.rows }
  a.columns < b.columns
}

// Manual mode preserves the baseline fixed-grid assignment and appearance.
// Automatic mode enumerates at most max-columns * max-rows dimension pairs.
// Cap BOTH total potential cells and actually occupied pages. Manual override
// is never silently restricted by the automatic search limits.
#let select-grid(map, plants, mode: "auto", columns: 3, rows: 2,
    max-columns: 5, max-rows: 4, max-cells: 16, max-pages: 12,
    marker-diameter: 4.0, marker-padding: 0.5,
    outer-margin: 0.02, context-margin: 0.06,
    viewport-width: 245.0, viewport-height: 125.0, max-per-tile: none) = {
  assert(mode == "auto" or mode == "manual", message: "tile-mode must be auto or manual")
  assert(type(columns) == int and columns >= 1, message: "tile-columns must be positive")
  assert(type(rows) == int and rows >= 1, message: "tile-rows must be positive")
  assert(type(max-columns) == int and max-columns >= 1, message: "auto-max-columns must be positive")
  assert(type(max-rows) == int and max-rows >= 1, message: "auto-max-rows must be positive")
  assert(type(max-cells) == int and max-cells >= 1, message: "auto-max-cells must be positive")
  assert(type(max-pages) == int and max-pages >= 1, message: "auto-max-pages must be positive")
  assert(marker-diameter > 0 and marker-padding >= 0, message: "Marker diameter/padding invalid")
  assert(max-per-tile == none or (type(max-per-tile) == int and max-per-tile >= 1),
    message: "max-per-tile must be a positive integer or none")
  assert(viewport-width > 0 and viewport-height > 0, message: "Invalid print viewport")
  assert(context-margin >= 0 and context-margin <= 1, message: "tile-context-margin must be between 0 and 1")
  if plants.len() == 0 {
    return (tiles: (), columns: columns, rows: rows, page-count: 0,
      collisions: 0, coincident: 0, min-spacing: none,
      worst-deficit: 0.0, utilization: 0.0, candidates: 0, feasible: true, overflow: 0)
  }
  let best = none
  let candidates = 0
  let c-range = if mode == "manual" { (columns,) } else { range(1, max-columns + 1) }
  let r-range = if mode == "manual" { (rows,) } else { range(1, max-rows + 1) }
  for r in r-range {
    for c in c-range {
      if mode == "manual" or c * r <= max-cells {
        let made = make-tiles(map, plants, columns: c, rows: r,
          marker-diameter: marker-diameter, outer-margin: outer-margin)
        if mode == "manual" or made.len() <= max-pages {
          let inspected = inspect-grid(made, map, diameter: marker-diameter,
            padding: marker-padding, context-margin: context-margin,
            viewport-width: viewport-width, viewport-height: viewport-height,
            max-per-tile: max-per-tile)
          let candidate = inspected + (columns: c, rows: r)
          candidates += 1
          if preferable(candidate, best) { best = candidate }
        }
      }
    }
  }
  // 1x1 is always inside the bounds, so at least one candidate is evaluated.
  assert(best != none, message: "No grid candidate was evaluated")
  best + (candidates: candidates, feasible: best.collisions == 0 and best.overflow == 0)
}
