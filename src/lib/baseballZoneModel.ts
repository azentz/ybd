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

export type ChordArcShape = {
  kind: 'chord-arc'
  start: Point
  end: Point
  arcCenter?: Point
  arcRadius?: number
  sweepFlag?: 0 | 1
  arcSidePoint?: Point
  arcMidOffset?: number
}

export type ArcBandSliceShape = {
  kind: 'arc-band-slice'
  sideCenter: Point
  leftAngleDeg: number
  rightAngleDeg: number
  arcCenter: Point
  innerArcRadius: number
  outerArcRadius: number
}

export type ChordArcGeometry = {
  arcCenter: Point
  arcRadius: number
  sweepFlag: 0 | 1
}

export type ZoneShape =
  | SectorShape
  | CircleShape
  | PolygonShape
  | ArcTriangleShape
  | CircleLensShape
  | ChordArcShape
  | ArcBandSliceShape

export type BaseballZone = {
  id: string
  score: number
  priority: number
  color: string
  shape: ZoneShape
}

const HOME_CENTER: Point = { x: 500, y: 833 }
export const PITCHER_CENTER: Point = { x: 500, y: 700 }
const FAN_START = 225
const FAN_END = 315

const CENTER_BADGE_YELLOW_POINTS: [Point, Point, Point] = [
  { x: 500, y: 400 },
  { x: 400, y: 194 },
  { x: 600, y: 194 },
]

const CENTER_BADGE_YELLOW_RADII: [number, number, number] = [400, 300, 400]

// Interpolation from yellow side edges toward the shared bottom point.
// Using one scale factor keeps red corners on yellow edges and preserves arc proportions.
const BADGE_INSET_SCALE = 0.78
const LEFT_BADGE_ROTATION_DEG = -38
const RIGHT_BADGE_ROTATION_DEG = -LEFT_BADGE_ROTATION_DEG
const TAU = Math.PI * 2

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
  while (value <= -Math.PI) value += TAU
  while (value > Math.PI) value -= TAU
  return value
}

