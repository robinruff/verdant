// Verdant leader-line maps: A4 clustered details and A3 entire-map plan.
// Each plant is shown as a small colored dot connected to a numbered label.
// Left common/scientific names are RIGHT aligned, badge at map-facing right.
#import "map.typ": marker-pixel, photo-format
#import "geometry.typ"
#import "tiles.typ": map-image, color-of, common, scientific

// All dimensions in printed mm. A4 fits within 271 mm content width.
#let detail-layout = (
  map-left: 58.0, map-width: 155.0, map-height: 136.0,
  label-width: 54.0, label-gap: 4.0,
  row-height: 8.5, max-per-side: 15,
)
// A3 usable content width is 388 mm (16 mm margins on both sides).
#let overview-layout = (
  map-left: 70.0, map-width: 248.0, map-height: 207.0,
  label-width: 66.0, label-gap: 4.0,
  row-height: 10.0, max-per-side: 18,
)
#let max-labels = 2 * detail-layout.max-per-side
#let max-overview-labels = 2 * overview-layout.max-per-side

#let distribute-labels(rows, height, row-height) = {
  let arranged = ()
  let half = row-height / 2.0
  let previous = -1000000.0
  for row in rows {
    let preferred = calc.max(half, calc.min(height - half, row.print-y))
    let y = calc.max(preferred, previous + row-height)
    arranged.push(row + (label-y: y))
    previous = y
  }
  if arranged.len() > 0 and previous > height - half {
    let next = height - half
    for i in range(arranged.len()).rev() {
      let item = arranged.at(i)
      let corrected = calc.min(item.label-y, next)
      arranged.at(i) = item + (label-y: corrected)
      next = corrected - row-height
    }
  }
  arranged
}

// Full-map mode intentionally does NOT trim the background to the markers.
// Detail mode trims to crop-bounds, while the true partition remains separate.
#let make-label-layout(map, tile, config: detail-layout,
    whole-map: false, context-margin: 0.06) = {
  let base = if whole-map { geometry.box(0.0, 0.0, map.width, map.height) }
    else { tile.at("crop-bounds", default: tile.bounds) }
  let view = if whole-map { base } else {
    geometry.detail-view(base, map.width, map.height,
      context-margin: context-margin)
  }
  let scale = geometry.fit-scale(view, viewport-width: config.map-width,
    viewport-height: config.map-height)
  let offset-x = (config.map-width - geometry.width(view) * scale) / 2.0
  let offset-y = (config.map-height - geometry.height(view) * scale) / 2.0
  let positioned = tile.rows.map(row => {
    let p = row.at("pixel", default: none)
    if p == none { p = marker-pixel(map, row.plant) }
    row + (print-x: offset-x + (p.x - view.x0) * scale,
      print-y: offset-y + (p.y - view.y0) * scale)
  })
  let ordered = positioned.sorted(key: row => (row.print-x, row.number))
  let near-left = ordered.filter(row => row.print-x < config.map-width / 2.0).len()
  let minimum-left = calc.max(0, ordered.len() - config.max-per-side)
  let maximum-left = calc.min(config.max-per-side, ordered.len())
  let count-left = calc.max(minimum-left, calc.min(maximum-left, near-left))
  let left = ordered.slice(0, count-left).sorted(key: row => (row.print-y, row.number))
  let right = ordered.slice(count-left).sorted(key: row => (row.print-y, row.number))
  (left: distribute-labels(left, config.map-height, config.row-height),
    right: distribute-labels(right, config.map-height, config.row-height),
    view: view, scale: scale, offset-x: offset-x, offset-y: offset-y,
    fits: ordered.len() <= 2 * config.max-per-side)
}

#let label-entry(row, types, side: "left", language: "en",
    width: 54.0, row-height: 8.5) = {
  let ink = color-of(row, types)
  let name = common(row, types, language: language)
  let sci = scientific(row, types)
  let show-name = if name == "" { sci } else { name }
  let badge = circle(radius: 1.85mm, fill: ink, stroke: 0.3pt + white,
    align(center + horizon,
      text(size: 5.7pt, weight: "bold", fill: white, str(row.number))))
  let text-side = if side == "left" { right } else { left }
  let names-width = (width - 6.0) * 1mm
  let names = box(width: names-width, height: row-height * 1mm,
    align(text-side + horizon, stack(dir: ttb, spacing: 0.1mm,
      box(width: names-width, align(text-side,
        text(size: 6.7pt, weight: "medium", show-name))),
      box(width: names-width, align(text-side,
        text(size: 5.8pt, style: "italic", fill: rgb("526456"), sci))))))
  if side == "left" {
    grid(columns: (names-width, 4.0mm), column-gutter: 1.0mm,
      align(right + horizon, names), align(center + horizon, badge))
  } else {
    grid(columns: (4.0mm, names-width), column-gutter: 1.0mm,
      align(center + horizon, badge), align(left + horizon, names))
  }
}

