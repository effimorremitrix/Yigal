// Simplified continent outlines as [lon, lat] polygons — coarse but recognizable,
// enough for a branded route map without external tile servers.
export type LonLat = [number, number]

export const CONTINENTS: LonLat[][] = [
  // North America
  [
    [-168, 65], [-165, 60], [-158, 58], [-152, 60], [-145, 60], [-135, 58], [-130, 54],
    [-125, 49], [-124, 40], [-117, 33], [-110, 24], [-105, 20], [-95, 16], [-85, 11],
    [-79, 9], [-77, 8], [-83, 15], [-88, 16], [-90, 21], [-97, 26], [-91, 29], [-84, 30],
    [-81, 25], [-80, 32], [-76, 35], [-70, 42], [-66, 45], [-60, 47], [-55, 52], [-60, 56],
    [-64, 60], [-70, 62], [-78, 62], [-85, 66], [-95, 68], [-110, 68], [-125, 70],
    [-140, 70], [-155, 71], [-165, 68],
  ],
  // South America
  [
    [-77, 8], [-75, 10], [-72, 12], [-64, 10], [-60, 8], [-52, 5], [-44, -3], [-35, -8],
    [-39, -15], [-41, -22], [-48, -28], [-53, -34], [-58, -39], [-65, -45], [-68, -52],
    [-71, -54], [-73, -50], [-71, -40], [-72, -30], [-70, -18], [-75, -15], [-81, -6],
    [-80, 1],
  ],
  // Africa
  [
    [-6, 35], [10, 37], [20, 32], [30, 31], [34, 28], [37, 22], [43, 12], [51, 12],
    [46, 5], [41, -2], [40, -10], [36, -18], [35, -25], [32, -29], [27, -34], [20, -35],
    [18, -32], [14, -22], [12, -15], [9, -1], [9, 4], [4, 6], [-8, 4], [-13, 9],
    [-17, 15], [-16, 21], [-10, 28],
  ],
  // Eurasia
  [
    [-9, 37], [-9, 43], [-4, 48], [0, 49.5], [4, 51], [8, 54], [8, 57], [10, 59],
    [5, 62], [14, 68], [25, 71], [30, 70], [40, 66], [45, 68], [60, 69], [75, 73],
    [90, 75], [110, 77], [130, 73], [140, 72], [160, 70], [170, 67], [179, 66],
    [179, 64], [170, 60], [162, 56], [156, 51], [142, 54], [135, 44], [130, 43],
    [129, 35], [126, 35], [122, 39], [121, 37], [122, 31], [120, 28], [117, 23],
    [110, 20], [108, 17], [109, 12], [105, 9], [100, 13], [103, 1.5], [100, 6],
    [98, 8], [95, 16], [91, 22], [87, 21], [80, 15], [80, 13], [77, 8], [73, 15],
    [70, 21], [66, 25], [61, 25], [57, 27], [56, 26], [59, 22], [55, 17], [52, 16],
    [43, 12.5], [39, 15], [35, 28], [32, 30], [34, 32], [36, 36], [30, 36], [27, 37],
    [26, 40], [23, 36], [22, 37], [20, 40], [18, 40], [15, 38], [16, 41], [14, 42],
    [12, 44], [8, 44], [3, 42], [0, 40], [-2, 37], [-6, 36],
  ],
  // Australia
  [
    [114, -22], [114, -34], [118, -35], [124, -33], [130, -32], [136, -35], [140, -38],
    [147, -38], [150, -37], [153, -28], [153, -25], [146, -19], [142, -11], [136, -12],
    [132, -11], [126, -14], [122, -18],
  ],
  // Britain & Ireland (merged blob)
  [[-10, 52], [-6, 55], [-5, 58], [-3, 58], [-1, 57], [0, 53], [1, 51], [-5, 50], [-10, 51]],
  // Japan
  [[130, 31], [133, 35], [137, 35], [140, 36], [141, 40], [143, 44], [140, 43], [136, 37], [132, 34]],
  // Greenland
  [[-45, 60], [-40, 65], [-22, 70], [-20, 76], [-30, 82], [-60, 82], [-68, 78], [-55, 70], [-52, 65]],
  // Madagascar
  [[44, -16], [50, -16], [47, -25], [44, -22]],
  // Sumatra
  [[95, 5], [103, -1], [106, -6], [102, -5], [95, 3]],
  // Borneo
  [[109, 1], [113, 4], [117, 7], [119, 1], [116, -3], [110, -2]],
  // New Guinea
  [[131, -1], [141, -3], [147, -6], [143, -8], [138, -8], [132, -4]],
  // New Zealand
  [[167, -46], [174, -41], [178, -38], [174, -37], [172, -40]],
]