function normalizeZeroToTau(angle: number): number {
  const wrapped = angle % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
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

const LEFT_BADGE = buildInsetBadge(
  LEFT_BADGE_YELLOW_POINTS,
  CENTER_BADGE_YELLOW_RADII,
  BADGE_INSET_SCALE,
)

const RIGHT_BADGE_YELLOW_POINTS: [Point, Point, Point] = [
  rotateAround(CENTER_BADGE_YELLOW_POINTS[0], PITCHER_CENTER, RIGHT_BADGE_ROTATION_DEG),
  rotateAround(CENTER_BADGE_YELLOW_POINTS[1], PITCHER_CENTER, RIGHT_BADGE_ROTATION_DEG),
  rotateAround(CENTER_BADGE_YELLOW_POINTS[2], PITCHER_CENTER, RIGHT_BADGE_ROTATION_DEG),
]

const RIGHT_BADGE = buildInsetBadge(
  RIGHT_BADGE_YELLOW_POINTS,
  CENTER_BADGE_YELLOW_RADII,
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

const FIRST_BASE_CORNER: Point = { x: 633, y: 700 }
const THIRD_BASE_CORNER: Point = {
  x: 1000 - FIRST_BASE_CORNER.x,
  y: FIRST_BASE_CORNER.y,
}
const SECOND_BASE_CORNER: Point = {
  x: HOME_CENTER.x,
  y: HOME_CENTER.y - (HOME_CENTER.y - FIRST_BASE_CORNER.y) * 2,
}
const BASE_ZONE_SIZE = 14
const PITCHERS_PLATE_WIDTH = 34
const PITCHERS_PLATE_HEIGHT = 9
const HOME_PLATE_TOP_HALF_WIDTH = 9
const HOME_PLATE_DEPTH = 18
const HOME_PLATE_SHOULDER_DEPTH = 9

const ZONE_RED = '#F30D0D'
const ZONE_YELLOW = '#F3F32F'
const ZONE_ORANGE = '#F2822F'
const ZONE_LIGHT_GREEN = '#31F227'
const ZONE_GREEN = '#1FAF1E'
const ZONE_DARK_GREEN = '#0A7A10'
const ZONE_BLUE = '#1C20E6'
const ZONE_DARK_BLUE = '#0A2A6B'
const ZONE_GRAY = '#6E6E6E'
const ZONE_WHITE = '#FFFFFF'
const ZONE_TRANSPARENT = 'transparent'
const ZONE_DIRT = '#8A520D'
const GROUND_RULE_DOUBLE_INNER_RADIUS = 641
const GROUND_RULE_DOUBLE_OUTER_RADIUS = 642
const OUTFIELD_BAND_INNER_RADIUS = GROUND_RULE_DOUBLE_OUTER_RADIUS + 1
const OUTFIELD_BAND_OUTER_RADIUS = 700
const OUTFIELD_MISS_INNER_RADIUS = OUTFIELD_BAND_OUTER_RADIUS + 1
const OUTFIELD_MISS_OUTER_RADIUS = 1000
const BIG_MAC_LEFT_ANGLE = 243
const BIG_MAC_RIGHT_ANGLE = 250
const FOUL_POLE_ANGLE_WIDTH = 0.2
const OUTFIELD_BLUE_INNER_ARC_RADIUS = averageArcRadiusFromCenter(
  HOME_CENTER,
  PITCHER_CENTER,
  OUTFIELD_BAND_INNER_RADIUS,
  FAN_START,
  FAN_END,
)
const OUTFIELD_BLUE_OUTER_ARC_RADIUS = averageArcRadiusFromCenter(
  HOME_CENTER,
  PITCHER_CENTER,
  OUTFIELD_BAND_OUTER_RADIUS,
  FAN_START,
  FAN_END,
)

function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  }
}

function unitVector(from: Point, to: Point): Point | null {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length <= Number.EPSILON) {
    return null
  }

  return {
    x: dx / length,
    y: dy / length,
  }
}

function averageArcRadiusFromCenter(
  fanCenter: Point,
  arcCenter: Point,
  fanRadius: number,
  startAngleDeg: number,
  endAngleDeg: number,
): number {
  const start = pointOnCircle(fanCenter, fanRadius, startAngleDeg)
  const end = pointOnCircle(fanCenter, fanRadius, endAngleDeg)
  return (distanceBetween(start, arcCenter) + distanceBetween(end, arcCenter)) / 2
}

function lineSide(start: Point, end: Point, point: Point): number {
  const lineDx = end.x - start.x
  const lineDy = end.y - start.y
  return lineDx * (point.y - start.y) - lineDy * (point.x - start.x)
}

function pointAlongLine(from: Point, to: Point, distance: number): Point {
  const direction = unitVector(from, to)
  if (!direction) {
    return from
  }

  return {
    x: from.x + direction.x * distance,
    y: from.y + direction.y * distance,
  }
}

function addScaled(origin: Point, direction: Point, scale: number): Point {
  return {
    x: origin.x + direction.x * scale,
    y: origin.y + direction.y * scale,
  }
}

function baseSquarePoints(
  corner: Point,
  edgeTargetA: Point,
  edgeTargetB: Point,
  sideLength: number,
): [Point, Point, Point, Point] {
  const towardA = unitVector(corner, edgeTargetA)
  const towardB = unitVector(corner, edgeTargetB)
  if (!towardA || !towardB) {
    return [corner, corner, corner, corner]
  }

  const aEdge = addScaled(corner, towardA, sideLength)
  const bEdge = addScaled(corner, towardB, sideLength)
  const opposite = addScaled(aEdge, towardB, sideLength)

  return [corner, aEdge, opposite, bEdge]
}