#let draw-side-labels(map, images, tile, types: (), language: "en",
    context-margin: 0.06, dot-diameter: 1.8, whole-map: false) = {
  let meta = map-image(map, images)
  if meta == none { return [Map image unavailable.] }
  let cfg = if whole-map { overview-layout } else { detail-layout }
  let layout = make-label-layout(map, tile, config: cfg,
    whole-map: whole-map, context-margin: context-margin)
  assert(layout.fits, message: "Side labels exceed this page's capacity")
  let view = layout.view
  let scale = layout.scale
  let total-width = cfg.map-left + cfg.map-width + cfg.label-gap + cfg.label-width
  let image-width = map.width * scale * 1mm
  let image-height = map.height * scale * 1mm
  let photo = image(read(meta.path, encoding: none), format: photo-format(meta),
    width: image-width, height: image-height, fit: "contain")
  block(width: total-width * 1mm, height: cfg.map-height * 1mm, [
    // Clip only the map background; leaders and labels sit outside it.
    #place(top + left, dx: cfg.map-left * 1mm,
      block(width: cfg.map-width * 1mm, height: cfg.map-height * 1mm,
        clip: true, fill: rgb("f5f7f3"), stroke: 0.45pt + rgb("9fad9e"), [
          #place(top + left,
            dx: (layout.offset-x - view.x0 * scale) * 1mm,
            dy: (layout.offset-y - view.y0 * scale) * 1mm, photo)
          #if not whole-map {
            // True partition border, not the tight display crop.
            place(top + left,
              dx: (layout.offset-x + (tile.bounds.x0 - view.x0) * scale) * 1mm,
              dy: (layout.offset-y + (tile.bounds.y0 - view.y0) * scale) * 1mm,
              rect(width: geometry.width(tile.bounds) * scale * 1mm,
                height: geometry.height(tile.bounds) * scale * 1mm,
                stroke: (paint: rgb("365943"), thickness: 0.6pt, dash: "dashed"),
                fill: none))
          }
        ]))
    #for row in layout.left {
      let ink = color-of(row, types).lighten(36%)
      let px = cfg.map-left + row.print-x
      let py = row.print-y
      let ty = row.label-y
      place(top + left, line(start: (px * 1mm, py * 1mm),
        end: (cfg.map-left * 1mm, ty * 1mm), stroke: 0.28pt + ink))
      place(top + left, line(start: (cfg.map-left * 1mm, ty * 1mm),
        end: ((cfg.map-left - cfg.label-gap - 3.0) * 1mm, ty * 1mm),
        stroke: 0.28pt + ink))
    }
    #for row in layout.right {
      let ink = color-of(row, types).lighten(36%)
      let px = cfg.map-left + row.print-x
      let py = row.print-y
      let ty = row.label-y
      place(top + left, line(start: (px * 1mm, py * 1mm),
        end: ((cfg.map-left + cfg.map-width) * 1mm, ty * 1mm),
        stroke: 0.28pt + ink))
      place(top + left, line(start: ((cfg.map-left + cfg.map-width) * 1mm, ty * 1mm),
        end: ((cfg.map-left + cfg.map-width + cfg.label-gap + 2.0) * 1mm, ty * 1mm),
        stroke: 0.28pt + ink))
    }
    #for row in layout.left + layout.right {
      let radius = dot-diameter / 2.0 * 1mm
      place(top + left,
        dx: (cfg.map-left + row.print-x) * 1mm - radius,
        dy: row.print-y * 1mm - radius,
        circle(radius: radius, fill: color-of(row, types),
          stroke: 0.35pt + white))
    }
    #for row in layout.left {
      place(top + left, dx: 0mm,
        dy: (row.label-y - cfg.row-height / 2.0) * 1mm,
        label-entry(row, types, side: "left", language: language,
          width: cfg.label-width, row-height: cfg.row-height))
    }
    #for row in layout.right {
      place(top + left,
        dx: (cfg.map-left + cfg.map-width + cfg.label-gap) * 1mm,
        dy: (row.label-y - cfg.row-height / 2.0) * 1mm,
        label-entry(row, types, side: "right", language: language,
          width: cfg.label-width, row-height: cfg.row-height))
    }
  ])
}
