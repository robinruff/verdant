// Verdant printout map renderer, pure Typst. Compatible with backup schema 2.
// Longitude / latitude are always WGS84, image positions are pixel coordinates.
// Reproduces app.js screenshot calibration and geotiff-local.js projections.

#let PI = calc.pi
#let RAD = PI / 180.0
#let EARTH = 111194.92664455874

#let key(d, k, fallback: none) = if d == none { fallback } else { d.at(k, default: fallback) }
#let num(x) = type(x) == int or type(x) == float

#let utm-forward(lat, lon, epsg) = {
  let zone = calc.rem(epsg, 100)
  let a = 6378137.0
  let f = if epsg >= 25800 and epsg < 25900 { 1.0 / 298.257222101 } else { 1.0 / 298.257223563 }
  let e2 = f * (2.0 - f)
  let ep = e2 / (1.0 - e2)
  let phi = lat * RAD
  let L = (lon - (zone * 6 - 183)) * RAD
  let s = calc.sin(phi)
  let c = calc.cos(phi)
  let t = calc.tan(phi)
  let N = a / calc.sqrt(1.0 - e2 * s * s)
  let T = t * t
  let C = ep * c * c
  let A = c * L
  let M = a * (
    (1.0 - e2 / 4.0 - 3.0 * calc.pow(e2, 2) / 64.0 - 5.0 * calc.pow(e2, 3) / 256.0) * phi
    - (3.0 * e2 / 8.0 + 3.0 * calc.pow(e2, 2) / 32.0 + 45.0 * calc.pow(e2, 3) / 1024.0) * calc.sin(2.0 * phi)
    + (15.0 * calc.pow(e2, 2) / 256.0 + 45.0 * calc.pow(e2, 3) / 1024.0) * calc.sin(4.0 * phi)
    - (35.0 * calc.pow(e2, 3) / 3072.0) * calc.sin(6.0 * phi)
  )
  let east = 500000.0 + 0.9996 * N * (
    A + (1.0 - T + C) * calc.pow(A, 3) / 6.0
    + (5.0 - 18.0 * T + T*T + 72.0*C - 58.0*ep) * calc.pow(A, 5) / 120.0
  )
  let north = 0.9996 * (M + N * t * (
    A*A/2.0 + (5.0 - T + 9.0*C + 4.0*C*C) * calc.pow(A, 4) / 24.0
    + (61.0 - 58.0*T + T*T + 600.0*C - 330.0*ep) * calc.pow(A, 6) / 720.0
  ))
  (x: east, y: north)
}

#let project(lat, lon, epsg) = {
  if epsg == 4326 or epsg == 4258 { (x: lon, y: lat) }
  else if epsg == 3857 {
    let safe = calc.max(-85.05112878, calc.min(85.05112878, lat))
    (x: 6378137.0 * lon * RAD, y: 6378137.0 * calc.ln(calc.tan(PI/4.0 + safe*RAD/2.0)))
  } else if (epsg >= 25829 and epsg <= 25831) or (epsg >= 32629 and epsg <= 32631) {
    utm-forward(lat, lon, epsg)
  } else { none }
}

#let screenshot-calibration(map) = {
  let points = key(map, "points", fallback: ())
  if points.len() < 2 { return none }
  let a = points.at(0)
  let b = points.at(1)
  let lon-factor = EARTH * calc.cos((a.lat + b.lat) / 2.0 * RAD)
  let de = (b.lon - a.lon) * lon-factor
  let dn = (b.lat - a.lat) * EARTH
  let dx = b.x - a.x
  let dy = b.y - a.y
  let dist2 = dx * dx + dy * dy
  let distance = calc.sqrt(de * de + dn * dn)
  if dist2 < 625.0 or distance < 2.0 { return none }
  let ae = (de * dx - dn * dy) / dist2
  let be = (de * dy + dn * dx) / dist2
  let scale2 = ae * ae + be * be
  if scale2 <= 0.0 or lon-factor == 0.0 { return none }
  let c = (a: a, ae: ae, be: be, scale2: scale2, lon-factor: lon-factor)
  if points.len() > 2 {
    let check = points.at(2)
    let diffx = check.x - a.x
    let diffy = check.y - a.y
    let gotlat = a.lat + (be * diffx - ae * diffy) / EARTH
    let gotlon = a.lon + (ae * diffx + be * diffy) / lon-factor
    let error = calc.sqrt(calc.pow((gotlat - check.lat) * EARTH, 2) + calc.pow((gotlon - check.lon) * lon-factor, 2))
    if error > calc.max(5.0, distance * 0.2) { return none }
  }
  c
}

#let is-calibrated(map) = {
  if map == none { return false }
  if key(map, "geo") != none {
    let g = map.geo
    let a = key(g, "a", fallback: key(g, "dx"))
    let d = key(g, "d", fallback: key(g, "dy"))
    let b = key(g, "b", fallback: 0.0)
    let c = key(g, "c", fallback: 0.0)
    num(a) and num(d) and calc.abs(a*d - b*c) > 0.00000000000001
  } else { screenshot-calibration(map) != none }
}

#let geo-to-pixel(map, lat, lon) = {
  if map == none { return none }
  let geo = key(map, "geo")
  if geo != none {
    let xy = project(lat, lon, geo.epsg)
    if xy == none { return none }
    let a = key(geo, "a", fallback: key(geo, "dx"))
    let b = key(geo, "b", fallback: 0.0)
    let c = key(geo, "c", fallback: 0.0)
    let d = key(geo, "d", fallback: key(geo, "dy"))
    let det = a*d - b*c
    if calc.abs(det) < 0.00000000000001 { return none }
    let x = xy.x - geo.x0
    let y = xy.y - geo.y0
    return (x: (x*d - y*b)/det, y: (y*a - x*c)/det)
  }
  let cal = screenshot-calibration(map)
  if cal == none { return none }
  let e = (lon - cal.a.lon) * cal.lon-factor
  let n = (lat - cal.a.lat) * EARTH
  (x: cal.a.x + (cal.ae*e + cal.be*n)/cal.scale2,
   y: cal.a.y + (cal.be*e - cal.ae*n)/cal.scale2)
}

#let marker-coordinate(plant) = {
  let geometry = key(plant, "geometry")
  if geometry == none { return none }
  let coords = geometry.coordinates
  let points = if geometry.type == "Point" { (coords,) }
    else if geometry.type == "LineString" { coords }
    else if geometry.type == "Polygon" { coords.flatten() }
    else { () }
  if points.len() == 0 { return none }
  (lon: points.map(p => p.at(0)).sum() / points.len(),
   lat: points.map(p => p.at(1)).sum() / points.len())
}

#let marker-pixel(map, plant) = {
  let coordinate = marker-coordinate(plant)
  if coordinate == none { return none }
  geo-to-pixel(map, coordinate.lat, coordinate.lon)
}

#let within-map(map, p) = p != none and p.x >= 0 and p.y >= 0 and p.x <= map.width and p.y <= map.height

#let photo-format(meta) = {
  let mime = key(meta, "mimeType", fallback: "image/jpeg")
  if mime == "image/png" { "png" }
  else if mime == "image/webp" { "webp" }
  else if mime == "image/gif" { "gif" }
  else { "jpg" }
}

