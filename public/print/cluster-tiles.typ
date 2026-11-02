// Verdant gap-aware rectangular clustering. Pure Typst and deterministic.
// A bounded, greedy spatial partition: maximize natural gaps subject to
// minimum achievable page count. NO marker-overlap dependency.
#import "geometry.typ"

#let pixel-epsilon = 0.000001
#let pages-needed(n, capacity) = calc.ceil(n / capacity)

// Compare two possible axis-aligned cuts. Avoid recursive search or candidate
// history. Pages needed is a lower bound, not a global optimality guarantee.
#let better-cut(a, b) = {
  if b == none { return true }
  if a.pages != b.pages { return a.pages < b.pages }
  if calc.abs(a.relative-gap - b.relative-gap) > 0.000001 {
    return a.relative-gap > b.relative-gap
  }
  if a.largest != b.largest { return a.largest < b.largest }
  if a.axis != b.axis { return a.axis == "x" }
  a.cut < b.cut
}

// A linear sweep of gaps between distinct coordinates on each axis. No
// quadratic pairwise marker calculations. Identical points stay together.
#let best-cut(node, capacity) = {
  let best = none
  let checked = 0
  for axis in ("x", "y") {
    let ordered = node.rows.sorted(key: r => if axis == "x" {
      (r.pixel.x, r.number)
    } else {
      (r.pixel.y, r.number)
    })
    let span = if axis == "x" { geometry.width(node.bounds) }
      else { geometry.height(node.bounds) }
    for i in range(1, ordered.len()) {
      let before = ordered.at(i - 1)
      let after = ordered.at(i)
      let a = if axis == "x" { before.pixel.x } else { before.pixel.y }
      let b = if axis == "x" { after.pixel.x } else { after.pixel.y }
      let gap = b - a
      if gap > pixel-epsilon {
        let cut = a + gap / 2.0
        let candidate = (
          axis: axis, cut: cut,
          pages: pages-needed(i, capacity) + pages-needed(ordered.len() - i, capacity),
          relative-gap: gap / calc.max(1.0, span),
          largest: calc.max(i, ordered.len() - i),
        )
        checked += 1
        if better-cut(candidate, best) { best = candidate }
      }
    }
  }
  (cut: best, checked: checked)
}

#let split-node(node, choice) = {
  let axis = choice.axis
  let cut = choice.cut
  let first = node.rows.filter(r => if axis == "x" { r.pixel.x < cut }
    else { r.pixel.y < cut })
  let second = node.rows.filter(r => if axis == "x" { r.pixel.x >= cut }
    else { r.pixel.y >= cut })
  assert(first.len() > 0 and second.len() > 0, message: "Empty cluster split")
  assert(first.len() + second.len() == node.rows.len(), message: "Lost cluster marker")
  let b = node.bounds
  let b1 = if axis == "x" { geometry.box(b.x0, b.y0, cut, b.y1) }
    else { geometry.box(b.x0, b.y0, b.x1, cut) }
  let b2 = if axis == "x" { geometry.box(cut, b.y0, b.x1, b.y1) }
    else { geometry.box(b.x0, cut, b.x1, b.y1) }
  ((bounds: b1, rows: first, depth: node.depth + 1),
   (bounds: b2, rows: second, depth: node.depth + 1))
}

// Plan at most max-pages occupied tiles. Leaf partitions are disjoint; the
// separate crop-bounds shrink each detail image to its actual markers.
// When markers are coincident and cannot be cut, report remaining overflow.
#let make-cluster-tiles(map, plants, capacity: 30, max-pages: 12,
    outer-margin: 0.02, marker-diameter: 1.8,
    min-crop-fraction: 0.15) = {
  assert(type(capacity) == int and capacity >= 1, message: "tile-max-plants must be positive")
  assert(type(max-pages) == int and max-pages >= 1, message: "clustering-max-tiles must be positive")
  assert(outer-margin >= 0 and outer-margin <= 1, message: "Invalid outer margin")
  assert(marker-diameter > 0, message: "Invalid dot diameter")
  assert(min-crop-fraction > 0 and min-crop-fraction <= 1,
    message: "Invalid cluster minimum crop fraction")
  if plants.len() == 0 {
    return (tiles: (), page-count: 0, overflow: 0, checked: 0, stalled: false)
  }
  let located = geometry.prepare(map, plants, radius: marker-diameter / 2.0)
  let root = geometry.occupied-bounds(located, map.width, map.height,
    marker-diameter: marker-diameter, viewport-width: 155.0,
    viewport-height: 136.0, outer-margin: outer-margin)
  let nodes = ((bounds: root, rows: located, depth: 0),)
  let checked = 0
  while nodes.len() < max-pages {
    let choice = none
    for (i, node) in nodes.enumerate() {
      if node.rows.len() > capacity {
        let found = best-cut(node, capacity)
        checked += found.checked
        if found.cut != none {
          if choice == none or node.rows.len() > choice.size {
            choice = (index: i, size: node.rows.len(), cut: found.cut)
          }
        }
      }
    }
    if choice == none { break }
    let pieces = split-node(nodes.at(choice.index), choice.cut)
    nodes = nodes.slice(0, choice.index) + pieces + nodes.slice(choice.index + 1)
  }
  let ordered = nodes.sorted(key: n => (n.bounds.y0, n.bounds.x0,
    n.rows.sorted(key: r => r.number).first().number))
  let result = ordered.map(n => n + (
    crop-bounds: geometry.min-span-bounds(
      geometry.occupied-bounds(n.rows, map.width, map.height,
        marker-diameter: marker-diameter, viewport-width: 155.0,
        viewport-height: 136.0, outer-margin: outer-margin),
      map.width, map.height, min-fraction: min-crop-fraction),
    kind: "cluster", unresolved: n.rows.len() > capacity,
  ))
  let total = result.map(t => t.rows.len()).sum()
  assert(total == located.len(), message: "Cluster tiling dropped plant markers")
  let overflow = result.map(t => calc.max(0, t.rows.len() - capacity)).sum()
  (tiles: result, page-count: result.len(), overflow: overflow,
    checked: checked, stalled: overflow > 0)
}