function homePlatePoints(
  tip: Point,
  topHalfWidth: number,
  depth: number,
  shoulderDepth: number,
): [Point, Point, Point, Point, Point] {
  return [
    { x: tip.x - topHalfWidth, y: tip.y - depth },
    { x: tip.x + topHalfWidth, y: tip.y - depth },
    { x: tip.x + topHalfWidth, y: tip.y - shoulderDepth },
    tip,
    { x: tip.x - topHalfWidth, y: tip.y - shoulderDepth },
  ]
}

function centeredRectanglePoints(center: Point, width: number, height: number): [Point, Point, Point, Point] {
  const halfW = width / 2
  const halfH = height / 2
  return [
    { x: center.x - halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y - halfH },
    { x: center.x + halfW, y: center.y + halfH },
    { x: center.x - halfW, y: center.y + halfH },
  ]
}

function rayCircleIntersection(
  rayOrigin: Point,
  rayAngleDeg: number,
  circleCenter: Point,
  circleRadius: number,
): Point | null {
  const angleRad = (rayAngleDeg * Math.PI) / 180
  const dx = Math.cos(angleRad)
  const dy = Math.sin(angleRad)

  const ox = rayOrigin.x - circleCenter.x
  const oy = rayOrigin.y - circleCenter.y

  const b = 2 * (ox * dx + oy * dy)
  const c = ox * ox + oy * oy - circleRadius * circleRadius
  const disc = b * b - 4 * c
  if (disc < 0) {
    return null
  }

  const sqrtDisc = Math.sqrt(disc)
  const t1 = (-b + sqrtDisc) / 2
  const t2 = (-b - sqrtDisc) / 2
  const t = Math.max(t1, t2)
  if (t < 0) {
    return null
  }

  return {
    x: rayOrigin.x + dx * t,
    y: rayOrigin.y + dy * t,
  }
}

function circleFromThreePoints(a: Point, b: Point, c: Point): { center: Point; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) <= Number.EPSILON) {
    return null
  }

  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y

  const ux = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d
  const uy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d

  const center = { x: ux, y: uy }
  const radius = Math.hypot(a.x - ux, a.y - uy)
  return { center, radius }
}

function arcMidpointFromCenter(
  start: Point,
  end: Point,
  center: Point,
  sweepFlag: 0 | 1,
): Point {
  const aStart = Math.atan2(start.y - center.y, start.x - center.x)
  const aEnd = Math.atan2(end.y - center.y, end.x - center.x)
  let delta = normalizeZeroToTau(aEnd - aStart)
  if (sweepFlag === 0 && delta > 0) delta -= TAU
  if (sweepFlag === 1 && delta < 0) delta += TAU

  const midAngle = aStart + delta / 2
  const radius = Math.hypot(start.x - center.x, start.y - center.y)
  return {
    x: center.x + Math.cos(midAngle) * radius,
    y: center.y + Math.sin(midAngle) * radius,
  }
}