export const MAP_W = 1000
export const MAP_H = 400
const LAT_TOP = 84
const LAT_SPAN = 144 // 84 down to -60

export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

export function project(lat: number, lon: number): [number, number] {
  const x = ((wrapLon(lon) + 180) / 360) * MAP_W
  const y = ((LAT_TOP - lat) / LAT_SPAN) * MAP_H
  return [x, y]
}

// ---- Shared route geometry (used by the fleet map and the per-shipment route map) ----

/** Trade-lane waypoints are [lat, lon], the opposite order from the continent outlines. */
export type LatLon = [number, number]

/**
 * Projection without the longitude wrap. Transpacific lane waypoints carry
 * longitudes past 180, so an unwrapped route is one continuous polyline instead
 * of two pieces at opposite edges of the map. Callers that use it must tile the
 * continents with `worldTiles` to fill the space it can reach into.
 */
export function projectRaw(lat: number, lon: number): [number, number] {
  const x = ((lon + 180) / 360) * MAP_W
  const y = ((LAT_TOP - lat) / LAT_SPAN) * MAP_H
  return [x, y]
}

function toPath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

/** Splits a wrap-projected polyline wherever it crosses the antimeridian. */
export function toPathSegments(waypoints: LatLon[]): string[] {
  const pts = waypoints.map(([lat, lon]) => project(lat, lon))
  const segments: string[] = []
  let current: [number, number][] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    if (Math.abs(pts[i][0] - pts[i - 1][0]) > MAP_W / 2) {
      segments.push(toPath(current))
      current = [pts[i]]
    } else {
      current.push(pts[i])
    }
  }
  segments.push(toPath(current))
  return segments.filter((s) => s.includes('L'))
}

/** One continuous path through the waypoints, in unwrapped longitude space. */
export function toContinuousPath(waypoints: LatLon[]): string {
  return toPath(waypoints.map(([lat, lon]) => projectRaw(lat, lon)))
}

/** Position along the lane's waypoints at fraction t, in unwrapped lon space. */
export function positionAlong(waypoints: LatLon[], t: number): LatLon {
  const dists: number[] = [0]
  for (let i = 1; i < waypoints.length; i++) {
    const [la1, lo1] = waypoints[i - 1]
    const [la2, lo2] = waypoints[i]
    dists.push(dists[i - 1] + Math.hypot(la2 - la1, lo2 - lo1))
  }
  const target = t * dists[dists.length - 1]
  for (let i = 1; i < dists.length; i++) {
    if (dists[i] >= target) {
      const f = (target - dists[i - 1]) / (dists[i] - dists[i - 1] || 1)
      const [la1, lo1] = waypoints[i - 1]
      const [la2, lo2] = waypoints[i]
      return [la1 + (la2 - la1) * f, lo1 + (lo2 - lo1) * f]
    }
  }
  return waypoints[waypoints.length - 1]
}

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
  /** viewBox width relative to the full world, for scaling strokes and labels. */
  k: number
}

/** A viewBox framing the given unwrapped points, at the world map's aspect ratio. */
export function frameArea(pts: [number, number][], padding = 0.35): ViewBox {
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const aspect = MAP_W / MAP_H
  let w = Math.max(maxX - minX, 1) * (1 + padding * 2)
  let h = Math.max(maxY - minY, 1) * (1 + padding * 2)
  if (w / h < aspect) w = h * aspect
  else h = w / aspect
  if (w > MAP_W) {
    w = MAP_W
    h = MAP_H
  }

  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  // x is free to run outside the world band — `worldTiles` fills what it reaches.
  return { x: cx - w / 2, y: Math.min(Math.max(cy - h / 2, 0), MAP_H - h), w, h, k: w / MAP_W }
}

/**
 * Horizontal offsets at which to repeat the continent outlines so they cover the
 * view. The viewBox clips them, which draws a seamlessly wrapped world without
 * having to cut any polygon.
 */
export function worldTiles(view: ViewBox): number[] {
  const first = Math.floor(view.x / MAP_W)
  const last = Math.floor((view.x + view.w) / MAP_W)
  const tiles: number[] = []
  for (let i = first; i <= last; i++) tiles.push(i * MAP_W)
  return tiles
}

/** The copy of `x` (one per world tile) that sits closest to `near`. */
export function nearestX(x: number, near: number): number {
  return x + MAP_W * Math.round((near - x) / MAP_W)
}
