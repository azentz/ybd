export type Point = { x: number; y: number }

export type SectorShape = {
  kind: 'sector'
  center: Point
  arcCenter?: Point
  innerRadius: number
  outerRadius: number
  startAngleDeg: number
  endAngleDeg: number
}

export type CircleShape = {
  kind: 'circle'
  center: Point
  radius: number
}

export type PolygonShape = {
  kind: 'polygon'
  points: Point[]
}

export type ArcTriangleShape = {
  kind: 'arc-triangle'
  points: [Point, Point, Point]
  sideRadii?: [number, number, number]
}

export type ZoneShape = SectorShape | CircleShape | PolygonShape | ArcTriangleShape

export type BaseballZone = {
  id: string
  label: string
  score: number
  priority: number
  shape: ZoneShape
}

const HOME_CENTER: Point = { x: 500, y: 833 }
export const PITCHER_CENTER: Point = { x: 500, y: 700 }
const FAN_START = 225
const FAN_END = 315

const YELLOW_BADGE_POINTS: [Point, Point, Point] = [
  { x: 500, y: 400 },
  { x: 400, y: 190 },
  { x: 600, y: 190 },
]

const YELLOW_BADGE_RADII: [number, number, number] = [400, 400, 400]

// Interpolation from yellow side edges toward the shared bottom point.
// Using one scale factor keeps red corners on yellow edges and preserves arc proportions.
const RED_BADGE_SCALE = 0.78

function normalizeToPi(angle: number): number {
  let value = angle
  while (value <= -Math.PI) value += Math.PI * 2
  while (value > Math.PI) value -= Math.PI * 2
  return value
}

function pointOnMinorArc(start: Point, end: Point, center: Point, t: number): Point {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x)
  const a1 = Math.atan2(end.y - center.y, end.x - center.x)
  const delta = normalizeToPi(a1 - a0)
  const angle = a0 + delta * t
  const radius = Math.hypot(start.x - center.x, start.y - center.y)

  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  }
}

function svgArcCenter(
  start: Point,
  end: Point,
  radius: number,
  largeArcFlag: 0 | 1,
  sweepFlag: 0 | 1,
): Point {
  const x1p = (start.x - end.x) / 2
  const y1p = (start.y - end.y) / 2
  const denom = (x1p * x1p) + (y1p * y1p)
  const numer = Math.max(0, (radius * radius) - denom)
  const sign = largeArcFlag === sweepFlag ? -1 : 1
  const factor = sign * Math.sqrt(numer / Math.max(Number.EPSILON, denom))

  const cxp = factor * y1p
  const cyp = -factor * x1p

  return {
    x: cxp + (start.x + end.x) / 2,
    y: cyp + (start.y + end.y) / 2,
  }
}

const yellowLeftCenter = svgArcCenter(
  YELLOW_BADGE_POINTS[0],
  YELLOW_BADGE_POINTS[1],
  YELLOW_BADGE_RADII[0],
  0,
  1,
)

const yellowRightCenter = svgArcCenter(
  YELLOW_BADGE_POINTS[2],
  YELLOW_BADGE_POINTS[0],
  YELLOW_BADGE_RADII[2],
  0,
  1,
)

const yellowTopCenter = svgArcCenter(
  YELLOW_BADGE_POINTS[1],
  YELLOW_BADGE_POINTS[2],
  YELLOW_BADGE_RADII[1],
  0,
  1,
)

const RED_BADGE_POINTS: [Point, Point, Point] = [
  YELLOW_BADGE_POINTS[0],
  pointOnMinorArc(YELLOW_BADGE_POINTS[0], YELLOW_BADGE_POINTS[1], yellowLeftCenter, RED_BADGE_SCALE),
  pointOnMinorArc(
    YELLOW_BADGE_POINTS[0],
    YELLOW_BADGE_POINTS[2],
    yellowRightCenter,
    RED_BADGE_SCALE,
  ),
]

const redTopRadius = Math.hypot(
  RED_BADGE_POINTS[1].x - yellowTopCenter.x,
  RED_BADGE_POINTS[1].y - yellowTopCenter.y,
)

const RED_BADGE_RADII: [number, number, number] = [
  YELLOW_BADGE_RADII[0],
  redTopRadius,
  YELLOW_BADGE_RADII[2],
]

