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

export type CircleLensShape = {
  kind: 'circle-lens'
  primaryCenter: Point
  primaryRadius: number
  secondaryCenter: Point
  secondaryRadius: number
}

export type ZoneShape = SectorShape | CircleShape | PolygonShape | ArcTriangleShape | CircleLensShape

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

const CENTER_BADGE_YELLOW_POINTS: [Point, Point, Point] = [
  { x: 500, y: 400 },
  { x: 400, y: 190 },
  { x: 600, y: 190 },
]

const CENTER_BADGE_YELLOW_RADII: [number, number, number] = [400, 400, 400]

// Interpolation from yellow side edges toward the shared bottom point.
// Using one scale factor keeps red corners on yellow edges and preserves arc proportions.
const BADGE_INSET_SCALE = 0.78
const LEFT_BADGE_ROTATION_DEG = -38
const RIGHT_BADGE_ROTATION_DEG = -LEFT_BADGE_ROTATION_DEG

function rotateAround(point: Point, center: Point, angleDeg: number): Point {
  const angle = (angleDeg * Math.PI) / 180
  const dx = point.x - center.x
  const dy = point.y - center.y

  return {
    x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle),
  }
}

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

function buildInsetBadge(
  yellowPoints: [Point, Point, Point],
  yellowRadii: [number, number, number],
  insetScale: number,
): { redPoints: [Point, Point, Point]; redRadii: [number, number, number] } {
  const [a, b, c] = yellowPoints
  const [rAB, rBC, rCA] = yellowRadii

  const leftCenter = svgArcCenter(a, b, rAB, 0, 1)
  const rightCenter = svgArcCenter(c, a, rCA, 0, 1)
  const topCenter = svgArcCenter(b, c, rBC, 0, 1)

  const redPoints: [Point, Point, Point] = [
    a,
    pointOnMinorArc(a, b, leftCenter, insetScale),
    pointOnMinorArc(c, a, rightCenter, 1 - insetScale),
  ]

  const topLeftDistance = Math.hypot(redPoints[1].x - topCenter.x, redPoints[1].y - topCenter.y)
  const topRightDistance = Math.hypot(redPoints[2].x - topCenter.x, redPoints[2].y - topCenter.y)
  const redTopRadius = (topLeftDistance + topRightDistance) / 2

  return {
    redPoints,
    redRadii: [rAB, redTopRadius, rCA],
  }
}

const CENTER_BADGE = buildInsetBadge(
  CENTER_BADGE_YELLOW_POINTS,
  CENTER_BADGE_YELLOW_RADII,
  BADGE_INSET_SCALE,
)

const LEFT_BADGE_YELLOW_POINTS: [Point, Point, Point] = [
  rotateAround(CENTER_BADGE_YELLOW_POINTS[0], PITCHER_CENTER, LEFT_BADGE_ROTATION_DEG),
  rotateAround(CENTER_BADGE_YELLOW_POINTS[1], PITCHER_CENTER, LEFT_BADGE_ROTATION_DEG),
  rotateAround(CENTER_BADGE_YELLOW_POINTS[2], PITCHER_CENTER, LEFT_BADGE_ROTATION_DEG),
]

const LEFT_BADGE_YELLOW_RADII: [number, number, number] = [400, 400, 400]

const LEFT_BADGE = buildInsetBadge(
  LEFT_BADGE_YELLOW_POINTS,
  LEFT_BADGE_YELLOW_RADII,
  BADGE_INSET_SCALE,
)

const RIGHT_BADGE_YELLOW_POINTS: [Point, Point, Point] = [
  rotateAround(CENTER_BADGE_YELLOW_POINTS[0], PITCHER_CENTER, RIGHT_BADGE_ROTATION_DEG),
  rotateAround(CENTER_BADGE_YELLOW_POINTS[1], PITCHER_CENTER, RIGHT_BADGE_ROTATION_DEG),
  rotateAround(CENTER_BADGE_YELLOW_POINTS[2], PITCHER_CENTER, RIGHT_BADGE_ROTATION_DEG),
]

