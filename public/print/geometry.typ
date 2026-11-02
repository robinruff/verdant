// Fixed-grid geometry: all positions in the original image pixel coordinates.
#import "map.typ": marker-pixel

#let box(x0, y0, x1, y1) = (x0: x0, y0: y0, x1: x1, y1: y1)
#let width(b) = b.x1 - b.x0
#let height(b) = b.y1 - b.y0
#let area(b) = width(b) * height(b)
// Uniform fit: printed scale in mm per source-image pixel; never distort the image.
#let fit-scale(b, viewport-width: 245.0, viewport-height: 125.0) = calc.min(viewport-width / width(b), viewport-height / height(b))
#let occupied-bounds(rows, map-width, map-height, marker-diameter: 4.0, viewport-width: 245.0, viewport-height: 125.0, outer-margin: 0.02) = {
  if rows.len() == 0 { return box(0.0, 0.0, map-width, map-height) }
  let xs = rows.map(r => r.pixel.x)
  let ys = rows.map(r => r.pixel.y)
  let xmin = xs.at(0)
  let xmax = xs.at(0)
  let ymin = ys.at(0)
  let ymax = ys.at(0)
  for x in xs { xmin = calc.min(xmin, x); xmax = calc.max(xmax, x) }
  for y in ys { ymin = calc.min(ymin, y); ymax = calc.max(ymax, y) }
  // Add enough room for marker disks and a small visual gutter.
  // Expand the tighter dimension when points fall on one line or coincide.
  let span-x = calc.max(xmax - xmin, 1.0)
  let span-y = calc.max(ymax - ymin, 1.0)
  let provisional-scale = calc.min(viewport-width / span-x, viewport-height / span-y)
  let marker-pad = calc.max(1.0, (marker-diameter / 2.0 + 1.0) / provisional-scale)
  let pad-x = calc.max(marker-pad, span-x * outer-margin)
  let pad-y = calc.max(marker-pad, span-y * outer-margin)
  let x0 = calc.max(0.0, xmin - pad-x)
  let y0 = calc.max(0.0, ymin - pad-y)
  let x1 = calc.min(map-width, xmax + pad-x)
  let y1 = calc.min(map-height, ymax + pad-y)
  // Avoid degenerate extents when the only marker lies on an image edge.
  box(x0, y0, calc.max(x0 + 0.00001, x1), calc.max(y0 + 0.00001, y1))
}
#let center(row) = row.pixel
#let prepare(map, rows, radius: 2.0) = rows.map(row => row + (pixel: marker-pixel(map, row.plant), radius: radius))

// The single source of truth for detail-map cropping. Keep this view
// identical in the printer and in the collision diagnostics.
// Returns ORIGINAL IMAGE PIXEL coordinates, not page coordinates.
#let detail-view(bounds, map-width, map-height, context-margin: 0.06) = {
  let pad-x = width(bounds) * context-margin
  let pad-y = height(bounds) * context-margin
  box(
    calc.max(0.0, bounds.x0 - pad-x),
    calc.max(0.0, bounds.y0 - pad-y),
    calc.min(map-width, bounds.x1 + pad-x),
    calc.min(map-height, bounds.y1 + pad-y),
  )
}

// Guard against absurd enlargement of a full source image when a cluster
// occupies only a handful of pixels. This only expands the DISPLAY crop;
// it never changes geographic ownership or the actual partition rectangle.
#let min-span-bounds(bounds, map-width, map-height, min-fraction: 0.15) = {
  assert(min-fraction > 0 and min-fraction <= 1, message: "Invalid min crop fraction")
  let need-x = map-width * min-fraction
  let need-y = map-height * min-fraction
  let start-x = if width(bounds) >= need-x { bounds.x0 } else {
    calc.max(0.0, calc.min(map-width - need-x,
      (bounds.x0 + bounds.x1 - need-x) / 2.0))
  }
  let start-y = if height(bounds) >= need-y { bounds.y0 } else {
    calc.max(0.0, calc.min(map-height - need-y,
      (bounds.y0 + bounds.y1 - need-y) / 2.0))
  }
  box(start-x, start-y,
    if width(bounds) >= need-x { bounds.x1 } else { start-x + need-x },
    if height(bounds) >= need-y { bounds.y1 } else { start-y + need-y })
}