export const BASEBALL_ZONES: BaseballZone[] = [
  {
    id: 'badge-center-red',
    label: 'Center badge red',
    score: 5,
    priority: 110,
    shape: {
      kind: 'arc-triangle',
      points: RED_BADGE_POINTS,
      sideRadii: RED_BADGE_RADII,
    },
  },

  {
    id: 'badge-center-yellow',
    label: 'Center badge yellow',
    score: 4,
    priority: 100,
    shape: {
      kind: 'arc-triangle',
      points: YELLOW_BADGE_POINTS,
      sideRadii: YELLOW_BADGE_RADII,
    },
  },

  // {
  //   id: 'badge-center-yellow',
  //   label: 'Center badge yellow',
  //   score: 5,
  //   priority: 110,
  //   shape: {
  //     kind: 'sector',
  //     center: HOME_CENTER,
  //     innerRadius: 478,
  //     outerRadius: 539,
  //     startAngleDeg: 257,
  //     endAngleDeg: 283,
  //   },
  // },
  // {
  //   id: 'badge-center-red',
  //   label: 'Center badge red',
  //   score: 4,
  //   priority: 100,
  //   shape: {
  //     kind: 'sector',
  //     center: HOME_CENTER,
  //     innerRadius: 278,
  //     outerRadius: 478,
  //     startAngleDeg: 254,
  //     endAngleDeg: 286,
  //   },
  // },
  // {
  //   id: 'badge-left-yellow',
  //   label: 'Left badge yellow',
  //   score: 5,
  //   priority: 110,
  //   shape: {
  //     kind: 'sector',
  //     center: HOME_CENTER,
  //     innerRadius: 450,
  //     outerRadius: 533,
  //     startAngleDeg: 222,
  //     endAngleDeg: 250,
  //   },
  // },
  // {
  //   id: 'badge-left-red',
  //   label: 'Left badge red',
  //   score: 4,
  //   priority: 100,
  //   shape: {
  //     kind: 'sector',
  //     center: HOME_CENTER,
  //     innerRadius: 267,
  //     outerRadius: 478,
  //     startAngleDeg: 216,
  //     endAngleDeg: 252,
  //   },
  // },
  // {
  //   id: 'badge-right-yellow',
  //   label: 'Right badge yellow',
  //   score: 5,
  //   priority: 110,
  //   shape: {
  //     kind: 'sector',
  //     center: HOME_CENTER,
  //     innerRadius: 450,
  //     outerRadius: 533,
  //     startAngleDeg: 290,
  //     endAngleDeg: 318,
  //   },
  // },
  // {
  //   id: 'badge-right-red',
  //   label: 'Right badge red',
  //   score: 4,
  //   priority: 100,
  //   shape: {
  //     kind: 'sector',
  //     center: HOME_CENTER,
  //     innerRadius: 267,
  //     outerRadius: 478,
  //     startAngleDeg: 288,
  //     endAngleDeg: 324,
  //   },
  // },
  // {
  //   id: 'infield-circle-top-left',
  //   label: 'Infield circle top left',
  //   score: 3,
  //   priority: 95,
  //   shape: { kind: 'circle', center: { x: 436, y: 542 }, radius: 50 },
  // },
  // {
  //   id: 'infield-circle-top-right',
  //   label: 'Infield circle top right',
  //   score: 3,
  //   priority: 95,
  //   shape: { kind: 'circle', center: { x: 564, y: 542 }, radius: 50 },
  // },
  // {
  //   id: 'infield-circle-bottom-left',
  //   label: 'Infield circle bottom left',
  //   score: 3,
  //   priority: 95,
  //   shape: { kind: 'circle', center: { x: 347, y: 622 }, radius: 50 },
  // },
  // {
  //   id: 'infield-circle-bottom-right',
  //   label: 'Infield circle bottom right',
  //   score: 3,
  //   priority: 95,
  //   shape: { kind: 'circle', center: { x: 653, y: 622 }, radius: 50 },
  // },
  // {
  //   id: 'infield-yellow-home',
  //   label: 'Infield yellow home wedge',
  //   score: 2,
  //   priority: 90,
  //   shape: {
  //     kind: 'sector',
  //     center: HOME_CENTER,
  //     innerRadius: 0,
  //     outerRadius: 128,
  //     startAngleDeg: 235,
  //     endAngleDeg: 305,
  //   },
  // },
  // {
  //   id: 'infield-orange-home',
  //   label: 'Infield orange home wedge',
  //   score: 2,
  //   priority: 85,
  //   shape: {
  //     kind: 'sector',
  //     center: HOME_CENTER,
  //     innerRadius: 128,
  //     outerRadius: 189,
  //     startAngleDeg: 232,
  //     endAngleDeg: 308,
  //   },
  // },



  {
    id: 'infield-yellow-home',
    label: 'Infield yellow home wedge',
    score: 2,
    priority: 90,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      arcCenter: HOME_CENTER,
      innerRadius: 0,
      outerRadius: 92,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },

  {
    id: 'infield-light-green',
    label: 'Infield light green',
    score: 2,
    priority: 60,
    shape: {
      kind: 'polygon',
      points: [
        HOME_CENTER,
        { x: 633, y: 700 },
        { x: 500, y: 567 },
        { x: 367, y: 700 },
      ],
    },
  },

  {
    id: 'infield-dirt',
    label: 'Infield dirt',
    score: 2,
    priority: 50,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 0,
      outerRadius: 260,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },

  {
    id: 'catcher-dirt',
    label: 'Catcher dirt',
    score: 0,
    priority: 45,
    shape: { kind: 'circle', center: HOME_CENTER, radius: 92 },
  },

  {
    id: 'outfield-light-green',
    label: 'Outfield light green',
    score: 1,
    priority: 40,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 261,
      outerRadius: 485,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-green',
    label: 'Outfield green',
    score: 1,
    priority: 30,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 486,
      outerRadius: 603,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-dark-green',
    label: 'Outfield dark green',
    score: 1,
    priority: 20,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 604,
      outerRadius: 635,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-blue',
    label: 'Outfield blue',
    score: 1,
    priority: 10,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 636,
      outerRadius: 696,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
]

function normalizeAngle(deg: number): number {
  const wrapped = deg % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}

function isAngleInRange(angle: number, start: number, end: number): boolean {
  const a = normalizeAngle(angle)
  const s = normalizeAngle(start)
  const e = normalizeAngle(end)
  if (s <= e) {
    return a >= s && a <= e
  }
  return a >= s || a <= e
}

function pointInSector(point: Point, shape: SectorShape): boolean {
  const dx = point.x - shape.center.x
  const dy = point.y - shape.center.y
  const radius = Math.hypot(dx, dy)
  if (radius < shape.innerRadius || radius > shape.outerRadius) {
    return false
  }

  const angle = normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI)
  return isAngleInRange(angle, shape.startAngleDeg, shape.endAngleDeg)
}