export function resolveChordArcGeometry(shape: ChordArcShape): ChordArcGeometry | null {
  if (shape.arcCenter && typeof shape.arcRadius === 'number' && typeof shape.sweepFlag === 'number') {
    return {
      arcCenter: shape.arcCenter,
      arcRadius: shape.arcRadius,
      sweepFlag: shape.sweepFlag,
    }
  }

  if (!shape.arcSidePoint || typeof shape.arcMidOffset !== 'number') {
    return null
  }

  const direction = unitVector(shape.start, shape.end)
  if (!direction) {
    return null
  }

  const chordMidpoint = midpoint(shape.start, shape.end)

  const n1 = { x: direction.y, y: -direction.x }
  const n2 = { x: -direction.y, y: direction.x }

  const through1 = {
    x: chordMidpoint.x + n1.x * shape.arcMidOffset,
    y: chordMidpoint.y + n1.y * shape.arcMidOffset,
  }
  const through2 = {
    x: chordMidpoint.x + n2.x * shape.arcMidOffset,
    y: chordMidpoint.y + n2.y * shape.arcMidOffset,
  }

  const d1 = distanceBetween(through1, shape.arcSidePoint)
  const d2 = distanceBetween(through2, shape.arcSidePoint)
  const through = d1 <= d2 ? through1 : through2

  const circle = circleFromThreePoints(shape.end, through, shape.start)
  if (!circle) {
    return null
  }

  const sweepCandidates: Array<0 | 1> = [0, 1]
  const sweepFlag = sweepCandidates.reduce((best, sweep) => {
    const mid = arcMidpointFromCenter(shape.end, shape.start, circle.center, sweep)
    const bestMid = arcMidpointFromCenter(shape.end, shape.start, circle.center, best)
    const dist = distanceBetween(mid, through)
    const bestDist = distanceBetween(bestMid, through)
    return dist < bestDist ? sweep : best
  }, 0 as 0 | 1)

  return {
    arcCenter: circle.center,
    arcRadius: circle.radius,
    sweepFlag,
  }
}