const RIGHT_BADGE_YELLOW_RADII: [number, number, number] = [400, 400, 400]

const RIGHT_BADGE = buildInsetBadge(
  RIGHT_BADGE_YELLOW_POINTS,
  RIGHT_BADGE_YELLOW_RADII,
  BADGE_INSET_SCALE,
)

const FIRST_BASE_RED_CENTER: Point = { x: 665, y: 625 }
const FIRST_BASE_RED_RADIUS = 50
const FIRST_BASE_GRAY_PITCHER_RADIUS = 166
const SECOND_BASE_RED_CENTER: Point = { x: 572, y: 535 }
const SECOND_BASE_RED_RADIUS = FIRST_BASE_RED_RADIUS
const SECOND_BASE_GRAY_PITCHER_RADIUS = FIRST_BASE_GRAY_PITCHER_RADIUS
const SHORTSTOP_RED_CENTER: Point = {
  x: 1000 - SECOND_BASE_RED_CENTER.x,
  y: SECOND_BASE_RED_CENTER.y,
}
const SHORTSTOP_RED_RADIUS = SECOND_BASE_RED_RADIUS
const SHORTSTOP_GRAY_PITCHER_RADIUS = SECOND_BASE_GRAY_PITCHER_RADIUS
const THIRD_BASE_RED_CENTER: Point = {
  x: 1000 - FIRST_BASE_RED_CENTER.x,
  y: FIRST_BASE_RED_CENTER.y,
}
const THIRD_BASE_RED_RADIUS = FIRST_BASE_RED_RADIUS
const THIRD_BASE_GRAY_PITCHER_RADIUS = FIRST_BASE_GRAY_PITCHER_RADIUS