function pointInCircle(point: Point, shape: CircleShape): boolean {
  return Math.hypot(point.x - shape.center.x, point.y - shape.center.y) <= shape.radius
}

function pointInPolygon(point: Point, shape: PolygonShape): boolean {
  let inside = false
  const pts = shape.points
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const xi = pts[i].x
    const yi = pts[i].y
    const xj = pts[j].x
    const yj = pts[j].y

    const intersects = yi > point.y !== yj > point.y
      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi

    if (intersects) {
      inside = !inside
    }
  }
  return inside
}

export function pointInZone(point: Point, zone: BaseballZone): boolean {
  if (zone.shape.kind === 'sector') {
    return pointInSector(point, zone.shape)
  }
  if (zone.shape.kind === 'circle') {
    return pointInCircle(point, zone.shape)
  }
  if (zone.shape.kind === 'arc-triangle') {
    return pointInPolygon(point, { kind: 'polygon', points: zone.shape.points })
  }
  return pointInPolygon(point, zone.shape)
}

function zoneAnchor(zone: BaseballZone): Point {
  if (zone.shape.kind === 'sector' || zone.shape.kind === 'circle') {
    return zone.shape.center
  }

  if (zone.shape.kind === 'arc-triangle') {
    const total = zone.shape.points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 },
    )

    return {
      x: total.x / zone.shape.points.length,
      y: total.y / zone.shape.points.length,
    }
  }

  const total = zone.shape.points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / zone.shape.points.length,
    y: total.y / zone.shape.points.length,
  }
}

function zoneDistance(point: Point, zone: BaseballZone): number {
  const anchor = zoneAnchor(zone)
  return Math.hypot(point.x - anchor.x, point.y - anchor.y)
}

export function resolveBaseballZoneHit(point: Point): { zone: BaseballZone | null; nearest: BaseballZone } {
  const sorted = [...BASEBALL_ZONES].sort((a, b) => b.priority - a.priority)
  const hit = sorted.find((zone) => pointInZone(point, zone)) ?? null

  let nearest = BASEBALL_ZONES[0]
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const zone of BASEBALL_ZONES) {
    const distance = zoneDistance(point, zone)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = zone
    }
  }

  return { zone: hit, nearest }
}