export const BASEBALL_ZONES: BaseballZone[] = [
  {
    id: 'outfield-big-mac-land',
    score: 1,
    priority: 150,
    color: ZONE_RED,
    shape: {
      kind: 'arc-band-slice',
      sideCenter: HOME_CENTER,
      leftAngleDeg: BIG_MAC_LEFT_ANGLE,
      rightAngleDeg: BIG_MAC_RIGHT_ANGLE,
      arcCenter: PITCHER_CENTER,
      innerArcRadius: OUTFIELD_BLUE_INNER_ARC_RADIUS,
      outerArcRadius: OUTFIELD_BLUE_OUTER_ARC_RADIUS,
    },
  },

  {
    id: 'badge-center-red',
    score: 5,
    priority: 140,
    color: ZONE_RED,
    shape: {
      kind: 'arc-triangle',
      points: CENTER_BADGE.redPoints,
      sideRadii: CENTER_BADGE.redRadii,
    },
  },

  {
    id: 'badge-left-red',
    score: 5,
    priority: 140,
    color: ZONE_RED,
    shape: {
      kind: 'arc-triangle',
      points: LEFT_BADGE.redPoints,
      sideRadii: LEFT_BADGE.redRadii,
    },
  },

  {
    id: 'badge-right-red',
    score: 5,
    priority: 140,
    color: ZONE_RED,
    shape: {
      kind: 'arc-triangle',
      points: RIGHT_BADGE.redPoints,
      sideRadii: RIGHT_BADGE.redRadii,
    },
  },

  {
    id: 'badge-center-yellow',
    score: 4,
    priority: 130,
    color: ZONE_YELLOW,
    shape: {
      kind: 'arc-triangle',
      points: CENTER_BADGE_YELLOW_POINTS,
      sideRadii: CENTER_BADGE_YELLOW_RADII,
    },
  },

  {
    id: 'badge-left-yellow',
    score: 4,
    priority: 130,
    color: ZONE_YELLOW,
    shape: {
      kind: 'arc-triangle',
      points: LEFT_BADGE_YELLOW_POINTS,
      sideRadii: CENTER_BADGE_YELLOW_RADII,
    },
  },

  {
    id: 'badge-right-yellow',
    score: 4,
    priority: 130,
    color: ZONE_YELLOW,
    shape: {
      kind: 'arc-triangle',
      points: RIGHT_BADGE_YELLOW_POINTS,
      sideRadii: CENTER_BADGE_YELLOW_RADII,
    },
  },

  {
    id: 'first-base-circle-gray',
    score: 3,
    priority: 120,
    color: ZONE_GRAY,
    shape: {
      kind: 'circle-lens',
      primaryCenter: FIRST_BASE_RED_CENTER,
      primaryRadius: FIRST_BASE_RED_RADIUS,
      secondaryCenter: PITCHER_CENTER,
      secondaryRadius: FIRST_BASE_GRAY_PITCHER_RADIUS,
    },
  },

  {
    id: 'second-base-circle-gray',
    score: 3,
    priority: 120,
    color: ZONE_GRAY,
    shape: {
      kind: 'circle-lens',
      primaryCenter: SECOND_BASE_RED_CENTER,
      primaryRadius: SECOND_BASE_RED_RADIUS,
      secondaryCenter: PITCHER_CENTER,
      secondaryRadius: SECOND_BASE_GRAY_PITCHER_RADIUS,
    },
  },

  {
    id: 'shortstop-circle-gray',
    score: 3,
    priority: 120,
    color: ZONE_GRAY,
    shape: {
      kind: 'circle-lens',
      primaryCenter: SHORTSTOP_RED_CENTER,
      primaryRadius: SHORTSTOP_RED_RADIUS,
      secondaryCenter: PITCHER_CENTER,
      secondaryRadius: SHORTSTOP_GRAY_PITCHER_RADIUS,
    },
  },

  {
    id: 'third-base-circle-gray',
    score: 3,
    priority: 120,
    color: ZONE_GRAY,
    shape: {
      kind: 'circle-lens',
      primaryCenter: THIRD_BASE_RED_CENTER,
      primaryRadius: THIRD_BASE_RED_RADIUS,
      secondaryCenter: PITCHER_CENTER,
      secondaryRadius: THIRD_BASE_GRAY_PITCHER_RADIUS,
    },
  },

  {
    id: 'first-base-circle-red',
    score: 3,
    priority: 110,
    color: ZONE_RED,
    shape: {
      kind: 'circle',
      center: FIRST_BASE_RED_CENTER,
      radius: FIRST_BASE_RED_RADIUS,
    },
  },

  {
    id: 'second-base-circle-red',
    score: 3,
    priority: 110,
    color: ZONE_RED,
    shape: {
      kind: 'circle',
      center: SECOND_BASE_RED_CENTER,
      radius: SECOND_BASE_RED_RADIUS,
    },
  },

  {
    id: 'shortstop-circle-red',
    score: 3,
    priority: 110,
    color: ZONE_RED,
    shape: {
      kind: 'circle',
      center: SHORTSTOP_RED_CENTER,
      radius: SHORTSTOP_RED_RADIUS,
    },
  },

  {
    id: 'third-base-circle-red',
    score: 3,
    priority: 110,
    color: ZONE_RED,
    shape: {
      kind: 'circle',
      center: THIRD_BASE_RED_CENTER,
      radius: THIRD_BASE_RED_RADIUS,
    },
  },

  {
    id: 'home-plate-gray',
    score: 2,
    priority: 100,
    color: ZONE_GRAY,
    shape: {
      kind: 'polygon',
      points: homePlatePoints(
        HOME_CENTER,
        HOME_PLATE_TOP_HALF_WIDTH,
        HOME_PLATE_DEPTH,
        HOME_PLATE_SHOULDER_DEPTH,
      ),
    },
  },

  {
    id: 'pitchers-plate-gray',
    score: 2,
    priority: 100,
    color: ZONE_GRAY,
    shape: {
      kind: 'polygon',
      points: centeredRectanglePoints(PITCHER_CENTER, PITCHERS_PLATE_WIDTH, PITCHERS_PLATE_HEIGHT),
    },
  },

  {
    id: 'first-base-zone-white',
    score: 2,
    priority: 100,
    color: ZONE_WHITE,
    shape: {
      kind: 'polygon',
      points: baseSquarePoints(FIRST_BASE_CORNER, HOME_CENTER, SECOND_BASE_CORNER, BASE_ZONE_SIZE),
    },
  },

  {
    id: 'second-base-zone-white',
    score: 2,
    priority: 100,
    color: ZONE_WHITE,
    shape: {
      kind: 'polygon',
      points: baseSquarePoints(SECOND_BASE_CORNER, FIRST_BASE_CORNER, THIRD_BASE_CORNER, BASE_ZONE_SIZE),
    },
  },

  {
    id: 'third-base-zone-white',
    score: 2,
    priority: 100,
    color: ZONE_WHITE,
    shape: {
      kind: 'polygon',
      points: baseSquarePoints(THIRD_BASE_CORNER, HOME_CENTER, SECOND_BASE_CORNER, BASE_ZONE_SIZE),
    },
  },

  {
    id: 'infield-orange-first-line',
    score: 2,
    priority: 90,
    color: ZONE_ORANGE,
    shape: {
      kind: 'chord-arc',
      start: pointAlongLine(HOME_CENTER, FIRST_BASE_CORNER, 58),
      end: pointAlongLine(HOME_CENTER, FIRST_BASE_CORNER, 130),
      arcSidePoint: FIRST_BASE_CORNER,
      arcMidOffset: 5,
    },
  },

  {
    id: 'infield-orange-third-line',
    score: 2,
    priority: 90,
    color: ZONE_ORANGE,
    shape: {
      kind: 'chord-arc',
      start: pointAlongLine(HOME_CENTER, THIRD_BASE_CORNER, 58),
      end: pointAlongLine(HOME_CENTER, THIRD_BASE_CORNER, 130),
      arcSidePoint: THIRD_BASE_CORNER,
      arcMidOffset: 5,
    },
  },

  {
    id: 'infield-yellow-home',
    score: 2,
    priority: 80,
    color: ZONE_YELLOW,
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
    score: 2,
    priority: 70,
    color: ZONE_LIGHT_GREEN,
    shape: {
      kind: 'polygon',
      points: [
        HOME_CENTER,
        FIRST_BASE_CORNER,
        SECOND_BASE_CORNER,
        THIRD_BASE_CORNER,
      ],
    },
  },

  {
    id: 'catcher-dirt',
    score: 0,
    priority: 60,
    color: ZONE_DIRT,
    shape: { kind: 'circle', center: HOME_CENTER, radius: 92 },
  },

  {
    id: 'infield-dirt',
    score: 2,
    priority: 50,
    color: ZONE_DIRT,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 0,
      outerRadius: 262,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-light-green',
    score: 1,
    priority: 40,
    color: ZONE_LIGHT_GREEN,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 263,
      outerRadius: 480,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-green',
    score: 1,
    priority: 30,
    color: ZONE_GREEN,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 481,
      outerRadius: 610,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-ground-rule-double',
    score: 2,
    priority: 25,
    color: ZONE_DARK_BLUE,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: GROUND_RULE_DOUBLE_INNER_RADIUS,
      outerRadius: GROUND_RULE_DOUBLE_OUTER_RADIUS,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-dark-green',
    score: 1,
    priority: 20,
    color: ZONE_DARK_GREEN,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: 611,
      outerRadius: 640,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-left-foul-pole',
    score: 1,
    priority: 27,
    color: ZONE_YELLOW,
    shape: {
      kind: 'arc-band-slice',
      sideCenter: HOME_CENTER,
      leftAngleDeg: FAN_START,
      rightAngleDeg: FAN_START + FOUL_POLE_ANGLE_WIDTH,
      arcCenter: PITCHER_CENTER,
      innerArcRadius: OUTFIELD_BLUE_INNER_ARC_RADIUS,
      outerArcRadius: OUTFIELD_BLUE_OUTER_ARC_RADIUS,
    },
  },
  {
    id: 'outfield-right-foul-pole',
    score: 1,
    priority: 27,
    color: ZONE_YELLOW,
    shape: {
      kind: 'arc-band-slice',
      sideCenter: HOME_CENTER,
      leftAngleDeg: FAN_END - FOUL_POLE_ANGLE_WIDTH,
      rightAngleDeg: FAN_END,
      arcCenter: PITCHER_CENTER,
      innerArcRadius: OUTFIELD_BLUE_INNER_ARC_RADIUS,
      outerArcRadius: OUTFIELD_BLUE_OUTER_ARC_RADIUS,
    },
  },
  {
    id: 'outfield-miss-out',
    score: 0,
    priority: 12,
    color: ZONE_TRANSPARENT,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: OUTFIELD_MISS_INNER_RADIUS,
      outerRadius: OUTFIELD_MISS_OUTER_RADIUS,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
  {
    id: 'outfield-blue',
    score: 1,
    priority: 10,
    color: ZONE_BLUE,
    shape: {
      kind: 'sector',
      center: HOME_CENTER,
      innerRadius: OUTFIELD_BAND_INNER_RADIUS,
      outerRadius: OUTFIELD_BAND_OUTER_RADIUS,
      startAngleDeg: FAN_START,
      endAngleDeg: FAN_END,
    },
  },
]

const ZONES_BY_PRIORITY_DESC = [...BASEBALL_ZONES].sort((a, b) => b.priority - a.priority)

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
    const outerArcRadius = averageArcRadiusFromCenter(
      shape.center,
      arcCenter,
      shape.outerRadius,
      shape.startAngleDeg,
      shape.endAngleDeg,
    )

    let innerArcRadius = 0
    if (shape.innerRadius > 0) {
      innerArcRadius = averageArcRadiusFromCenter(
        shape.center,
        arcCenter,
        shape.innerRadius,
        shape.startAngleDeg,
        shape.endAngleDeg,
      )
    }

    const arcDistance = distanceBetween(point, arcCenter)
    return arcDistance >= innerArcRadius && arcDistance <= outerArcRadius
  }

  const radius = Math.hypot(angleDx, angleDy)
  return radius >= shape.innerRadius && radius <= shape.outerRadius
}