export const BASEBALL_ZONES: BaseballZone[] = [
  {
    id: 'badge-center-red',
    label: 'Center badge red',
    score: 5,
    priority: 110,
    shape: {
      kind: 'arc-triangle',
      points: CENTER_BADGE.redPoints,
      sideRadii: CENTER_BADGE.redRadii,
    },
  },

  {
    id: 'badge-center-yellow',
    label: 'Center badge yellow',
    score: 4,
    priority: 100,
    shape: {
      kind: 'arc-triangle',
      points: CENTER_BADGE_YELLOW_POINTS,
      sideRadii: CENTER_BADGE_YELLOW_RADII,
    },
  },

  {
    id: 'badge-left-red',
    label: 'Left badge red',
    score: 5,
    priority: 108,
    shape: {
      kind: 'arc-triangle',
      points: LEFT_BADGE.redPoints,
      sideRadii: LEFT_BADGE.redRadii,
    },
  },

  {
    id: 'badge-left-yellow',
    label: 'Left badge yellow',
    score: 4,
    priority: 98,
    shape: {
      kind: 'arc-triangle',
      points: LEFT_BADGE_YELLOW_POINTS,
      sideRadii: LEFT_BADGE_YELLOW_RADII,
    },
  },

  {
    id: 'badge-right-red',
    label: 'Right badge red',
    score: 5,
    priority: 106,
    shape: {
      kind: 'arc-triangle',
      points: RIGHT_BADGE.redPoints,
      sideRadii: RIGHT_BADGE.redRadii,
    },
  },

  {
    id: 'badge-right-yellow',
    label: 'Right badge yellow',
    score: 4,
    priority: 96,
    shape: {
      kind: 'arc-triangle',
      points: RIGHT_BADGE_YELLOW_POINTS,
      sideRadii: RIGHT_BADGE_YELLOW_RADII,
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
    id: 'first-base-circle-red',
    label: 'First base circle red',
    score: 3,
    priority: 95,
    shape: { kind: 'circle', center: FIRST_BASE_RED_CENTER, radius: FIRST_BASE_RED_RADIUS },
  },

  {
    id: 'first-base-circle-gray',
    label: 'First base circle gray',
    score: 3,
    priority: 96,
    shape: {
      kind: 'circle-lens',
      primaryCenter: FIRST_BASE_RED_CENTER,
      primaryRadius: FIRST_BASE_RED_RADIUS,
      secondaryCenter: PITCHER_CENTER,
      secondaryRadius: FIRST_BASE_GRAY_PITCHER_RADIUS,
    },
  },

  {
    id: 'second-base-circle-red',
    label: 'Second base circle red',
    score: 3,
    priority: 95,
    shape: { kind: 'circle', center: SECOND_BASE_RED_CENTER, radius: SECOND_BASE_RED_RADIUS },
  },

  {
    id: 'second-base-circle-gray',
    label: 'Second base circle gray',
    score: 3,
    priority: 96,
    shape: {
      kind: 'circle-lens',
      primaryCenter: SECOND_BASE_RED_CENTER,
      primaryRadius: SECOND_BASE_RED_RADIUS,
      secondaryCenter: PITCHER_CENTER,
      secondaryRadius: SECOND_BASE_GRAY_PITCHER_RADIUS,
    },
  },

  {
    id: 'shortstop-circle-red',
    label: 'Shortstop circle red',
    score: 3,
    priority: 95,
    shape: { kind: 'circle', center: SHORTSTOP_RED_CENTER, radius: SHORTSTOP_RED_RADIUS },
  },

  {
    id: 'shortstop-circle-gray',
    label: 'Shortstop circle gray',
    score: 3,
    priority: 96,
    shape: {
      kind: 'circle-lens',
      primaryCenter: SHORTSTOP_RED_CENTER,
      primaryRadius: SHORTSTOP_RED_RADIUS,
      secondaryCenter: PITCHER_CENTER,
      secondaryRadius: SHORTSTOP_GRAY_PITCHER_RADIUS,
    },
  },

  {
    id: 'third-base-circle-red',
    label: 'Third base circle red',
    score: 3,
    priority: 95,
    shape: { kind: 'circle', center: THIRD_BASE_RED_CENTER, radius: THIRD_BASE_RED_RADIUS },
  },

  {
    id: 'third-base-circle-gray',
    label: 'Third base circle gray',
    score: 3,
    priority: 96,
    shape: {
      kind: 'circle-lens',
      primaryCenter: THIRD_BASE_RED_CENTER,
      primaryRadius: THIRD_BASE_RED_RADIUS,
      secondaryCenter: PITCHER_CENTER,
      secondaryRadius: THIRD_BASE_GRAY_PITCHER_RADIUS,
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

function pointOnCircle(center: Point, radius: number, angleDeg: number): Point {
  const angleRad = (angleDeg * Math.PI) / 180
  return {
    x: center.x + Math.cos(angleRad) * radius,
    y: center.y + Math.sin(angleRad) * radius,
  }
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
  const angleDx = point.x - shape.center.x
  const angleDy = point.y - shape.center.y
  const angle = normalizeAngle((Math.atan2(angleDy, angleDx) * 180) / Math.PI)
  if (!isAngleInRange(angle, shape.startAngleDeg, shape.endAngleDeg)) {
    return false
  }

  const arcCenter = shape.arcCenter ?? PITCHER_CENTER
  const sameCenter = arcCenter.x === shape.center.x && arcCenter.y === shape.center.y

  // When rendering uses pitcher-centered arcs, evaluate radial membership from that same center.
  if (!sameCenter) {
    const outerStart = pointOnCircle(shape.center, shape.outerRadius, shape.startAngleDeg)
    const outerEnd = pointOnCircle(shape.center, shape.outerRadius, shape.endAngleDeg)
    const outerArcRadius =
      (Math.hypot(outerStart.x - arcCenter.x, outerStart.y - arcCenter.y)
        + Math.hypot(outerEnd.x - arcCenter.x, outerEnd.y - arcCenter.y)) / 2

    let innerArcRadius = 0
    if (shape.innerRadius > 0) {
      const innerStart = pointOnCircle(shape.center, shape.innerRadius, shape.startAngleDeg)
      const innerEnd = pointOnCircle(shape.center, shape.innerRadius, shape.endAngleDeg)
      innerArcRadius =
        (Math.hypot(innerStart.x - arcCenter.x, innerStart.y - arcCenter.y)
          + Math.hypot(innerEnd.x - arcCenter.x, innerEnd.y - arcCenter.y)) / 2
    }

    const arcDistance = Math.hypot(point.x - arcCenter.x, point.y - arcCenter.y)
    return arcDistance >= innerArcRadius && arcDistance <= outerArcRadius
  }

  const radius = Math.hypot(angleDx, angleDy)
  return radius >= shape.innerRadius && radius <= shape.outerRadius
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

function normalizeRadians(angleRad: number): number {
  const wrapped = angleRad % (Math.PI * 2)
  return wrapped < 0 ? wrapped + Math.PI * 2 : wrapped
}

function sampledArcPoints(
  start: Point,
  end: Point,
  radius: number,
  segments: number,
): Point[] {
  const center = svgArcCenter(start, end, radius, 0, 1)
  const a0 = Math.atan2(start.y - center.y, start.x - center.x)
  const a1 = Math.atan2(end.y - center.y, end.x - center.x)

  let delta = normalizeRadians(a1 - a0)
  if (delta > Math.PI) {
    delta -= Math.PI * 2
  }

  const points: Point[] = []
  for (let i = 1; i <= segments; i += 1) {
    const t = i / segments
    const angle = a0 + delta * t
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }

  return points
}

function pointInArcTriangle(point: Point, shape: ArcTriangleShape): boolean {
  const [a, b, c] = shape.points
  const sideAB = Math.hypot(b.x - a.x, b.y - a.y)
  const sideBC = Math.hypot(c.x - b.x, c.y - b.y)
  const sideCA = Math.hypot(a.x - c.x, a.y - c.y)
  const defaultRadius = (sideAB + sideBC + sideCA) / 3
  const [rAB, rBC, rCA] = shape.sideRadii ?? [defaultRadius, defaultRadius, defaultRadius]

  const sampled: Point[] = [
    a,
    ...sampledArcPoints(a, b, rAB, 20),
    ...sampledArcPoints(b, c, rBC, 20),
    ...sampledArcPoints(c, a, rCA, 20),
  ]

  return pointInPolygon(point, { kind: 'polygon', points: sampled })
}

export function pointInZone(point: Point, zone: BaseballZone): boolean {
  if (zone.shape.kind === 'sector') {
    return pointInSector(point, zone.shape)
  }
  if (zone.shape.kind === 'circle') {
    return pointInCircle(point, zone.shape)
  }
  if (zone.shape.kind === 'circle-lens') {
    const inPrimary = Math.hypot(
      point.x - zone.shape.primaryCenter.x,
      point.y - zone.shape.primaryCenter.y,
    ) <= zone.shape.primaryRadius
    const inSecondary = Math.hypot(
      point.x - zone.shape.secondaryCenter.x,
      point.y - zone.shape.secondaryCenter.y,
    ) <= zone.shape.secondaryRadius
    return inPrimary && inSecondary
  }
  if (zone.shape.kind === 'arc-triangle') {
    return pointInArcTriangle(point, zone.shape)
  }
  return pointInPolygon(point, zone.shape)
}

function zoneAnchor(zone: BaseballZone): Point {
  if (zone.shape.kind === 'sector' || zone.shape.kind === 'circle') {
    return zone.shape.center
  }

  if (zone.shape.kind === 'circle-lens') {
    return {
      x: (zone.shape.primaryCenter.x + zone.shape.secondaryCenter.x) / 2,
      y: (zone.shape.primaryCenter.y + zone.shape.secondaryCenter.y) / 2,
    }
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
