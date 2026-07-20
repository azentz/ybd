export type Point = { x: number; y: number }

export type SectorShape = {
  kind: 'sector'
  center: Point
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

export type ZoneShape = SectorShape | CircleShape | PolygonShape

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

export const BASEBALL_ZONES: BaseballZone[] = [
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
  // {
  //   id: 'infield-dirt',
  //   label: 'Infield dirt',
  //   score: 2,
  //   priority: 80,
  //   shape: {
  //     kind: 'polygon',
  //     points: [
  //       { x: 500, y: 550 },
  //       { x: 589, y: 550 },
  //       { x: 711, y: 672 },
  //       { x: 642, y: 739 },
  //       { x: 500, y: 594 },
  //       { x: 358, y: 739 },
  //       { x: 289, y: 672 },
  //       { x: 411, y: 550 },
  //     ],
  //   },
  // },
  // {
  //   id: 'infield-light-green',
  //   label: 'Infield light green',
  //   score: 2,
  //   priority: 60,
  //   shape: {
  //     kind: 'polygon',
  //     points: [
  //       { x: 500, y: 822 },
  //       { x: 739, y: 583 },
  //       { x: 500, y: 344 },
  //       { x: 261, y: 583 },
  //     ],
  //   },
  // },


  {
    id: 'infield-dirt',
    label: 'Infield dirt',
    score: 2,
    priority: 80,
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
  return pointInPolygon(point, zone.shape)
}

function zoneAnchor(zone: BaseballZone): Point {
  if (zone.shape.kind === 'sector' || zone.shape.kind === 'circle') {
    return zone.shape.center
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