function pointInCircle(point: Point, shape: CircleShape): boolean {
  return distanceBetween(point, shape.center) <= shape.radius
}

function pointInChordArc(point: Point, shape: ChordArcShape): boolean {
  const geometry = resolveChordArcGeometry(shape)
  if (!geometry) {
    return false
  }

  const inCircle = distanceBetween(point, geometry.arcCenter) <= geometry.arcRadius
  if (!inCircle) {
    return false
  }

  const arcMid = arcMidpointFromCenter(shape.end, shape.start, geometry.arcCenter, geometry.sweepFlag)
  const sideAtArc = lineSide(shape.start, shape.end, arcMid)
  const sideAtPoint = lineSide(shape.start, shape.end, point)

  if (Math.abs(sideAtArc) <= Number.EPSILON) {
    return false
  }

  return sideAtArc > 0 ? sideAtPoint >= -Number.EPSILON : sideAtPoint <= Number.EPSILON
}

function pointInArcBandSlice(point: Point, shape: ArcBandSliceShape): boolean {
  const angle = normalizeAngle((Math.atan2(point.y - shape.sideCenter.y, point.x - shape.sideCenter.x) * 180) / Math.PI)
  if (!isAngleInRange(angle, shape.leftAngleDeg, shape.rightAngleDeg)) {
    return false
  }

  const arcDistance = distanceBetween(point, shape.arcCenter)
  return arcDistance >= shape.innerArcRadius && arcDistance <= shape.outerArcRadius
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

function sampledArcPoints(
  start: Point,
  end: Point,
  radius: number,
  segments: number,
): Point[] {
  const center = svgArcCenter(start, end, radius, 0, 1)
  const a0 = Math.atan2(start.y - center.y, start.x - center.x)
  const a1 = Math.atan2(end.y - center.y, end.x - center.x)

  let delta = normalizeZeroToTau(a1 - a0)
  if (delta > Math.PI) {
    delta -= TAU
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
  switch (zone.shape.kind) {
    case 'sector':
      return pointInSector(point, zone.shape)
    case 'circle':
      return pointInCircle(point, zone.shape)
    case 'chord-arc':
      return pointInChordArc(point, zone.shape)
    case 'arc-band-slice':
      return pointInArcBandSlice(point, zone.shape)
    case 'circle-lens': {
      const inPrimary = distanceBetween(point, zone.shape.primaryCenter) <= zone.shape.primaryRadius
      const inSecondary = distanceBetween(point, zone.shape.secondaryCenter) <= zone.shape.secondaryRadius
      return inPrimary && inSecondary
    }
    case 'arc-triangle':
      return pointInArcTriangle(point, zone.shape)
    case 'polygon':
      return pointInPolygon(point, zone.shape)
  }
}

function zoneAnchor(zone: BaseballZone): Point {
  if (zone.shape.kind === 'sector' || zone.shape.kind === 'circle') {
    return zone.shape.center
  }

  if (zone.shape.kind === 'chord-arc') {
    const geometry = resolveChordArcGeometry(zone.shape)
    if (!geometry) {
      return {
        x: (zone.shape.start.x + zone.shape.end.x) / 2,
        y: (zone.shape.start.y + zone.shape.end.y) / 2,
      }
    }

    const mid = arcMidpointFromCenter(
      zone.shape.end,
      zone.shape.start,
      geometry.arcCenter,
      geometry.sweepFlag,
    )
    return {
      x: (zone.shape.start.x + zone.shape.end.x + mid.x) / 3,
      y: (zone.shape.start.y + zone.shape.end.y + mid.y) / 3,
    }
  }

  if (zone.shape.kind === 'circle-lens') {
    return {
      x: (zone.shape.primaryCenter.x + zone.shape.secondaryCenter.x) / 2,
      y: (zone.shape.primaryCenter.y + zone.shape.secondaryCenter.y) / 2,
    }
  }

  if (zone.shape.kind === 'arc-band-slice') {
    const midAngle = normalizeAngle(
      zone.shape.leftAngleDeg + normalizeAngle(zone.shape.rightAngleDeg - zone.shape.leftAngleDeg) / 2,
    )
    const outer = rayCircleIntersection(
      zone.shape.sideCenter,
      midAngle,
      zone.shape.arcCenter,
      zone.shape.outerArcRadius,
    )
    const inner = rayCircleIntersection(
      zone.shape.sideCenter,
      midAngle,
      zone.shape.arcCenter,
      zone.shape.innerArcRadius,
    )

    if (outer && inner) {
      return midpoint(outer, inner)
    }

    return midpoint(zone.shape.sideCenter, zone.shape.arcCenter)
  }

  return centroid(zone.shape.points)
}

function centroid(points: Point[]): Point {
  const total = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  }
}

function zoneDistance(point: Point, zone: BaseballZone): number {
  const anchor = zoneAnchor(zone)
  return distanceBetween(point, anchor)
}

function zoneIntersectsCircle(center: Point, radius: number, zone: BaseballZone): boolean {
  if (pointInZone(center, zone)) {
    return true
  }

  const rings = [1, 0.66, 0.33]
  const segments = 16

  for (const ring of rings) {
    const sampleRadius = radius * ring
    for (let i = 0; i < segments; i += 1) {
      const angleDeg = (i / segments) * 360
      const sample = pointOnCircle(center, sampleRadius, angleDeg)
      if (pointInZone(sample, zone)) {
        return true
      }
    }
  }

  return false
}

export function resolveBaseballZoneHit(point: Point, radius = 0): { zone: BaseballZone | null; nearest: BaseballZone } {
  const hit = radius > 0
    ? ZONES_BY_PRIORITY_DESC.find((zone) => zoneIntersectsCircle(point, radius, zone)) ?? null
    : ZONES_BY_PRIORITY_DESC.find((zone) => pointInZone(point, zone)) ?? null

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
