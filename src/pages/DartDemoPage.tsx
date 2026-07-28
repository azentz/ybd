import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import baseballFieldReference from '../assets/baseball-field-reference-02.svg'
import { createDartballRealtimeBridge, type DartballRealtimeBridge } from '../lib/dartballRealtimeBridge'
import { realtimeClient, type ChatMessage, type Participant } from '../lib/realtime'
import {
  BASEBALL_ZONES,
  PITCHER_CENTER,
  resolveChordArcGeometry,
  resolveBaseballZoneHit,
  type BaseballZone,
  type Point,
  type ZoneShape,
} from '../lib/baseballZoneModel'

type ThrowResult = {
  id: string
  serial: number
  battingTeam: 'away' | 'home'
  inningLabel: string
  target: string
  nearest: string
  impact: Point
  call: string
  runsScored: number
  inning: number
  balls: number
  strikes: number
  outs: number
}

type ThrowCommand = {
  commandId: string
  source: 'local' | 'client'
  clientId: string | null
  createdAt: number
  rawImpact: Point
  impact: Point
  qualitySummary: string
}

type ReplayState = {
  gameState: GameState
  gameStats: GameStats
  lineupState: LineupState
  throws: ThrowResult[]
  fieldThrows: ThrowResult[]
  fieldThrowTurnKey: string | null
  lastThrowBanner: string | null
  followUpBanner: string | null
  status: string
  pullQualityLabel: string
  throwSerial: number
  clearFieldThrowsBeforeNextPitch: boolean
}

type ThrowHistoryEntry = {
  command: ThrowCommand
  before: ReplayState
  after: ReplayState
}

type ThrowHistoryState = {
  entries: ThrowHistoryEntry[]
  cursor: number
}

type CommandBusMode = 'host' | 'client'

type CommandBusOutboundEvent =
  | { type: 'throw-command'; command: ThrowCommand }
  | { type: 'undo-request' }
  | { type: 'redo-request' }
  | { type: 'lineup-request'; request: LineupRequest }
  | { type: 'state-updated'; snapshot: ReplayState; history: ThrowHistoryState }

type ThrowCommandBus = {
  setMode: (mode: CommandBusMode) => void
  getMode: () => CommandBusMode
  submitThrowCommand: (command: ThrowCommand) => void
  requestUndo: () => void
  requestRedo: () => void
  applyLineupRequest: (request: LineupRequest) => void
  applyHostSnapshot: (snapshot: ReplayState, history: ThrowHistoryState) => void
  subscribe: (listener: (event: CommandBusOutboundEvent) => void) => () => void
}

type NetworkDebugState = {
  bridgeEnabled: boolean
  bridgeConnected: boolean
  role: string
  room: string
  name: string
  busMode: CommandBusMode
  lastRealtimeStatus: string
  lastRealtimeError: string
  lastBusEvent: string
  outboundBusEvents: number
  inboundSnapshots: number
}

type BaseRunnerState = {
  first: boolean
  second: boolean
  third: boolean
}

type GameState = {
  inning: number
  half: 'top' | 'bottom'
  battingTeam: 'away' | 'home'
  balls: number
  strikes: number
  outs: number
  awayInningScores: number[]
  homeInningScores: number[]
  awayTotalRuns: number
  homeTotalRuns: number
  baseRunners: BaseRunnerState
}

type PlayOutcome =
  | 'home-run'
  | 'triple'
  | 'double'
  | 'single'
  | 'ball'
  | 'strike'
  | 'out'
  | 'double-play-out'
  | 'triple-play-out'
  | 'sac-bunt'
  | 'sac-fly'

type PlayResolution = {
  nextState: GameState
  call: string
  runsScored: number
  halfInningOver: boolean
  plateAppearanceOver: boolean
  gameOver: boolean
}

type TeamStats = {
  hits: number
  walks: number
  sacFlies: number
  atBats: number
  plateAppearances: number
  totalBases: number
}

type GameStats = {
  away: TeamStats
  home: TeamStats
}

type TeamSide = 'away' | 'home'
type TeamAssignment = TeamSide | 'spectator'

type LineupState = {
  started: boolean
  assignments: Record<string, TeamAssignment>
  awayOrder: string[]
  homeOrder: string[]
  awayBatterIndex: number
  homeBatterIndex: number
}

type LineupRequestAction =
  | { type: 'assign-team'; clientId: string; team: TeamAssignment }
  | { type: 'move-batter'; team: TeamSide; clientId: string; direction: 'up' | 'down' }
  | { type: 'start-game' }

type LineupRequest = {
  requestId: string
  senderClientId: string | null
  createdAt: number
  action: LineupRequestAction
}

type GesturePoint = Point & { t: number }

declare global {
  interface Window {
    dartballCommandBus?: ThrowCommandBus
  }
}

const FIELD_SIZE = 1000
const DART_RADIUS_UNITS = 11
const DART_OUTLINE_WIDTH = 2
const DART_FILL_RADIUS_UNITS = DART_RADIUS_UNITS - DART_OUTLINE_WIDTH / 2

const MIN_PULLBACK_PIXELS = 28
const ABSOLUTE_MIN_PULLBACK_PIXELS = 12
const MIN_FLICK_PIXELS = 28
const PULLBACK_PLATEAU_TOLERANCE = 8
const TRUE_FORWARD_START_PIXELS = 8
const MIN_FLICK_SPEED = 0.12
const MAX_FLICK_SPEED = 2.2
const MIN_CONTROL_FACTOR = 0.25
const THROW_BANNER_DURATION_MS = 1600
const MAX_TEAM_PLAYERS = 9
const TAU = Math.PI * 2
const OUTER_ARC_BULGE = 0
const BASE_RUNNER_SCALE = 1.15
const BASE_RUNNER_COLOR = '#121212'
const GOLDEN_ARCHES_VIEWBOX_WIDTH = 272.7
const GOLDEN_ARCHES_VIEWBOX_HEIGHT = 238.5
const GOLDEN_ARCHES_PATH_D =
  'm195.8 17.933c23.3 0 42.2 98.3 42.2 219.7h34c0-130.7-34.3-236.5-76.3-236.5-24 0-45.2 31.7-59.2 81.5-14-49.8-35.2-81.5-59-81.5-42 0-76.2 105.7-76.2 236.4h34c0-121.4 18.7-219.6 42-219.6s42.2 90.8 42.2 202.8h33.8c0-112 19-202.8 42.3-202.8'

const HOME_RUN_ZONES = new Set([
  'outfield-blue',
  'outfield-right-foul-pole',
  'outfield-left-foul-pole',
  'outfield-big-mac-land',
])

const SINGLE_ZONES = new Set([
  'outfield-light-green',
  'infield-dirt',
  'infield-orange-third-line',
  'infield-orange-first-line',
])

const DOUBLE_ZONES = new Set([
  'outfield-ground-rule-double',
  'outfield-green',
])

const TRIPLE_ZONES = new Set([
  'outfield-dark-green',
])

const BALL_ZONES = new Set([
  'catcher-dirt',
])

const SAC_BUNT_ZONES = new Set([
  'infield-yellow-home',
])

const SAC_FLY_ZONES = new Set([
  'badge-right-yellow',
  'badge-left-yellow',
  'badge-center-yellow',
])

const DOUBLE_PLAY_OUT_ZONES = new Set([
  'pitchers-plate-gray',
  'home-plate-gray',
  'first-base-circle-gray',
  'second-base-circle-gray',
  'shortstop-circle-gray',
  'third-base-circle-gray',
])

const OUT_ZONES = new Set([
  'outfield-miss-out',
  'infield-light-green',
  'third-base-zone-white',
  'second-base-zone-white',
  'first-base-zone-white',
  'first-base-circle-red',
  'second-base-circle-red',
  'shortstop-circle-red',
  'third-base-circle-red',
  'badge-right-red',
  'badge-left-red',
  'badge-center-red',
])

type LogoPathMark = {
  d: string
  transform: string
}

type BigMacZoneShape =
  | Extract<ZoneShape, { kind: 'arc-band-slice' }>
  | Extract<ZoneShape, { kind: 'sector' }>

function pointOnCircle(center: Point, radius: number, angleDeg: number): Point {
  const angleRad = (angleDeg * Math.PI) / 180
  return {
    x: center.x + Math.cos(angleRad) * radius,
    y: center.y + Math.sin(angleRad) * radius,
  }
}

function normalizeRadians(angleRad: number): number {
  const wrapped = angleRad % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

type ArcParams = {
  arcCenter: Point
  startAngle: number
  delta: number
  startRadius: number
  endRadius: number
  bulgePx: number
}

type PointWithDerivative = {
  point: Point
  derivative: Point
}

function buildArcParams(arcCenter: Point, start: Point, end: Point, clockwise: boolean, bulgePx: number): ArcParams {
  const startAngle = normalizeRadians(Math.atan2(start.y - arcCenter.y, start.x - arcCenter.x))
  const endAngle = normalizeRadians(Math.atan2(end.y - arcCenter.y, end.x - arcCenter.x))
  const startRadius = Math.hypot(start.x - arcCenter.x, start.y - arcCenter.y)
  const endRadius = Math.hypot(end.x - arcCenter.x, end.y - arcCenter.y)

  let delta = normalizeRadians(endAngle - startAngle)
  if (!clockwise && delta > 0) {
    delta -= TAU
  }

  return {
    arcCenter,
    startAngle,
    delta,
    startRadius,
    endRadius,
    bulgePx,
  }
}

function evaluatePitcherArc(params: ArcParams, t: number): PointWithDerivative {
  const theta = params.startAngle + params.delta * t

  const baseRadius = params.startRadius + (params.endRadius - params.startRadius) * t
  const bulge = Math.sin(Math.PI * t) * params.bulgePx
  const radius = baseRadius + bulge

  const drdt = params.endRadius - params.startRadius + Math.PI * Math.cos(Math.PI * t) * params.bulgePx

  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)

  return {
    point: {
      x: params.arcCenter.x + cosT * radius,
      y: params.arcCenter.y + sinT * radius,
    },
    derivative: {
      x: drdt * cosT - radius * sinT * params.delta,
      y: drdt * sinT + radius * cosT * params.delta,
    },
  }
}

function cubicForArcRange(params: ArcParams, t0: number, t1: number): { c1: Point; c2: Point; end: Point } {
  const startEval = evaluatePitcherArc(params, t0)
  const endEval = evaluatePitcherArc(params, t1)
  const dt = t1 - t0

  return {
    c1: {
      x: startEval.point.x + (startEval.derivative.x * dt) / 3,
      y: startEval.point.y + (startEval.derivative.y * dt) / 3,
    },
    c2: {
      x: endEval.point.x - (endEval.derivative.x * dt) / 3,
      y: endEval.point.y - (endEval.derivative.y * dt) / 3,
    },
    end: endEval.point,
  }
}

function arcToCubicCommands(arcCenter: Point, start: Point, end: Point, clockwise: boolean, bulgePx: number): string[] {
  const params = buildArcParams(arcCenter, start, end, clockwise, bulgePx)

  const first = cubicForArcRange(params, 0, 0.5)
  const second = cubicForArcRange(params, 0.5, 1)

  // Lock exact endpoints so corners remain perfectly aligned with HOME_CENTER rays.
  second.end = end

  return [
    `C ${first.c1.x} ${first.c1.y} ${first.c2.x} ${first.c2.y} ${first.end.x} ${first.end.y}`,
    `C ${second.c1.x} ${second.c1.y} ${second.c2.x} ${second.c2.y} ${second.end.x} ${second.end.y}`,
  ]
}

function sectorPath(shape: Extract<ZoneShape, { kind: 'sector' }>): string {
  const center = shape.center
  const arcCenter = shape.arcCenter ?? PITCHER_CENTER
  const outerRadius = shape.outerRadius
  const innerRadius = shape.innerRadius

  // Keep wedge corners fixed to HOME_CENTER geometry.
  const outerStart = pointOnCircle(center, outerRadius, shape.startAngleDeg)
  const outerEnd = pointOnCircle(center, outerRadius, shape.endAngleDeg)
  const innerEnd = pointOnCircle(center, innerRadius, shape.endAngleDeg)
  const innerStart = pointOnCircle(center, innerRadius, shape.startAngleDeg)

  const outerArcCommands = arcToCubicCommands(arcCenter, outerStart, outerEnd, true, OUTER_ARC_BULGE)

  if (shape.innerRadius <= 0) {
    return [
      `M ${center.x} ${center.y}`,
      `L ${outerStart.x} ${outerStart.y}`,
      ...outerArcCommands,
      'Z',
    ].join(' ')
  }

  const innerBulge = outerRadius > 0 ? OUTER_ARC_BULGE * (innerRadius / outerRadius) : 0
  const innerArcCommands = arcToCubicCommands(arcCenter, innerEnd, innerStart, false, innerBulge)

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    ...outerArcCommands,
    `L ${innerEnd.x} ${innerEnd.y}`,
    ...innerArcCommands,
    'Z',
  ].join(' ')
}

function polygonPath(points: Point[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  const segments = rest.map((p) => `L ${p.x} ${p.y}`).join(' ')
  return `M ${first.x} ${first.y} ${segments} Z`
}

function arcTrianglePath(shape: Extract<ZoneShape, { kind: 'arc-triangle' }>): string {
  const [a, b, c] = shape.points
  const sideAB = Math.hypot(b.x - a.x, b.y - a.y)
  const sideBC = Math.hypot(c.x - b.x, c.y - b.y)
  const sideCA = Math.hypot(a.x - c.x, a.y - c.y)
  const defaultRadius = (sideAB + sideBC + sideCA) / 3
  const [rAB, rBC, rCA] = shape.sideRadii ?? [defaultRadius, defaultRadius, defaultRadius]

  return [
    `M ${a.x} ${a.y}`,
    `A ${rAB} ${rAB} 0 0 1 ${b.x} ${b.y}`,
    `A ${rBC} ${rBC} 0 0 1 ${c.x} ${c.y}`,
    `A ${rCA} ${rCA} 0 0 1 ${a.x} ${a.y}`,
    'Z',
  ].join(' ')
}

function arcMidpoint(center: Point, radius: number, start: Point, end: Point, sweepFlag: 0 | 1): Point {
  const a0 = Math.atan2(start.y - center.y, start.x - center.x)
  const a1 = Math.atan2(end.y - center.y, end.x - center.x)
  let delta = normalizeRadians(a1 - a0)
  if (sweepFlag === 0 && delta > 0) delta -= TAU
  if (sweepFlag === 1 && delta < 0) delta += TAU
  const mid = a0 + delta / 2
  return {
    x: center.x + Math.cos(mid) * radius,
    y: center.y + Math.sin(mid) * radius,
  }
}

function circleIntersections(c1: Point, r1: number, c2: Point, r2: number): [Point, Point] | null {
  const dx = c2.x - c1.x
  const dy = c2.y - c1.y
  const d = Math.hypot(dx, dy)

  if (d <= Number.EPSILON) return null
  if (d > r1 + r2) return null
  if (d < Math.abs(r1 - r2)) return null

  const a = ((r1 * r1) - (r2 * r2) + (d * d)) / (2 * d)
  const hSq = (r1 * r1) - (a * a)
  if (hSq < 0) return null
  const h = Math.sqrt(Math.max(0, hSq))

  const xm = c1.x + (a * dx) / d
  const ym = c1.y + (a * dy) / d

  const rx = (-dy * h) / d
  const ry = (dx * h) / d

  return [
    { x: xm + rx, y: ym + ry },
    { x: xm - rx, y: ym - ry },
  ]
}

function circleLensPath(shape: Extract<ZoneShape, { kind: 'circle-lens' }>): string {
  const intersections = circleIntersections(
    shape.primaryCenter,
    shape.primaryRadius,
    shape.secondaryCenter,
    shape.secondaryRadius,
  )

  if (!intersections) {
    return ''
  }

  const [p1, p2] = intersections
  const primarySweep = ([0, 1] as const).find((sweep) => {
    const mid = arcMidpoint(shape.primaryCenter, shape.primaryRadius, p1, p2, sweep)
    return Math.hypot(mid.x - shape.secondaryCenter.x, mid.y - shape.secondaryCenter.y) <= shape.secondaryRadius
  }) ?? 1

  const secondarySweep = ([0, 1] as const).find((sweep) => {
    const mid = arcMidpoint(shape.secondaryCenter, shape.secondaryRadius, p2, p1, sweep)
    return Math.hypot(mid.x - shape.primaryCenter.x, mid.y - shape.primaryCenter.y) <= shape.primaryRadius
  }) ?? 1

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${shape.primaryRadius} ${shape.primaryRadius} 0 0 ${primarySweep} ${p2.x} ${p2.y}`,
    `A ${shape.secondaryRadius} ${shape.secondaryRadius} 0 0 ${secondarySweep} ${p1.x} ${p1.y}`,
    'Z',
  ].join(' ')
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

function upperArcSweep(center: Point, radius: number, start: Point, end: Point): 0 | 1 {
  const mid0 = arcMidpoint(center, radius, start, end, 0)
  const mid1 = arcMidpoint(center, radius, start, end, 1)
  return mid0.y <= mid1.y ? 0 : 1
}

function arcBandSlicePath(shape: Extract<ZoneShape, { kind: 'arc-band-slice' }>): string {
  const outerLeft = rayCircleIntersection(
    shape.sideCenter,
    shape.leftAngleDeg,
    shape.arcCenter,
    shape.outerArcRadius,
  )
  const outerRight = rayCircleIntersection(
    shape.sideCenter,
    shape.rightAngleDeg,
    shape.arcCenter,
    shape.outerArcRadius,
  )
  const innerLeft = rayCircleIntersection(
    shape.sideCenter,
    shape.leftAngleDeg,
    shape.arcCenter,
    shape.innerArcRadius,
  )
  const innerRight = rayCircleIntersection(
    shape.sideCenter,
    shape.rightAngleDeg,
    shape.arcCenter,
    shape.innerArcRadius,
  )

  if (!outerLeft || !outerRight || !innerLeft || !innerRight) {
    return ''
  }

  const outerSweep = upperArcSweep(shape.arcCenter, shape.outerArcRadius, outerLeft, outerRight)
  const innerSweep = upperArcSweep(shape.arcCenter, shape.innerArcRadius, innerRight, innerLeft)

  return [
    `M ${outerLeft.x} ${outerLeft.y}`,
    `A ${shape.outerArcRadius} ${shape.outerArcRadius} 0 0 ${outerSweep} ${outerRight.x} ${outerRight.y}`,
    `L ${innerRight.x} ${innerRight.y}`,
    `A ${shape.innerArcRadius} ${shape.innerArcRadius} 0 0 ${innerSweep} ${innerLeft.x} ${innerLeft.y}`,
    'Z',
  ].join(' ')
}

function bigMacZoneCorners(shape: BigMacZoneShape): { outerLeft: Point; outerRight: Point; innerLeft: Point; innerRight: Point } | null {
  if (shape.kind === 'arc-band-slice') {
    const outerLeft = rayCircleIntersection(shape.sideCenter, shape.leftAngleDeg, shape.arcCenter, shape.outerArcRadius)
    const outerRight = rayCircleIntersection(shape.sideCenter, shape.rightAngleDeg, shape.arcCenter, shape.outerArcRadius)
    const innerLeft = rayCircleIntersection(shape.sideCenter, shape.leftAngleDeg, shape.arcCenter, shape.innerArcRadius)
    const innerRight = rayCircleIntersection(shape.sideCenter, shape.rightAngleDeg, shape.arcCenter, shape.innerArcRadius)

    if (!outerLeft || !outerRight || !innerLeft || !innerRight) {
      return null
    }

    return { outerLeft, outerRight, innerLeft, innerRight }
  }

  return {
    outerLeft: pointOnCircle(shape.center, shape.outerRadius, shape.startAngleDeg),
    outerRight: pointOnCircle(shape.center, shape.outerRadius, shape.endAngleDeg),
    innerLeft: pointOnCircle(shape.center, shape.innerRadius, shape.startAngleDeg),
    innerRight: pointOnCircle(shape.center, shape.innerRadius, shape.endAngleDeg),
  }
}

function goldenArchesMark(shape: BigMacZoneShape): LogoPathMark | null {
  const corners = bigMacZoneCorners(shape)
  if (!corners) {
    return null
  }

  const { outerLeft, outerRight, innerLeft, innerRight } = corners

  // Build a local frame so the logo naturally follows the zone's tilt.
  const topVec = {
    x: outerRight.x - outerLeft.x,
    y: outerRight.y - outerLeft.y,
  }
  const sideVec = {
    x: ((innerLeft.x - outerLeft.x) + (innerRight.x - outerRight.x)) / 2,
    y: ((innerLeft.y - outerLeft.y) + (innerRight.y - outerRight.y)) / 2,
  }


  // Overscan the source mark and clip at render time so the arches read bolder.
  const marginU = 0.10
  const marginV = 0.12
  const scaleU = 1 - marginU * 2
  const scaleV = 1 - marginV * 2

  const sx = scaleU / GOLDEN_ARCHES_VIEWBOX_WIDTH
  const sy = scaleV / GOLDEN_ARCHES_VIEWBOX_HEIGHT

  const a = topVec.x * sx
  const b = topVec.y * sx
  const c = sideVec.x * sy
  const d = sideVec.y * sy
  const e = outerLeft.x + topVec.x * marginU + sideVec.x * marginV
  const f = outerLeft.y + topVec.y * marginU + sideVec.y * marginV

  return {
    d: GOLDEN_ARCHES_PATH_D,
    transform: `matrix(${a} ${b} ${c} ${d} ${e} ${f})`,
  }
}

function chordArcPath(shape: Extract<ZoneShape, { kind: 'chord-arc' }>): string {
  const geometry = resolveChordArcGeometry(shape)
  if (!geometry) {
    return ''
  }

  return [
    `M ${shape.start.x} ${shape.start.y}`,
    `L ${shape.end.x} ${shape.end.y}`,
    `A ${geometry.arcRadius} ${geometry.arcRadius} 0 0 ${geometry.sweepFlag} ${shape.start.x} ${shape.start.y}`,
    'Z',
  ].join(' ')
}

function zonePath(zone: BaseballZone): string {
  const shape = zone.shape
  if (shape.kind === 'sector') return sectorPath(shape)
  if (shape.kind === 'arc-triangle') return arcTrianglePath(shape)
  if (shape.kind === 'circle-lens') return circleLensPath(shape)
  if (shape.kind === 'chord-arc') return chordArcPath(shape)
  if (shape.kind === 'arc-band-slice') return arcBandSlicePath(shape)
  if (shape.kind === 'polygon') {
    return polygonPath(shape.points)
  }
  return ''
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function centroid(points: Point[]): Point {
  const total = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  )

  return {
    x: total.x / points.length,
    y: total.y / points.length,
  }
}

function zonePoint(zoneId: string): Point | null {
  const zone = BASEBALL_ZONES.find((candidate) => candidate.id === zoneId)
  if (!zone) {
    return null
  }

  if (zone.shape.kind === 'circle') {
    return zone.shape.center
  }

  if (zone.shape.kind === 'polygon') {
    return centroid(zone.shape.points)
  }

  return null
}

function baseRunnerGlyph(anchor: Point, label: string) {
  return (
    <g
      aria-label={label}
      transform={`translate(${anchor.x} ${anchor.y}) scale(${BASE_RUNNER_SCALE})`}
      pointerEvents="none"
    >
      <circle cx={0} cy={-9.4} r={2.35} fill={BASE_RUNNER_COLOR} />
      <polygon points="-1.1,-7.3 1.2,-7.3 2.1,-2.3 0,-1.1 -2.1,-2.3" fill={BASE_RUNNER_COLOR} />
      <path
        d="M 0 -6.2 L -3.9 -3.6 M 0 -5.6 L 4.2 -3.1 M 0 -2.1 L -3.5 3.3 M 0 -2.1 L 4.5 2.4"
        fill="none"
        stroke={BASE_RUNNER_COLOR}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  )
}

function emptyBases(): BaseRunnerState {
  return { first: false, second: false, third: false }
}

function initialTeamStats(): TeamStats {
  return {
    hits: 0,
    walks: 0,
    sacFlies: 0,
    atBats: 0,
    plateAppearances: 0,
    totalBases: 0,
  }
}

function initialGameStats(): GameStats {
  return {
    away: initialTeamStats(),
    home: initialTeamStats(),
  }
}

function cloneThrowResult(result: ThrowResult): ThrowResult {
  return {
    ...result,
    impact: { ...result.impact },
  }
}

function cloneThrowCommand(command: ThrowCommand): ThrowCommand {
  return {
    ...command,
    rawImpact: { ...command.rawImpact },
    impact: { ...command.impact },
  }
}

function cloneThrowList(throwList: ThrowResult[]): ThrowResult[] {
  return throwList.map(cloneThrowResult)
}

function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    awayInningScores: [...state.awayInningScores],
    homeInningScores: [...state.homeInningScores],
    baseRunners: { ...state.baseRunners },
  }
}

function cloneGameStats(stats: GameStats): GameStats {
  return {
    away: { ...stats.away },
    home: { ...stats.home },
  }
}

function initialLineupState(): LineupState {
  return {
    started: false,
    assignments: {},
    awayOrder: [],
    homeOrder: [],
    awayBatterIndex: 0,
    homeBatterIndex: 0,
  }
}

function cloneLineupState(lineupState: LineupState): LineupState {
  return {
    started: lineupState.started,
    assignments: { ...lineupState.assignments },
    awayOrder: [...lineupState.awayOrder],
    homeOrder: [...lineupState.homeOrder],
    awayBatterIndex: lineupState.awayBatterIndex,
    homeBatterIndex: lineupState.homeBatterIndex,
  }
}

function resolveTeamOrderFromAssignments(
  preferredOrder: string[],
  assignments: Record<string, TeamAssignment>,
  participants: Participant[],
  side: TeamSide,
): string[] {
  const selectedSet = new Set(
    participants
      .map((participant) => participant.clientId)
      .filter((clientId) => assignments[clientId] === side),
  )

  const kept = preferredOrder.filter((clientId) => selectedSet.has(clientId))
  const appended = Array.from(selectedSet).filter((clientId) => !kept.includes(clientId))
  return [...kept, ...appended].slice(0, MAX_TEAM_PLAYERS)
}

function clampBatterIndex(index: number, orderLength: number): number {
  if (orderLength <= 0) {
    return 0
  }

  return ((index % orderLength) + orderLength) % orderLength
}

function reconcileLineupState(lineupState: LineupState, participants: Participant[]): LineupState {
  const participantIds = new Set(participants.map((participant) => participant.clientId))

  const nextAssignments: Record<string, TeamAssignment> = {}
  for (const participant of participants) {
    const prior = lineupState.assignments[participant.clientId]
    nextAssignments[participant.clientId] = prior ?? 'spectator'
  }

  for (const clientId of Object.keys(nextAssignments)) {
    if (!participantIds.has(clientId)) {
      delete nextAssignments[clientId]
    }
  }

  const nextAwayOrder = resolveTeamOrderFromAssignments(lineupState.awayOrder, nextAssignments, participants, 'away')
  const nextHomeOrder = resolveTeamOrderFromAssignments(lineupState.homeOrder, nextAssignments, participants, 'home')
  const hasPlayableTeams = nextAwayOrder.length > 0 && nextHomeOrder.length > 0

  return {
    started: lineupState.started && hasPlayableTeams,
    assignments: nextAssignments,
    awayOrder: nextAwayOrder,
    homeOrder: nextHomeOrder,
    awayBatterIndex: clampBatterIndex(lineupState.awayBatterIndex, nextAwayOrder.length),
    homeBatterIndex: clampBatterIndex(lineupState.homeBatterIndex, nextHomeOrder.length),
  }
}

function lineupStatesEqual(left: LineupState, right: LineupState): boolean {
  if (left.started !== right.started) return false
  if (left.awayBatterIndex !== right.awayBatterIndex) return false
  if (left.homeBatterIndex !== right.homeBatterIndex) return false

  const leftAssignments = Object.keys(left.assignments)
  const rightAssignments = Object.keys(right.assignments)
  if (leftAssignments.length !== rightAssignments.length) return false
  for (const key of leftAssignments) {
    if (left.assignments[key] !== right.assignments[key]) return false
  }

  if (left.awayOrder.length !== right.awayOrder.length) return false
  if (left.homeOrder.length !== right.homeOrder.length) return false
  for (let i = 0; i < left.awayOrder.length; i += 1) {
    if (left.awayOrder[i] !== right.awayOrder[i]) return false
  }
  for (let i = 0; i < left.homeOrder.length; i += 1) {
    if (left.homeOrder[i] !== right.homeOrder[i]) return false
  }

  return true
}

function summarizeLineupNames(lineupNames: string[]): string {
  if (lineupNames.length === 0) {
    return 'No players'
  }

  if (lineupNames.length <= 3) {
    return lineupNames.join(', ')
  }

  const visible = lineupNames.slice(0, 3).join(', ')
  return `${visible} +${lineupNames.length - 3}`
}

function snapshotReplayState(input: ReplayState): ReplayState {
  return {
    gameState: cloneGameState(input.gameState),
    gameStats: cloneGameStats(input.gameStats),
    lineupState: cloneLineupState(input.lineupState),
    throws: cloneThrowList(input.throws),
    fieldThrows: cloneThrowList(input.fieldThrows),
    fieldThrowTurnKey: input.fieldThrowTurnKey,
    lastThrowBanner: input.lastThrowBanner,
    followUpBanner: input.followUpBanner,
    status: input.status,
    pullQualityLabel: input.pullQualityLabel,
    throwSerial: input.throwSerial,
    clearFieldThrowsBeforeNextPitch: input.clearFieldThrowsBeforeNextPitch,
  }
}

function cloneThrowHistoryState(history: ThrowHistoryState): ThrowHistoryState {
  return {
    cursor: history.cursor,
    entries: history.entries.map((entry) => ({
      command: cloneThrowCommand(entry.command),
      before: snapshotReplayState(entry.before),
      after: snapshotReplayState(entry.after),
    })),
  }
}

function initialGameState(): GameState {
  return {
    inning: 1,
    half: 'top',
    battingTeam: 'away',
    balls: 0,
    strikes: 0,
    outs: 0,
    awayInningScores: [0],
    homeInningScores: [0],
    awayTotalRuns: 0,
    homeTotalRuns: 0,
    baseRunners: emptyBases(),
  }
}

function hasAnyRunner(runners: BaseRunnerState): boolean {
  return runners.first || runners.second || runners.third
}

function runnerCount(runners: BaseRunnerState): number {
  return Number(runners.first) + Number(runners.second) + Number(runners.third)
}

function classifyPlay(zoneId: string | null, onTargetField: boolean): PlayOutcome {
  if (!zoneId) {
    return onTargetField ? 'strike' : 'out'
  }

  if (HOME_RUN_ZONES.has(zoneId)) return 'home-run'
  if (TRIPLE_ZONES.has(zoneId)) return 'triple'
  if (DOUBLE_ZONES.has(zoneId)) return 'double'
  if (SINGLE_ZONES.has(zoneId)) return 'single'
  if (BALL_ZONES.has(zoneId)) return 'ball'
  if (SAC_BUNT_ZONES.has(zoneId)) return 'sac-bunt'
  if (SAC_FLY_ZONES.has(zoneId)) return 'sac-fly'
  if (DOUBLE_PLAY_OUT_ZONES.has(zoneId)) return 'double-play-out'
  if (OUT_ZONES.has(zoneId)) return 'out'

  return 'out'
}

function advanceOnHit(runners: BaseRunnerState, bases: number): { runners: BaseRunnerState; runs: number } {
  const occupied = [runners.first, runners.second, runners.third]
  const next = [false, false, false]
  let runs = 0

  for (let index = 2; index >= 0; index -= 1) {
    if (!occupied[index]) continue

    const destination = index + bases
    if (destination >= 3) {
      runs += 1
    } else {
      next[destination] = true
    }
  }

  const batterDestination = bases - 1
  if (batterDestination >= 3) {
    runs += 1
  } else {
    next[batterDestination] = true
  }

  return {
    runners: {
      first: next[0],
      second: next[1],
      third: next[2],
    },
    runs,
  }
}

function advanceRunnersOnly(runners: BaseRunnerState, bases: number): { runners: BaseRunnerState; runs: number } {
  const occupied = [runners.first, runners.second, runners.third]
  const next = [false, false, false]
  let runs = 0

  for (let index = 2; index >= 0; index -= 1) {
    if (!occupied[index]) continue

    const destination = index + bases
    if (destination >= 3) {
      runs += 1
    } else {
      next[destination] = true
    }
  }

  return {
    runners: {
      first: next[0],
      second: next[1],
      third: next[2],
    },
    runs,
  }
}

function forceWalk(runners: BaseRunnerState): { runners: BaseRunnerState; runs: number } {
  if (!runners.first) {
    return { runners: { ...runners, first: true }, runs: 0 }
  }

  if (!runners.second) {
    return {
      runners: { first: true, second: true, third: runners.third },
      runs: 0,
    }
  }

  if (!runners.third) {
    return {
      runners: { first: true, second: true, third: true },
      runs: 0,
    }
  }

  return {
    runners: { first: true, second: true, third: true },
    runs: 1,
  }
}

function applyDoublePlayRunners(runners: BaseRunnerState): BaseRunnerState {
  if (runners.third) {
    return { ...runners, third: false }
  }

  if (runners.second) {
    return { ...runners, second: false }
  }

  if (runners.first) {
    return { ...runners, first: false }
  }

  return runners
}

function addRunsToInning(inningScores: number[], inning: number, runs: number): number[] {
  const next = [...inningScores]
  while (next.length < inning) {
    next.push(0)
  }

  next[inning - 1] = (next[inning - 1] ?? 0) + runs
  return next
}

function inningLabel(inning: number, half: 'top' | 'bottom'): string {
  return `${half === 'top' ? 'Top' : 'Bottom'} ${inning}`
}

function fieldThrowTurnKey(battingTeam: 'away' | 'home', inningLabelText: string): string {
  return `${battingTeam}:${inningLabelText}`
}

function resolveFieldThrowTurnKeyFromThrows(fieldThrowList: ThrowResult[]): string | null {
  if (fieldThrowList.length === 0) {
    return null
  }

  const first = fieldThrowList[0]
  return fieldThrowTurnKey(first.battingTeam, first.inningLabel)
}

function isHitOutcome(outcome: PlayOutcome): boolean {
  return outcome === 'single' || outcome === 'double' || outcome === 'triple' || outcome === 'home-run'
}

function formatAverage(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return '.000'
  }

  const rounded = Number((numerator / denominator).toFixed(3))
  if (rounded < 1) {
    const thousandths = Math.round(rounded * 1000)
    return `.${thousandths.toString().padStart(3, '0')}`
  }

  return rounded.toFixed(3)
}

function formatThreeDecimalStat(value: number): string {
  const rounded = Number(value.toFixed(3))
  if (rounded < 1) {
    const thousandths = Math.round(rounded * 1000)
    return `.${thousandths.toString().padStart(3, '0')}`
  }

  return rounded.toFixed(3)
}

function resolvePlay(gameState: GameState, outcome: PlayOutcome): PlayResolution {
  let nextBalls = gameState.balls
  let nextStrikes = gameState.strikes
  let nextOuts = gameState.outs
  let nextRunners = gameState.baseRunners
  let runsScored = 0
  let call = ''
  let plateAppearanceOver = false

  if (outcome === 'single') {
    const moved = advanceOnHit(nextRunners, 1)
    nextRunners = moved.runners
    runsScored = moved.runs
    nextBalls = 0
    nextStrikes = 0
    plateAppearanceOver = true
    call = `Single${runsScored > 0 ? `, ${runsScored} run${runsScored === 1 ? '' : 's'} scored` : ''}`
  } else if (outcome === 'double') {
    const moved = advanceOnHit(nextRunners, 2)
    nextRunners = moved.runners
    runsScored = moved.runs
    nextBalls = 0
    nextStrikes = 0
    plateAppearanceOver = true
    call = `Double${runsScored > 0 ? `, ${runsScored} run${runsScored === 1 ? '' : 's'} scored` : ''}`
  } else if (outcome === 'triple') {
    const moved = advanceOnHit(nextRunners, 3)
    nextRunners = moved.runners
    runsScored = moved.runs
    nextBalls = 0
    nextStrikes = 0
    plateAppearanceOver = true
    call = `Triple${runsScored > 0 ? `, ${runsScored} run${runsScored === 1 ? '' : 's'} scored` : ''}`
  } else if (outcome === 'home-run') {
    const moved = advanceOnHit(nextRunners, 4)
    nextRunners = moved.runners
    runsScored = moved.runs
    nextBalls = 0
    nextStrikes = 0
    plateAppearanceOver = true
    call = `Home run! ${runsScored} run${runsScored === 1 ? '' : 's'} scored`
  } else if (outcome === 'ball') {
    const balls = nextBalls + 1
    if (balls >= 4) {
      const walked = forceWalk(nextRunners)
      nextRunners = walked.runners
      runsScored = walked.runs
      nextBalls = 0
      nextStrikes = 0
      plateAppearanceOver = true
      call = `Ball four, walk${runsScored > 0 ? ` and ${runsScored} run scored` : ''}`
    } else {
      nextBalls = balls
      call = `Ball ${nextBalls}`
    }
  } else if (outcome === 'strike') {
    const strikes = nextStrikes + 1
    if (strikes >= 3) {
      nextOuts += 1
      nextBalls = 0
      nextStrikes = 0
      plateAppearanceOver = true
      call = 'Strike three, batter out'
    } else {
      nextStrikes = strikes
      call = `Strike ${nextStrikes}`
    }
  } else if (outcome === 'sac-bunt') {
    plateAppearanceOver = true
    if (nextOuts >= 2) {
      nextOuts += 1
      runsScored = 0
      call = 'Out'
      nextBalls = 0
      nextStrikes = 0
    } else {
    const hadRunners = hasAnyRunner(nextRunners)
    const resultingOuts = nextOuts + 1
    if (resultingOuts >= 3) {
      nextOuts = resultingOuts
      runsScored = 0
      call = hadRunners ? 'Sacrifice bunt, third out no run' : 'Out'
    } else {
      const moved = advanceRunnersOnly(nextRunners, 1)
      nextRunners = moved.runners
      runsScored = moved.runs
      nextOuts = resultingOuts
      call = hadRunners
        ? `Sacrifice bunt${runsScored > 0 ? `, ${runsScored} run scored` : ''}`
        : 'Out'
    }
    nextBalls = 0
    nextStrikes = 0
    }
  } else if (outcome === 'sac-fly') {
    plateAppearanceOver = true
    if (nextOuts >= 2) {
      nextOuts += 1
      runsScored = 0
      call = 'Out'
      nextBalls = 0
      nextStrikes = 0
    } else {
    const hadRunners = hasAnyRunner(nextRunners)
    const resultingOuts = nextOuts + 1
    if (resultingOuts >= 3) {
      nextOuts = resultingOuts
      runsScored = 0
      call = hadRunners ? 'Sacrifice fly, third out no run' : 'Out'
    } else {
      const moved = advanceRunnersOnly(nextRunners, 1)
      nextRunners = moved.runners
      runsScored = moved.runs
      nextOuts = resultingOuts
      call = hadRunners
        ? `Sacrifice fly${runsScored > 0 ? `, ${runsScored} run scored` : ''}`
        : 'Out'
    }
    nextBalls = 0
    nextStrikes = 0
      }
  } else if (outcome === 'double-play-out') {
    plateAppearanceOver = true
    if (nextOuts >= 2) {
      nextOuts += 1
      call = 'Out'
    } else if (hasAnyRunner(nextRunners)) {
      nextRunners = applyDoublePlayRunners(nextRunners)
      nextOuts += 2
      call = 'Double play'
    } else {
      nextOuts += 1
      call = 'Out'
    }
    nextBalls = 0
    nextStrikes = 0
  } else if (outcome === 'triple-play-out') {
    plateAppearanceOver = true
    nextOuts += 3
    nextBalls = 0
    nextStrikes = 0
    call = 'Triple play'
  } else {
    plateAppearanceOver = true
    nextOuts += 1
    nextBalls = 0
    nextStrikes = 0
    call = 'Out'
  }

  let nextInning = gameState.inning
  let nextHalf = gameState.half
  let nextBattingTeam = gameState.battingTeam
  let halfInningOver = false
  let gameOver = false
  let winner: 'away' | 'home' | null = null

  const awayTotalRuns = gameState.awayTotalRuns + (gameState.battingTeam === 'away' ? runsScored : 0)
  const homeTotalRuns = gameState.homeTotalRuns + (gameState.battingTeam === 'home' ? runsScored : 0)

  if (
    gameState.half === 'bottom'
    && gameState.inning >= 9
    && plateAppearanceOver
    && homeTotalRuns > awayTotalRuns
  ) {
    gameOver = true
    winner = 'home'
  }

  if (nextOuts >= 3) {
    halfInningOver = true

    if (gameState.inning >= 9) {
      if (gameState.half === 'top' && homeTotalRuns > awayTotalRuns) {
        gameOver = true
        winner = 'home'
      }

      if (gameState.half === 'bottom' && awayTotalRuns > homeTotalRuns) {
        gameOver = true
        winner = 'away'
      }
    }

    if (gameState.battingTeam === 'away') {
      nextHalf = 'bottom'
      nextBattingTeam = 'home'
    } else {
      nextHalf = 'top'
      nextBattingTeam = 'away'
      nextInning += 1
    }
    nextOuts = 0
    nextRunners = emptyBases()
  }

  const awayInningScores = gameState.battingTeam === 'away'
    ? addRunsToInning(gameState.awayInningScores, gameState.inning, runsScored)
    : [...gameState.awayInningScores]
  const homeInningScores = gameState.battingTeam === 'home'
    ? addRunsToInning(gameState.homeInningScores, gameState.inning, runsScored)
    : [...gameState.homeInningScores]

  while (awayInningScores.length < nextInning) {
    awayInningScores.push(0)
  }
  while (homeInningScores.length < nextInning) {
    homeInningScores.push(0)
  }

  return {
    call: gameOver && winner
      ? `${call}. ${winner.toUpperCase()} wins (AWAY ${awayTotalRuns}, HOME ${homeTotalRuns}). Resetting for a new game.`
      : (halfInningOver ? `${call}. ${gameState.battingTeam === 'away' ? 'Top' : 'Bottom'} half over.` : call),
    runsScored,
    halfInningOver,
    plateAppearanceOver,
    gameOver,
    nextState: {
      inning: nextInning,
      half: nextHalf,
      battingTeam: nextBattingTeam,
      balls: nextBalls,
      strikes: nextStrikes,
      outs: nextOuts,
      awayInningScores,
      homeInningScores,
      awayTotalRuns,
      homeTotalRuns,
      baseRunners: nextRunners,
    },
  }
}

function DartDemoPage() {
  const [searchParams] = useSearchParams()
  const roleParam = searchParams.get('role')
  const roomParam = searchParams.get('room')
  const nameParam = searchParams.get('name')
  const hasRealtimeBridgeParams =
    !!roomParam?.trim()
    && !!nameParam?.trim()
    && (roleParam === 'host' || roleParam === 'guest')
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const throwSerialRef = useRef(0)
  const activePointerIdRef = useRef<number | null>(null)
  const clearFieldThrowsBeforeNextPitchRef = useRef(false)
  const lastThrowBannerTimeoutRef = useRef<number | null>(null)
  const realtimeBridgeRef = useRef<DartballRealtimeBridge | null>(null)
  const submitThrowCommandRef = useRef<(command: ThrowCommand) => void>(() => {})
  const handleUndoRef = useRef<() => void>(() => {})
  const handleRedoRef = useRef<() => void>(() => {})
  const applyLineupRequestRef = useRef<(request: LineupRequest) => void>(() => {})
  const applyHostSnapshotRef = useRef<(snapshot: ReplayState, history: ThrowHistoryState) => void>(() => {})

  const [dragPoint, setDragPoint] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showReference, setShowReference] = useState(false)
  const [primaryAim, setPrimaryAim] = useState<Point | null>(null)
  const [status, setStatus] = useState('Step 1: Click a primary aim point in the target field.')
  const [throws, setThrows] = useState<ThrowResult[]>([])
  const [fieldThrows, setFieldThrows] = useState<ThrowResult[]>([])
  const [lastThrowBanner, setLastThrowBanner] = useState<string | null>(null)
  const [pullQualityLabel, setPullQualityLabel] = useState('')
  const [clickToThrowMode, setClickToThrowMode] = useState(false)
  const [gameState, setGameState] = useState<GameState>(initialGameState)
  const [gameStats, setGameStats] = useState<GameStats>(initialGameStats)
  const [lineupState, setLineupState] = useState<LineupState>(initialLineupState)
  const [throwHistory, setThrowHistory] = useState<ThrowHistoryState>({ entries: [], cursor: -1 })
  const [localClientId, setLocalClientId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('Not connected')
  const [connectionError, setConnectionError] = useState('')
  const gameStateRef = useRef<GameState>(gameState)
  const gameStatsRef = useRef<GameStats>(gameStats)
  const lineupStateRef = useRef<LineupState>(lineupState)
  const throwsRef = useRef<ThrowResult[]>(throws)
  const fieldThrowsRef = useRef<ThrowResult[]>(fieldThrows)
  const fieldThrowTurnKeyRef = useRef<string | null>(null)
  const lastThrowBannerRef = useRef<string | null>(lastThrowBanner)
  const followUpBannerRef = useRef<string | null>(null)
  const throwHistoryRef = useRef<ThrowHistoryState>(throwHistory)
  const statusRef = useRef<string>(status)
  const pullQualityLabelRef = useRef<string>(pullQualityLabel)
  const participantsRef = useRef<Participant[]>(participants)
  const [networkDebug, setNetworkDebug] = useState<NetworkDebugState>({
    bridgeEnabled: false,
    bridgeConnected: false,
    role: 'n/a',
    room: 'n/a',
    name: 'n/a',
    busMode: 'host',
    lastRealtimeStatus: 'idle',
    lastRealtimeError: '',
    lastBusEvent: 'none',
    outboundBusEvents: 0,
    inboundSnapshots: 0,
  })
  const commandBusModeRef = useRef<CommandBusMode>('host')
  const busListenersRef = useRef<Array<(event: CommandBusOutboundEvent) => void>>([])
  const gesturePathRef = useRef<GesturePoint[]>([])

  const orderedZones = useMemo(
    () => [...BASEBALL_ZONES].sort((a, b) => a.priority - b.priority),
    [],
  )

  const shownZones = orderedZones

  const bigMacLandShape = useMemo(() => {
    const zone = BASEBALL_ZONES.find((candidate) => candidate.id === 'outfield-big-mac-land')
    if (!zone || (zone.shape.kind !== 'arc-band-slice' && zone.shape.kind !== 'sector')) {
      return null
    }

    return zone.shape
  }, [])

  const outfieldBlueShape = useMemo(() => {
    const zone = BASEBALL_ZONES.find((candidate) => candidate.id === 'outfield-blue')
    if (!zone || zone.shape.kind !== 'sector') {
      return null
    }

    return zone.shape
  }, [])

  const bigMacBlueOverlay = useMemo(() => {
    if (!bigMacLandShape || !outfieldBlueShape) {
      return null
    }

    const center = bigMacLandShape.kind === 'arc-band-slice'
      ? bigMacLandShape.sideCenter
      : bigMacLandShape.center
    const leftAngle = bigMacLandShape.kind === 'arc-band-slice'
      ? bigMacLandShape.leftAngleDeg
      : bigMacLandShape.startAngleDeg
    const rightAngle = bigMacLandShape.kind === 'arc-band-slice'
      ? bigMacLandShape.rightAngleDeg
      : bigMacLandShape.endAngleDeg

    const rayRadius = FIELD_SIZE * 2
    const leftRay = pointOnCircle(center, rayRadius, leftAngle)
    const rightRay = pointOnCircle(center, rayRadius, rightAngle)

    return {
      sourcePath: sectorPath(outfieldBlueShape),
      clipPath: `M ${center.x} ${center.y} L ${leftRay.x} ${leftRay.y} L ${rightRay.x} ${rightRay.y} Z`,
    }
  }, [bigMacLandShape, outfieldBlueShape])

  const bigMacArchesMark = useMemo(
    () => (bigMacLandShape ? goldenArchesMark(bigMacLandShape) : null),
    [bigMacLandShape],
  )

  const baseRunnerMarkers = useMemo(() => {
    const first = zonePoint('first-base-zone-white')
    const second = zonePoint('second-base-zone-white')
    const third = zonePoint('third-base-zone-white')

    return {
      first,
      second,
      third,
    }
  }, [])

  const scoreboardInnings = useMemo(() => {
    const inningCount = Math.max(9, gameState.awayInningScores.length, gameState.homeInningScores.length, gameState.inning)
    return Array.from({ length: inningCount }, (_, index) => ({
      inning: index + 1,
      awayRuns: gameState.awayInningScores[index] ?? 0,
      homeRuns: gameState.homeInningScores[index] ?? 0,
      isCurrent: index + 1 === gameState.inning,
    }))
  }, [gameState.awayInningScores, gameState.homeInningScores, gameState.inning])

  const scoreboardGridColumns = `96px repeat(${scoreboardInnings.length}, minmax(24px, 1fr)) 46px`

  const battingStats = gameState.battingTeam === 'away' ? gameStats.away : gameStats.home
  const battingAvg = formatAverage(battingStats.hits, battingStats.atBats)
  const obpValue = (battingStats.hits + battingStats.walks)
    / Math.max(1, battingStats.atBats + battingStats.walks + battingStats.sacFlies)
  const slgValue = battingStats.totalBases / Math.max(1, battingStats.atBats)
  const onBasePct = formatThreeDecimalStat(obpValue)
  const sluggingPct = formatThreeDecimalStat(slgValue)
  const ops = formatThreeDecimalStat(obpValue + slgValue)
  const canUndo = throwHistory.cursor >= 0
  const canRedo = throwHistory.cursor < throwHistory.entries.length - 1
  const activeOrder = gameState.battingTeam === 'away' ? lineupState.awayOrder : lineupState.homeOrder
  const activeBatterIndex = gameState.battingTeam === 'away' ? lineupState.awayBatterIndex : lineupState.homeBatterIndex
  const activeBatterClientId = activeOrder.length > 0
    ? activeOrder[clampBatterIndex(activeBatterIndex, activeOrder.length)]
    : null
  const activeBatterParticipant = participants.find((participant) => participant.clientId === activeBatterClientId) ?? null
  const activeBatterName = activeBatterParticipant?.name ?? (activeBatterClientId === 'host' ? 'Host' : 'TBD')
  const awayOrderNames = lineupState.awayOrder.map((clientId) => {
    const participant = participants.find((candidate) => candidate.clientId === clientId)
    return participant?.name ?? 'Unknown player'
  })
  const homeOrderNames = lineupState.homeOrder.map((clientId) => {
    const participant = participants.find((candidate) => candidate.clientId === clientId)
    return participant?.name ?? 'Unknown player'
  })
  const awayTeamLabel = summarizeLineupNames(awayOrderNames)
  const homeTeamLabel = summarizeLineupNames(homeOrderNames)
  const battingPlayerName = activeBatterName
  const canStartLineupGame = lineupState.awayOrder.length > 0 && lineupState.homeOrder.length > 0
  const isHostController = hasRealtimeBridgeParams && roleParam === 'host'
  const localParticipant = participants.find((participant) => participant.clientId === localClientId) ?? null
  const localAssignment = localClientId ? (lineupState.assignments[localClientId] ?? 'spectator') : 'spectator'
  const isMyTurn = !hasRealtimeBridgeParams
    || (lineupState.started && !!localClientId && localClientId === activeBatterClientId)

  useEffect(() => {
    if (!hasRealtimeBridgeParams || isMyTurn) {
      return
    }

    activePointerIdRef.current = null
    gesturePathRef.current = []
    setIsDragging(false)
    setDragPoint(null)
    setPrimaryAim(null)
  }, [hasRealtimeBridgeParams, isMyTurn])

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  useEffect(() => {
    gameStatsRef.current = gameStats
  }, [gameStats])

  useEffect(() => {
    lineupStateRef.current = lineupState
  }, [lineupState])

  useEffect(() => {
    participantsRef.current = participants
  }, [participants])

  useEffect(() => {
    throwsRef.current = throws
  }, [throws])

  useEffect(() => {
    fieldThrowsRef.current = fieldThrows
  }, [fieldThrows])

  useEffect(() => {
    lastThrowBannerRef.current = lastThrowBanner
  }, [lastThrowBanner])

  useEffect(() => {
    throwHistoryRef.current = throwHistory
  }, [throwHistory])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    pullQualityLabelRef.current = pullQualityLabel
  }, [pullQualityLabel])

  useEffect(() => {
    if (!hasRealtimeBridgeParams) {
      setParticipants([])
      setChatMessages([])
      setConnectionStatus('Not connected')
      setConnectionError('')
      setLocalClientId(roleParam === 'host' ? 'host' : null)
      return
    }

    setLocalClientId(realtimeClient.getLocalClientId())

    const unsubscribe = realtimeClient.subscribe((event) => {
      if (event.type === 'status') {
        setLocalClientId(realtimeClient.getLocalClientId())
        setConnectionStatus(event.value)
        return
      }

      if (event.type === 'participants') {
        const knownLocalClientId = realtimeClient.getLocalClientId()
        if (knownLocalClientId) {
          setLocalClientId(knownLocalClientId)
        } else {
          const localPeerId = realtimeClient.getLocalPeerId()
          const localParticipant = event.value.find((participant) => participant.peerId === localPeerId)
          setLocalClientId(localParticipant?.clientId ?? null)
        }
        setParticipants(event.value)

        const reconciledLineup = reconcileLineupState(lineupStateRef.current, event.value)
        if (!lineupStatesEqual(reconciledLineup, lineupStateRef.current)) {
          lineupStateRef.current = reconciledLineup
          setLineupState(cloneLineupState(reconciledLineup))
          if (commandBusModeRef.current === 'host') {
            publishCurrentAuthoritativeState()
          }
        }
        return
      }

      if (event.type === 'chat') {
        setChatMessages((prev) => [...prev.slice(-99), event.value])
        return
      }

      if (event.type === 'error') {
        setConnectionError(event.value)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [hasRealtimeBridgeParams, roleParam])

  function emitCommandBusEvent(event: CommandBusOutboundEvent): void {
    setNetworkDebug((prev) => ({
      ...prev,
      busMode: commandBusModeRef.current,
      lastBusEvent: `out:${event.type}`,
      outboundBusEvents: prev.outboundBusEvents + 1,
    }))

    for (const listener of busListenersRef.current) {
      listener(event)
    }
  }

  function handleSendChat(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    if (!chatInput.trim()) {
      return
    }

    realtimeClient.sendChat(chatInput)
    setChatInput('')
  }

  function handleAssignTeam(clientId: string, team: TeamAssignment): void {
    submitLineupRequest({ type: 'assign-team', clientId, team })
  }

  function handleMoveBatter(team: TeamSide, clientId: string, direction: 'up' | 'down'): void {
    submitLineupRequest({ type: 'move-batter', team, clientId, direction })
  }

  function handleStartGame(): void {
    submitLineupRequest({ type: 'start-game' })
  }

  function handleReconnect(): void {
    setConnectionError('')
    realtimeClient.retryConnection()
  }

  function clearLastThrowBannerTimer(): void {
    if (lastThrowBannerTimeoutRef.current !== null) {
      window.clearTimeout(lastThrowBannerTimeoutRef.current)
      lastThrowBannerTimeoutRef.current = null
    }
  }

  function showBannerSequence(primaryBanner: string | null, followUpBanner: string | null): void {
    clearLastThrowBannerTimer()

    lastThrowBannerRef.current = primaryBanner
    followUpBannerRef.current = followUpBanner
    setLastThrowBanner(primaryBanner)

    if (!primaryBanner) {
      return
    }

    lastThrowBannerTimeoutRef.current = window.setTimeout(() => {
      if (followUpBanner) {
        lastThrowBannerRef.current = followUpBanner
        followUpBannerRef.current = null
        setLastThrowBanner(followUpBanner)

        lastThrowBannerTimeoutRef.current = window.setTimeout(() => {
          lastThrowBannerRef.current = null
          setLastThrowBanner(null)
          lastThrowBannerTimeoutRef.current = null
        }, THROW_BANNER_DURATION_MS)
        return
      }

      lastThrowBannerRef.current = null
      setLastThrowBanner(null)
      lastThrowBannerTimeoutRef.current = null
    }, THROW_BANNER_DURATION_MS)
  }

  function applyReplayState(state: ReplayState): void {
    const nextGameState = cloneGameState(state.gameState)
    const nextGameStats = cloneGameStats(state.gameStats)
    const nextLineupState = cloneLineupState(state.lineupState)
    const nextThrows = cloneThrowList(state.throws)
    const nextFieldThrows = cloneThrowList(state.fieldThrows)

    gameStateRef.current = nextGameState
    gameStatsRef.current = nextGameStats
    lineupStateRef.current = nextLineupState
    throwsRef.current = nextThrows
    fieldThrowsRef.current = nextFieldThrows
    fieldThrowTurnKeyRef.current = state.fieldThrowTurnKey ?? resolveFieldThrowTurnKeyFromThrows(nextFieldThrows)
    lastThrowBannerRef.current = state.lastThrowBanner
    followUpBannerRef.current = state.followUpBanner
    statusRef.current = state.status
    pullQualityLabelRef.current = state.pullQualityLabel

    setGameState(nextGameState)
    setGameStats(nextGameStats)
    setLineupState(nextLineupState)
    setThrows(nextThrows)
    setFieldThrows(nextFieldThrows)
    setStatus(state.status)
    setPullQualityLabel(state.pullQualityLabel)
    throwSerialRef.current = state.throwSerial
    clearFieldThrowsBeforeNextPitchRef.current = state.clearFieldThrowsBeforeNextPitch

    showBannerSequence(state.lastThrowBanner, state.followUpBanner)
  }

  function applyHostSnapshot(snapshot: ReplayState, history: ThrowHistoryState): void {
    applyReplayState(snapshot)
    const nextHistory = cloneThrowHistoryState(history)
    throwHistoryRef.current = nextHistory
    setThrowHistory(nextHistory)
    setNetworkDebug((prev) => ({
      ...prev,
      busMode: commandBusModeRef.current,
      lastBusEvent: 'in:state-updated',
      inboundSnapshots: prev.inboundSnapshots + 1,
    }))
  }

  function publishStateUpdated(snapshot: ReplayState, history: ThrowHistoryState): void {
    emitCommandBusEvent({
      type: 'state-updated',
      snapshot: snapshotReplayState(snapshot),
      history: cloneThrowHistoryState(history),
    })
  }

  function publishCurrentAuthoritativeState(nextStatus?: string): void {
    if (commandBusModeRef.current !== 'host') {
      return
    }

    const snapshot = snapshotReplayState({
      gameState: gameStateRef.current,
      gameStats: gameStatsRef.current,
      lineupState: lineupStateRef.current,
      throws: throwsRef.current,
      fieldThrows: fieldThrowsRef.current,
      fieldThrowTurnKey: fieldThrowTurnKeyRef.current,
      lastThrowBanner: lastThrowBannerRef.current,
      followUpBanner: followUpBannerRef.current,
      status: nextStatus ?? statusRef.current,
      pullQualityLabel: pullQualityLabelRef.current,
      throwSerial: throwSerialRef.current,
      clearFieldThrowsBeforeNextPitch: clearFieldThrowsBeforeNextPitchRef.current,
    })

    if (nextStatus !== undefined) {
      statusRef.current = nextStatus
      setStatus(nextStatus)
    }

    publishStateUpdated(snapshot, throwHistoryRef.current)
  }

  function applyLineupRequest(request: LineupRequest): void {
    if (commandBusModeRef.current !== 'host') {
      return
    }

    const currentLineup = lineupStateRef.current

    if (request.action.type === 'start-game') {
      const nextLineup = cloneLineupState(currentLineup)
      const canStart = nextLineup.awayOrder.length > 0 && nextLineup.homeOrder.length > 0
      if (!canStart) {
        setStatus('Need at least one batter on AWAY and HOME before starting.')
        return
      }

      nextLineup.started = true
      nextLineup.awayBatterIndex = 0
      nextLineup.homeBatterIndex = 0

      const resetStatus = 'Game started. Step 1: click a primary aim point in the target field.'
      const resetGameState = initialGameState()
      const resetGameStats = initialGameStats()
      const resetHistory: ThrowHistoryState = { entries: [], cursor: -1 }

      clearFieldThrowsBeforeNextPitchRef.current = false
      gameStateRef.current = resetGameState
      gameStatsRef.current = resetGameStats
      lineupStateRef.current = nextLineup
      throwsRef.current = []
      fieldThrowsRef.current = []
      fieldThrowTurnKeyRef.current = null
      lastThrowBannerRef.current = null
      followUpBannerRef.current = null
      throwHistoryRef.current = resetHistory
      statusRef.current = resetStatus
      pullQualityLabelRef.current = ''
      throwSerialRef.current = 0

      setThrows([])
      setFieldThrows([])
      setLastThrowBanner(null)
      setPrimaryAim(null)
      gesturePathRef.current = []
      setPullQualityLabel('')
      setGameState(resetGameState)
      setGameStats(resetGameStats)
      setLineupState(cloneLineupState(nextLineup))
      setThrowHistory(resetHistory)
      if (lastThrowBannerTimeoutRef.current !== null) {
        window.clearTimeout(lastThrowBannerTimeoutRef.current)
        lastThrowBannerTimeoutRef.current = null
      }
      setStatus(resetStatus)

      publishCurrentAuthoritativeState(resetStatus)
      return
    }

    if (currentLineup.started) {
      setStatus('Lineups are locked after game start. Use Reset to configure a new game.')
      return
    }

    const nextLineup = cloneLineupState(currentLineup)

    if (request.action.type === 'assign-team') {
      const action = request.action
      nextLineup.assignments[action.clientId] = action.team
      const reconciled = reconcileLineupState(nextLineup, participantsRef.current)
      lineupStateRef.current = reconciled
      setLineupState(cloneLineupState(reconciled))
      publishCurrentAuthoritativeState()
      return
    }

    if (request.action.type === 'move-batter') {
      const action = request.action
      const order = action.team === 'away' ? [...nextLineup.awayOrder] : [...nextLineup.homeOrder]
      const currentIndex = order.indexOf(action.clientId)
      if (currentIndex < 0) {
        return
      }

      const targetIndex = action.direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= order.length) {
        return
      }

      const moved = order[currentIndex]
      order[currentIndex] = order[targetIndex]
      order[targetIndex] = moved
      if (action.team === 'away') {
        nextLineup.awayOrder = order
      } else {
        nextLineup.homeOrder = order
      }

      const reconciled = reconcileLineupState(nextLineup, participantsRef.current)
      lineupStateRef.current = reconciled
      setLineupState(cloneLineupState(reconciled))
      publishCurrentAuthoritativeState()
    }
  }

  function handleUndo(): void {
    if (commandBusModeRef.current === 'client') {
      emitCommandBusEvent({ type: 'undo-request' })
      return
    }

    const currentHistory = throwHistoryRef.current
    if (currentHistory.cursor < 0) {
      return
    }

    const entry = currentHistory.entries[currentHistory.cursor]
    const nextHistory: ThrowHistoryState = {
      entries: currentHistory.entries,
      cursor: currentHistory.cursor - 1,
    }
    applyReplayState(entry.before)
    throwHistoryRef.current = nextHistory
    setThrowHistory(nextHistory)
    publishStateUpdated(entry.before, nextHistory)
  }

  function handleRedo(): void {
    if (commandBusModeRef.current === 'client') {
      emitCommandBusEvent({ type: 'redo-request' })
      return
    }

    const currentHistory = throwHistoryRef.current
    if (currentHistory.cursor >= currentHistory.entries.length - 1) {
      return
    }

    const entry = currentHistory.entries[currentHistory.cursor + 1]
    const nextHistory: ThrowHistoryState = {
      entries: currentHistory.entries,
      cursor: currentHistory.cursor + 1,
    }
    applyReplayState(entry.after)
    throwHistoryRef.current = nextHistory
    setThrowHistory(nextHistory)
    publishStateUpdated(entry.after, nextHistory)
  }

  submitThrowCommandRef.current = submitThrowCommand
  handleUndoRef.current = handleUndo
  handleRedoRef.current = handleRedo
  applyLineupRequestRef.current = applyLineupRequest
  applyHostSnapshotRef.current = applyHostSnapshot

  useEffect(() => {
    const commandBus: ThrowCommandBus = {
      setMode: (mode) => {
        commandBusModeRef.current = mode
      },
      getMode: () => commandBusModeRef.current,
      submitThrowCommand: (command) => {
        if (commandBusModeRef.current === 'client') {
          emitCommandBusEvent({ type: 'throw-command', command: cloneThrowCommand(command) })
          return
        }

        submitThrowCommandRef.current(cloneThrowCommand(command))
      },
      requestUndo: () => {
        handleUndoRef.current()
      },
      requestRedo: () => {
        handleRedoRef.current()
      },
      applyLineupRequest: (request) => {
        applyLineupRequestRef.current(request)
      },
      applyHostSnapshot: (snapshot, history) => {
        applyHostSnapshotRef.current(snapshot, history)
      },
      subscribe: (listener) => {
        busListenersRef.current = [...busListenersRef.current, listener]
        return () => {
          busListenersRef.current = busListenersRef.current.filter((candidate) => candidate !== listener)
        }
      },
    }

    window.dartballCommandBus = commandBus

    return () => {
      if (lastThrowBannerTimeoutRef.current !== null) {
        window.clearTimeout(lastThrowBannerTimeoutRef.current)
      }

      if (window.dartballCommandBus === commandBus) {
        delete window.dartballCommandBus
      }
    }
  }, [])

  useEffect(() => {
    setNetworkDebug((prev) => ({
      ...prev,
      bridgeEnabled: hasRealtimeBridgeParams,
      role: roleParam ?? 'n/a',
      room: roomParam ?? 'n/a',
      name: nameParam ?? 'n/a',
      busMode: roleParam === 'guest' ? 'client' : 'host',
      bridgeConnected: false,
      lastRealtimeStatus: hasRealtimeBridgeParams ? 'waiting to connect...' : 'missing role/room/name params',
      lastRealtimeError: '',
    }))
    setConnectionStatus(hasRealtimeBridgeParams ? 'Connecting...' : 'Not connected')
    setConnectionError('')

    if (!hasRealtimeBridgeParams) {
      return
    }

    let cancelled = false

    void (async () => {
      try {
        const bridge = await createDartballRealtimeBridge({
          role: roleParam as 'host' | 'guest',
          room: roomParam as string,
          name: nameParam as string,
          onStatus: (message) => {
            setConnectionStatus(message)
            setNetworkDebug((prev) => ({
              ...prev,
              lastRealtimeStatus: message,
            }))
          },
          onError: (message) => {
            setConnectionError(message)
            setNetworkDebug((prev) => ({
              ...prev,
              lastRealtimeError: message,
            }))
            setStatus((prev) => `${prev} [network: ${message}]`)
          },
        })

        if (cancelled) {
          bridge.dispose()
          return
        }

        realtimeBridgeRef.current = bridge
        setNetworkDebug((prev) => ({
          ...prev,
          bridgeConnected: true,
          busMode: roleParam === 'guest' ? 'client' : 'host',
          lastRealtimeStatus: `bridge connected (${roleParam})`,
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown bridge connection error'
        setNetworkDebug((prev) => ({
          ...prev,
          bridgeConnected: false,
          lastRealtimeError: message,
          lastRealtimeStatus: 'bridge connection failed',
        }))
        setStatus((prev) => `${prev} [network: ${message}]`)
      }
    })()

    return () => {
      cancelled = true
      if (realtimeBridgeRef.current) {
        realtimeBridgeRef.current.dispose()
        realtimeBridgeRef.current = null
      }
      setNetworkDebug((prev) => ({
        ...prev,
        bridgeConnected: false,
        lastRealtimeStatus: 'bridge disconnected',
      }))
    }
  }, [hasRealtimeBridgeParams, nameParam, roleParam, roomParam])

  function pointerToField(clientX: number, clientY: number, clampToField: boolean): GesturePoint {
    const rect = fieldRef.current?.getBoundingClientRect()

    if (!rect) {
      return { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2, t: performance.now() }
    }

    const x = ((clientX - rect.left) / rect.width) * FIELD_SIZE
    const y = ((clientY - rect.top) / rect.height) * FIELD_SIZE

    return {
      x: clampToField ? clamp(x, 0, FIELD_SIZE) : x,
      y: clampToField ? clamp(y, 0, FIELD_SIZE) : y,
      t: performance.now(),
    }
  }

  function createThrowCommand(
    rawImpact: Point,
    impact: Point,
    qualitySummary: string,
    source: 'local' | 'client' = 'local',
    clientId: string | null = null,
  ): ThrowCommand {
    return {
      commandId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      source,
      clientId,
      createdAt: Date.now(),
      rawImpact: { ...rawImpact },
      impact: { ...impact },
      qualitySummary,
    }
  }

  function submitThrowCommand(command: ThrowCommand): void {
    if (commandBusModeRef.current === 'client') {
      emitCommandBusEvent({ type: 'throw-command', command: cloneThrowCommand(command) })
      return
    }

    finalizeThrow(cloneThrowCommand(command))
  }

  function submitLineupRequest(action: LineupRequestAction): void {
    const request: LineupRequest = {
      requestId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      senderClientId: localClientId,
      createdAt: Date.now(),
      action,
    }

    if (commandBusModeRef.current === 'client') {
      emitCommandBusEvent({ type: 'lineup-request', request })
      return
    }

    applyLineupRequest(request)
  }

  function finalizeThrow(command: ThrowCommand): void {
    const currentGameState = gameStateRef.current
    const currentGameStats = gameStatsRef.current
    const currentLineupState = lineupStateRef.current
    const currentThrows = throwsRef.current
    const currentFieldThrows = fieldThrowsRef.current
    const currentStatus = statusRef.current
    const currentPullQualityLabel = pullQualityLabelRef.current
    const currentHistory = throwHistoryRef.current

    const rawImpact = command.rawImpact
    const impact = command.impact
    const qualitySummary = command.qualitySummary

    const beforeState = snapshotReplayState({
      gameState: currentGameState,
      gameStats: currentGameStats,
      lineupState: currentLineupState,
      throws: currentThrows,
      fieldThrows: currentFieldThrows,
      fieldThrowTurnKey: fieldThrowTurnKeyRef.current,
      lastThrowBanner: lastThrowBannerRef.current,
      followUpBanner: followUpBannerRef.current,
      status: currentStatus,
      pullQualityLabel: currentPullQualityLabel,
      throwSerial: throwSerialRef.current,
      clearFieldThrowsBeforeNextPitch: clearFieldThrowsBeforeNextPitchRef.current,
    })

    const onTargetField = rawImpact.x >= 0
      && rawImpact.x <= FIELD_SIZE
      && rawImpact.y >= 0
      && rawImpact.y <= FIELD_SIZE

    const hit = resolveBaseballZoneHit(rawImpact, DART_RADIUS_UNITS)
    const target = hit.zone?.id ?? 'miss'
    const nearest = hit.nearest.id
    const isThirdBaseTriplePlay = hit.zone?.id === 'third-base-zone-white'
      && currentGameState.outs === 0
      && runnerCount(currentGameState.baseRunners) >= 2
    const outcome = isThirdBaseTriplePlay
      ? 'triple-play-out'
      : classifyPlay(hit.zone?.id ?? null, onTargetField)
    const hadAnyRunnerAtStart = hasAnyRunner(currentGameState.baseRunners)
    const battingTeam = currentGameState.battingTeam
    const currentInningLabel = inningLabel(currentGameState.inning, currentGameState.half)
    const resolution = resolvePlay(currentGameState, outcome)
    const postPlayState = resolution.gameOver ? initialGameState() : resolution.nextState

    const nextGameState = resolution.gameOver ? initialGameState() : resolution.nextState

    let nextGameStats = cloneGameStats(currentGameStats)
    if (resolution.gameOver) {
      nextGameStats = initialGameStats()
    } else {
      const teamStats = battingTeam === 'away' ? currentGameStats.away : currentGameStats.home
      const walkEndedPlateAppearance = resolution.plateAppearanceOver && outcome === 'ball'
      const isSacrifice = (outcome === 'sac-bunt' || outcome === 'sac-fly') && hadAnyRunnerAtStart
      const plateAppearanceIncrement = resolution.plateAppearanceOver ? 1 : 0
      const atBatIncrement = resolution.plateAppearanceOver && !walkEndedPlateAppearance && !isSacrifice ? 1 : 0
      const totalBasesIncrement = outcome === 'single'
        ? 1
        : outcome === 'double'
          ? 2
          : outcome === 'triple'
            ? 3
            : outcome === 'home-run'
              ? 4
              : 0

      const nextTeamStats: TeamStats = {
        ...teamStats,
        hits: teamStats.hits + (isHitOutcome(outcome) ? 1 : 0),
        walks: teamStats.walks + (walkEndedPlateAppearance ? 1 : 0),
        sacFlies: teamStats.sacFlies + (resolution.plateAppearanceOver && outcome === 'sac-fly' && hadAnyRunnerAtStart ? 1 : 0),
        plateAppearances: teamStats.plateAppearances + plateAppearanceIncrement,
        atBats: teamStats.atBats + atBatIncrement,
        totalBases: teamStats.totalBases + totalBasesIncrement,
      }

      nextGameStats = {
        away: battingTeam === 'away' ? nextTeamStats : currentGameStats.away,
        home: battingTeam === 'home' ? nextTeamStats : currentGameStats.home,
      }
    }

    const nextThrowSerial = throwSerialRef.current + 1

    const result: ThrowResult = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      serial: nextThrowSerial,
      battingTeam,
      inningLabel: currentInningLabel,
      target,
      nearest,
      impact,
      call: resolution.call,
      runsScored: resolution.runsScored,
      inning: resolution.nextState.inning,
      balls: resolution.nextState.balls,
      strikes: resolution.nextState.strikes,
      outs: resolution.nextState.outs,
    }

    let nextThrows = cloneThrowList(currentThrows)
    let nextFieldThrows = cloneThrowList(currentFieldThrows)
    let nextFieldThrowTurnKey = fieldThrowTurnKeyRef.current
    let nextThrowSerialRefValue = nextThrowSerial
    let nextClearFieldThrowsBeforeNextPitch = clearFieldThrowsBeforeNextPitchRef.current

    if (resolution.gameOver) {
      nextThrows = []
      nextFieldThrows = []
      nextFieldThrowTurnKey = null
      nextThrowSerialRefValue = 0
      nextClearFieldThrowsBeforeNextPitch = false
    } else {
      nextThrows = [result, ...nextThrows]
      const currentTurnKey = fieldThrowTurnKey(battingTeam, currentInningLabel)
      const shouldResetForTurnChange = nextFieldThrowTurnKey !== null && nextFieldThrowTurnKey !== currentTurnKey
      const currentBatterThrows = (nextClearFieldThrowsBeforeNextPitch || shouldResetForTurnChange) ? [] : nextFieldThrows
      nextFieldThrows = [...currentBatterThrows, result]
      nextFieldThrowTurnKey = currentTurnKey
      nextClearFieldThrowsBeforeNextPitch = resolution.halfInningOver || resolution.plateAppearanceOver
    }

    const nextLineupState = cloneLineupState(currentLineupState)
    if (resolution.plateAppearanceOver && !resolution.gameOver) {
      if (battingTeam === 'away' && nextLineupState.awayOrder.length > 0) {
        nextLineupState.awayBatterIndex = clampBatterIndex(
          nextLineupState.awayBatterIndex + 1,
          nextLineupState.awayOrder.length,
        )
      }

      if (battingTeam === 'home' && nextLineupState.homeOrder.length > 0) {
        nextLineupState.homeBatterIndex = clampBatterIndex(
          nextLineupState.homeBatterIndex + 1,
          nextLineupState.homeOrder.length,
        )
      }
    }

    const nextStatus = `${resolution.call} Zone: ${target === 'miss' ? `miss (${nearest} nearest)` : target}. Count ${postPlayState.balls}-${postPlayState.strikes}, outs ${postPlayState.outs}, ${inningLabel(postPlayState.inning, postPlayState.half)} (${postPlayState.battingTeam.toUpperCase()} batting).`

    const briefCall = `${battingTeam.toUpperCase()} - ${resolution.call.split('. ')[0]}`
    const followUpBanner = resolution.halfInningOver ? `${postPlayState.battingTeam.toUpperCase()} up` : null

    const afterState = snapshotReplayState({
      gameState: nextGameState,
      gameStats: nextGameStats,
      lineupState: nextLineupState,
      throws: nextThrows,
      fieldThrows: nextFieldThrows,
      fieldThrowTurnKey: nextFieldThrowTurnKey,
      lastThrowBanner: briefCall,
      followUpBanner,
      status: nextStatus,
      pullQualityLabel: qualitySummary,
      throwSerial: nextThrowSerialRefValue,
      clearFieldThrowsBeforeNextPitch: nextClearFieldThrowsBeforeNextPitch,
    })

    const committedGameState = cloneGameState(nextGameState)
    const committedGameStats = cloneGameStats(nextGameStats)
    const committedLineupState = cloneLineupState(nextLineupState)
    const committedThrows = cloneThrowList(nextThrows)
    const committedFieldThrows = cloneThrowList(nextFieldThrows)

    gameStateRef.current = committedGameState
    gameStatsRef.current = committedGameStats
    lineupStateRef.current = committedLineupState
    throwsRef.current = committedThrows
    fieldThrowsRef.current = committedFieldThrows
    fieldThrowTurnKeyRef.current = nextFieldThrowTurnKey
    statusRef.current = nextStatus
    pullQualityLabelRef.current = qualitySummary

    setGameState(committedGameState)
    setGameStats(committedGameStats)
    setLineupState(committedLineupState)
    setThrows(committedThrows)
    setFieldThrows(committedFieldThrows)
    throwSerialRef.current = nextThrowSerialRefValue
    clearFieldThrowsBeforeNextPitchRef.current = nextClearFieldThrowsBeforeNextPitch
    setStatus(nextStatus)
    showBannerSequence(briefCall, followUpBanner)
    setPullQualityLabel(qualitySummary)

    const nextHistory = ((prev: ThrowHistoryState) => {
      const retainedEntries = prev.entries.slice(0, prev.cursor + 1)
      const nextEntry: ThrowHistoryEntry = {
        command,
        before: beforeState,
        after: afterState,
      }
      const nextEntries = [...retainedEntries, nextEntry]
      return {
        entries: nextEntries,
        cursor: nextEntries.length - 1,
      }
    })(currentHistory)
    throwHistoryRef.current = nextHistory
    setThrowHistory(nextHistory)
    publishStateUpdated(afterState, nextHistory)
  }

  function registerThrow(releasePoint: GesturePoint): void {
    if (!primaryAim) {
      setStatus('Set primary aim first: click somewhere in the target field.')
      return
    }

    const path = gesturePathRef.current
    if (path.length < 3) {
      setStatus('Gesture too short. Pull back smoothly, then flick forward.')
      return
    }

    let backIndex = 0
    let maxPullbackDistance = 0

    for (let i = 1; i < path.length; i += 1) {
      const distanceFromAim = Math.hypot(path[i].x - primaryAim.x, path[i].y - primaryAim.y)
      if (distanceFromAim > maxPullbackDistance) {
        maxPullbackDistance = distanceFromAim
        backIndex = i
      }
    }

    // If the user pauses at max pullback, keep only the contiguous plateau
    // right after the max point so forward motion is not reclassified as pullback.
    let plateauEndIndex = backIndex
    for (let i = backIndex + 1; i < path.length; i += 1) {
      const distanceFromAim = Math.hypot(path[i].x - primaryAim.x, path[i].y - primaryAim.y)
      if (distanceFromAim >= maxPullbackDistance - PULLBACK_PLATEAU_TOLERANCE) {
        plateauEndIndex = i
      } else {
        break
      }
    }
    backIndex = plateauEndIndex

    const backPoint = path[backIndex]
    const pullback = maxPullbackDistance
    const availableDownwardRoom = Math.max(0, FIELD_SIZE - primaryAim.y)
    const edgeAdjustedMinPullback = clamp(
      Math.min(MIN_PULLBACK_PIXELS, availableDownwardRoom * 0.45),
      ABSOLUTE_MIN_PULLBACK_PIXELS,
      MIN_PULLBACK_PIXELS,
    )

    if (pullback < edgeAdjustedMinPullback) {
      setStatus(`Pull back a bit more before flicking forward (need ~${Math.round(edgeAdjustedMinPullback)}px).`)
      return
    }

    if (backIndex >= path.length - 1) {
      setStatus('After pulling back, flick forward and release.')
      return
    }

    let flickStartIndex = -1
    const backToAimX = primaryAim.x - backPoint.x
    const backToAimY = primaryAim.y - backPoint.y

    for (let i = backIndex + 1; i < path.length; i += 1) {
      const travelX = path[i].x - backPoint.x
      const travelY = path[i].y - backPoint.y
      const travelDistance = Math.hypot(travelX, travelY)
      if (travelDistance < TRUE_FORWARD_START_PIXELS) {
        continue
      }

      const forwardDot = travelX * backToAimX + travelY * backToAimY
      if (forwardDot > 0) {
        flickStartIndex = i
        break
      }
    }

    if (flickStartIndex < 0) {
      // Fallback: if move events are sparse, use the release vector itself
      // so a valid forward flick is not dropped.
      const releaseTravelX = releasePoint.x - backPoint.x
      const releaseTravelY = releasePoint.y - backPoint.y
      const releaseTravelDistance = Math.hypot(releaseTravelX, releaseTravelY)
      const releaseForwardDot = releaseTravelX * backToAimX + releaseTravelY * backToAimY

      if (releaseTravelDistance >= TRUE_FORWARD_START_PIXELS && releaseForwardDot > 0) {
        flickStartIndex = backIndex
      } else {
        setStatus('After pulling back, move forward with intent, then release.')
        return
      }
    }

    const flickStartPoint = path[flickStartIndex]
    const flickSegment = path.slice(flickStartIndex)

    const flickVectorX = releasePoint.x - flickStartPoint.x
    const flickVectorY = releasePoint.y - flickStartPoint.y
    const flickDistance = Math.hypot(flickVectorX, flickVectorY)

    if (-flickVectorY < MIN_FLICK_PIXELS || flickDistance < MIN_FLICK_PIXELS) {
      setStatus('Flick forward/upward after pulling back.')
      return
    }

    const flickDuration = Math.max(16, releasePoint.t - flickStartPoint.t)
    const flickSpeed = clamp(flickDistance / flickDuration, MIN_FLICK_SPEED, MAX_FLICK_SPEED)

    const pullSegment = path.slice(0, backIndex + 1)
    const pullSmoothnessPenalty = computeSmoothnessPenalty(pullSegment)
    const pullStraightness = computePathStraightness(pullSegment)

    const flickSmoothnessPenalty = computeSmoothnessPenalty(flickSegment)
    const flickStraightness = computePathStraightness(flickSegment)

    const pullControlPenalty = clamp(pullSmoothnessPenalty * 0.65 + (1 - pullStraightness) * 0.9, 0, 1)
    const flickControlPenalty = clamp(flickSmoothnessPenalty * 0.45 + (1 - flickStraightness) * 0.7, 0, 1)
    const pullQuality = Math.max(0, 1 - pullControlPenalty)

    // Longer pullback unlocks more effective flick power.
    const pullRoomFactor = clamp((pullback - edgeAdjustedMinPullback) / 120, 0, 1)
    const unlockedPower = clamp(0.35 + pullRoomFactor * 0.9, 0.35, 1.25)

    // Flick speed drives height strongly: faster = higher, slower = lower.
    const normalizedSpeed = clamp((flickSpeed - MIN_FLICK_SPEED) / (MAX_FLICK_SPEED - MIN_FLICK_SPEED), 0, 1)
    const flickControlFactor = clamp(1 - flickControlPenalty * 0.35, MIN_CONTROL_FACTOR, 1)
    const effectiveSpeed = normalizedSpeed * flickControlFactor
    const speedLift = Math.pow(effectiveSpeed, 1.45) * 175 * unlockedPower
    const gravityDrop = Math.pow(1 - normalizedSpeed, 1.2) * 180

    // Very slow flicks should fall much lower than the aim point.
    const lowSpeedDrop =
      normalizedSpeed < 0.2
        ? Math.pow((0.2 - normalizedSpeed) / 0.2, 1.8) * 220
        : 0

    // Flick angle adjusts aim left/right and contributes some lift when flicking upward.
    const upwardIntent = clamp(-flickVectorY, 0, 220)
    const angleLift = upwardIntent * 0.26

    // Flick direction should directly steer the throw result.
    const directionalInfluence = clamp(0.8 + effectiveSpeed * 0.55, 0.8, 1.35)
    const lateralAdjust = flickVectorX * 0.68 * unlockedPower * directionalInfluence

    // Poor pullback (jerky and not straight) increases random aim error.
    const jitterAmount = Math.pow(pullControlPenalty, 1.35) * 92
    const jitterX = (Math.random() * 2 - 1) * jitterAmount
    const jitterY = (Math.random() * 2 - 1) * jitterAmount

    // Primary aim is chosen first; drag and flick then alter landing based on direction and speed.
    const rawImpact = {
      x: primaryAim.x + lateralAdjust + jitterX,
      y: primaryAim.y - speedLift - angleLift + gravityDrop + lowSpeedDrop + jitterY,
    }
    const impact = {
      x: clamp(rawImpact.x, 0, FIELD_SIZE),
      y: clamp(rawImpact.y, 0, FIELD_SIZE),
    }

    const qualityText =
      pullQuality > 0.82
        ? 'smooth'
        : pullQuality > 0.58
          ? 'okay'
          : 'jerky'

    submitThrowCommand(
      createThrowCommand(
        rawImpact,
        impact,
        `Pull: ${qualityText} (straight ${pullStraightness.toFixed(2)}). Flick speed: raw ${flickSpeed.toFixed(2)} px/ms (norm ${normalizedSpeed.toFixed(2)}, control ${flickControlFactor.toFixed(2)}, straight ${flickStraightness.toFixed(2)}). Pullback: ${Math.round(pullback)}px.`,
      ),
    )
  }

  function computePathStraightness(points: GesturePoint[]): number {
    if (points.length < 2) {
      return 0
    }

    const start = points[0]
    const end = points[points.length - 1]
    const netDistance = Math.hypot(end.x - start.x, end.y - start.y)

    let traveledDistance = 0
    for (let i = 1; i < points.length; i += 1) {
      traveledDistance += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    }

    if (traveledDistance < 0.001) {
      return 0
    }

    return clamp(netDistance / traveledDistance, 0, 1)
  }

  function computeSmoothnessPenalty(points: GesturePoint[]): number {
    if (points.length < 3) {
      return 1
    }

    let totalDirectionChange = 0
    let sampleCount = 0

    for (let i = 2; i < points.length; i += 1) {
      const ax = points[i - 1].x - points[i - 2].x
      const ay = points[i - 1].y - points[i - 2].y
      const bx = points[i].x - points[i - 1].x
      const by = points[i].y - points[i - 1].y

      const amag = Math.hypot(ax, ay)
      const bmag = Math.hypot(bx, by)
      if (amag < 0.5 || bmag < 0.5) {
        continue
      }

      const dot = clamp((ax * bx + ay * by) / (amag * bmag), -1, 1)
      const angle = Math.acos(dot)

      totalDirectionChange += angle
      sampleCount += 1
    }

    if (sampleCount === 0) {
      return 0.9
    }

    const avgAngle = totalDirectionChange / sampleCount
    return clamp(avgAngle / 1.2, 0, 1)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault()

    if (hasRealtimeBridgeParams && !isMyTurn) {
      setStatus(
        `Waiting for ${activeBatterName} to throw for ${gameState.battingTeam.toUpperCase()}.`,
      )
      return
    }

    const point = pointerToField(event.clientX, event.clientY, true)

    if (clickToThrowMode) {
      submitThrowCommand(
        createThrowCommand(point, point, ''),
      )
      return
    }

    activePointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setPrimaryAim({ x: point.x, y: point.y })
    setStatus('Aim set. Pull back (inside or outside the field), then flick forward and release.')
    setIsDragging(true)
    gesturePathRef.current = [point]
    setDragPoint(point)
  }

  function handleDragStart(event: ReactDragEvent<HTMLElement>): void {
    event.preventDefault()
  }

  function appendPointerSamples(
    event: ReactPointerEvent<HTMLDivElement>,
    clampToField: boolean,
  ): GesturePoint {
    const nativeEvent = event.nativeEvent
    const coalesced = typeof nativeEvent.getCoalescedEvents === 'function'
      ? nativeEvent.getCoalescedEvents()
      : []

    // Desktop mouse input can be coalesced aggressively, so consume all
    // available samples to avoid missing pullback/flick transitions.
    if (coalesced.length > 0) {
      let lastPoint = pointerToField(event.clientX, event.clientY, clampToField)
      for (const sample of coalesced) {
        const point = pointerToField(sample.clientX, sample.clientY, clampToField)
        gesturePathRef.current.push(point)
        lastPoint = point
      }
      return lastPoint
    }

    const point = pointerToField(event.clientX, event.clientY, clampToField)
    gesturePathRef.current.push(point)
    return point
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    const point = appendPointerSamples(event, false)
    setDragPoint(point)
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>): void {
    if (activePointerIdRef.current !== event.pointerId) {
      return
    }

    const releasePoint = appendPointerSamples(event, false)
    activePointerIdRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setIsDragging(false)
    setDragPoint(null)
    registerThrow(releasePoint)
    gesturePathRef.current = []
  }

  function handleReset(): void {
    const resetStatus = 'Demo reset. Step 1: click a primary aim point in the target field.'
    const resetGameState = initialGameState()
    const resetGameStats = initialGameStats()
    const resetHistory: ThrowHistoryState = { entries: [], cursor: -1 }
    const resetLineupState = {
      ...reconcileLineupState(lineupStateRef.current, participantsRef.current),
      started: false,
      awayBatterIndex: 0,
      homeBatterIndex: 0,
    }

    activePointerIdRef.current = null
    clearFieldThrowsBeforeNextPitchRef.current = false
    gameStateRef.current = resetGameState
    gameStatsRef.current = resetGameStats
    lineupStateRef.current = resetLineupState
    throwsRef.current = []
    fieldThrowsRef.current = []
    fieldThrowTurnKeyRef.current = null
    lastThrowBannerRef.current = null
    followUpBannerRef.current = null
    throwHistoryRef.current = resetHistory
    statusRef.current = resetStatus
    pullQualityLabelRef.current = ''
    setThrows([])
    setFieldThrows([])
    setLastThrowBanner(null)
    setPrimaryAim(null)
    gesturePathRef.current = []
    throwSerialRef.current = 0
    setPullQualityLabel('')
    setGameState(resetGameState)
    setGameStats(resetGameStats)
    setLineupState(cloneLineupState(resetLineupState))
    setThrowHistory(resetHistory)
    if (lastThrowBannerTimeoutRef.current !== null) {
      window.clearTimeout(lastThrowBannerTimeoutRef.current)
      lastThrowBannerTimeoutRef.current = null
    }
    setStatus(resetStatus)

    if (commandBusModeRef.current === 'host') {
      publishStateUpdated(
        snapshotReplayState({
          gameState: resetGameState,
          gameStats: resetGameStats,
          lineupState: resetLineupState,
          throws: [],
          fieldThrows: [],
          fieldThrowTurnKey: null,
          lastThrowBanner: null,
          followUpBanner: null,
          status: resetStatus,
          pullQualityLabel: '',
          throwSerial: 0,
          clearFieldThrowsBeforeNextPitch: false,
        }),
        resetHistory,
      )
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="kicker">Release 3 - Solo Demo</p>
        <h1>Single Player Dart Throw Demo</h1>
        <p className="lead">
          No networking in this mode. Tune throw feel and scoring before multiplayer integration.
        </p>
      </header>

      <section className="card" aria-labelledby="dart-demo-title">
        <h2 id="dart-demo-title">Target Field</h2>
        <div className="dart-demo-layout">
          <div className="target-field-stage">
            <div
              ref={fieldRef}
              className="target-field"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onDragStart={handleDragStart}
              role="application"
              aria-label="Baseball field target"
            >
              {showReference ? (
                <img
                  className="target-field-image"
                  src={baseballFieldReference}
                  alt="Baseball field reference"
                  draggable={false}
                  onDragStart={handleDragStart}
                />
              ) : null}

              <svg
                className="zone-overlay"
                viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}
                aria-label="Hit zone overlay"
              >
                {shownZones.map((zone: BaseballZone) => {
                  if (zone.id === 'outfield-big-mac-land') {
                    return null
                  }

                  if (zone.shape.kind === 'circle') {
                    return (
                      <circle
                        key={zone.id}
                        className="zone-overlay-shape"
                        cx={zone.shape.center.x}
                        cy={zone.shape.center.y}
                        r={zone.shape.radius}
                        fill={zone.color}
                        stroke={zone.color}
                        strokeWidth={1.6}
                      />
                    )
                  }

                  return (
                    <path
                      key={zone.id}
                      className="zone-overlay-shape"
                      d={zonePath(zone)}
                      fill={zone.color}
                      stroke={zone.color}
                      strokeWidth={1.6}
                    />
                  )
                })}

                {bigMacBlueOverlay ? (
                  <>
                    <defs>
                      <clipPath id="big-mac-blue-clip">
                        <path d={bigMacBlueOverlay.clipPath} />
                      </clipPath>
                    </defs>
                    <path
                      className="zone-overlay-shape"
                      d={bigMacBlueOverlay.sourcePath}
                      clipPath="url(#big-mac-blue-clip)"
                      fill="#F30D0D"
                      stroke="#F30D0D"
                      strokeWidth={1.6}
                    />
                  </>
                ) : null}

                {bigMacArchesMark ? (
                  <>
                    <path
                      d={bigMacArchesMark.d}
                      transform={bigMacArchesMark.transform}
                      fill="#7A1A09"
                      stroke="#7A1A09"
                      strokeWidth={1.5}
                      opacity={0.28}
                      pointerEvents="none"
                    />
                    <path
                      d={bigMacArchesMark.d}
                      transform={bigMacArchesMark.transform}
                      fill="#F4D000"
                      stroke="#E9C700"
                      strokeWidth={2}
                      pointerEvents="none"
                    />
                  </>
                ) : null}
              </svg>

              {primaryAim && !clickToThrowMode ? (
                <svg className="throw-vector throw-vector-field" viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}>
                  <circle
                    cx={primaryAim.x}
                    cy={primaryAim.y}
                    r={DART_FILL_RADIUS_UNITS}
                    fill="#256290"
                    stroke="#eef6ff"
                    strokeWidth={DART_OUTLINE_WIDTH}
                    aria-label="Primary aim point"
                  />
                </svg>
              ) : null}

              {primaryAim && !clickToThrowMode && dragPoint && isDragging ? (
                <svg className="throw-vector throw-vector-field" viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}>
                  <line
                    x1={primaryAim.x}
                    y1={primaryAim.y}
                    x2={dragPoint.x}
                    y2={dragPoint.y}
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              ) : null}

              <svg className="throw-vector throw-vector-field" viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}>
                {gameState.baseRunners.first && baseRunnerMarkers.first ? (
                  baseRunnerGlyph(baseRunnerMarkers.first, 'Runner on first base')
                ) : null}
                {gameState.baseRunners.second && baseRunnerMarkers.second ? (
                  baseRunnerGlyph(baseRunnerMarkers.second, 'Runner on second base')
                ) : null}
                {gameState.baseRunners.third && baseRunnerMarkers.third ? (
                  baseRunnerGlyph(baseRunnerMarkers.third, 'Runner on third base')
                ) : null}

                {fieldThrows.map((result) => (
                  <g key={result.id} aria-label={`Throw ${result.serial}: ${result.target}`}>
                    {(() => {
                      const isAway = result.battingTeam === 'away'
                      const isMiss = result.target === 'miss'
                      const fill = isAway
                        ? (isMiss ? '#1f4d86' : '#2e78d2')
                        : (isMiss ? '#8f261f' : '#d24a3b')
                      const stroke = isAway ? '#e3efff' : '#ffe2dc'

                      return (
                        <circle
                          cx={result.impact.x}
                          cy={result.impact.y}
                          r={DART_FILL_RADIUS_UNITS}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={DART_OUTLINE_WIDTH}
                        />
                      )
                    })()}
                    <text
                      x={result.impact.x}
                      y={result.impact.y - DART_RADIUS_UNITS - 4}
                      textAnchor="middle"
                      fill="#ffffff"
                      stroke="#20190f"
                      strokeWidth={0.8}
                      paintOrder="stroke"
                      fontSize={9}
                      fontWeight={700}
                    >
                      {result.serial}
                    </text>
                  </g>
                ))}
              </svg>

              <div className="field-count-panel" aria-label="Balls strikes outs">
                <div className="count-row">
                  <span className="count-label">B</span>
                  <div className="count-lights">
                    {[0, 1, 2].map((index) => (
                      <span
                        key={`ball-${index}`}
                        className={`count-light ${gameState.balls > index ? 'is-on is-ball' : ''}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="count-row">
                  <span className="count-label">S</span>
                  <div className="count-lights">
                    {[0, 1].map((index) => (
                      <span
                        key={`strike-${index}`}
                        className={`count-light ${gameState.strikes > index ? 'is-on is-strike' : ''}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="count-row">
                  <span className="count-label">O</span>
                  <div className="count-lights">
                    {[0, 1].map((index) => (
                      <span
                        key={`out-${index}`}
                        className={`count-light ${gameState.outs > index ? 'is-on is-out' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {lastThrowBanner ? (
                <div className="field-last-throw-banner" aria-live="polite">
                  {lastThrowBanner}
                </div>
              ) : null}

              <div className="field-stats-panel" aria-label="Live baseball stats">
                <div className={`field-stats-title batting-team-${gameState.battingTeam}`}>
                  {gameState.battingTeam.toUpperCase()} batting - {battingPlayerName}
                </div>
                {!lineupState.started ? (
                  <div className="saved-data">Waiting for host to start game.</div>
                ) : null}
                <div className="field-stats-grid">
                  <span>AVG</span>
                  <strong>{battingAvg}</strong>
                  <span>OBP</span>
                  <strong>{onBasePct}</strong>
                  <span>SLG</span>
                  <strong>{sluggingPct}</strong>
                  <span>OPS</span>
                  <strong>{ops}</strong>
                </div>
              </div>
            </div>

            <div className="field-scoreboard" aria-label="Inning scoreboard">
              <div className="field-scoreboard-grid" style={{ gridTemplateColumns: scoreboardGridColumns }}>
                <div className="score-cell score-head score-team-head">TEAM</div>
                {scoreboardInnings.map((entry) => (
                  <div key={`head-${entry.inning}`} className={`score-cell score-head ${entry.isCurrent ? 'is-current-inning' : ''}`}>
                    {entry.inning}
                  </div>
                ))}
                <div className="score-cell score-head">R</div>

                <div
                  className={`score-cell score-team score-team-away ${gameState.battingTeam === 'away' ? 'is-active-batting' : ''}`}
                >
                  AWAY{gameState.battingTeam === 'away' ? ' *' : ''} - {awayTeamLabel}
                </div>
                {scoreboardInnings.map((entry) => (
                  <div key={`away-${entry.inning}`} className={`score-cell ${entry.isCurrent ? 'is-current-inning' : ''}`}>
                    {entry.awayRuns}
                  </div>
                ))}
                <div className="score-cell score-total">{gameState.awayTotalRuns}</div>

                <div
                  className={`score-cell score-team score-team-home ${gameState.battingTeam === 'home' ? 'is-active-batting' : ''}`}
                >
                  HOME{gameState.battingTeam === 'home' ? ' *' : ''} - {homeTeamLabel}
                </div>
                {scoreboardInnings.map((entry) => (
                  <div key={`home-${entry.inning}`} className={`score-cell ${entry.isCurrent ? 'is-current-inning' : ''}`}>
                    {entry.homeRuns}
                  </div>
                ))}
                <div className="score-cell score-total">{gameState.homeTotalRuns}</div>
              </div>
            </div>

            <div className="runner-controls" aria-label="Throw mode controls">
              <span className="runner-controls-label">Throw mode:</span>
              <label>
                <input
                  type="checkbox"
                  checked={clickToThrowMode}
                  onChange={(event) => setClickToThrowMode(event.target.checked)}
                />
                Click-to-throw test mode
              </label>
            </div>
          </div>
        </div>

        <p className="status-text">{status}</p>
        {pullQualityLabel ? <p className="saved-data">{pullQualityLabel}</p> : null}

        <div className="debug-panel" aria-label="Network debug panel">
          <div className="debug-panel-title">Debug</div>
          <div>Bridge: {networkDebug.bridgeEnabled ? (networkDebug.bridgeConnected ? 'connected' : 'configured') : 'disabled'}</div>
          <div>Role: {networkDebug.role} | Bus: {networkDebug.busMode}</div>
          <div>Room: {networkDebug.room}</div>
          <div>Name: {networkDebug.name}</div>
          <div>RT: {networkDebug.lastRealtimeStatus}</div>
          <div>Last bus: {networkDebug.lastBusEvent}</div>
          <div>Out: {networkDebug.outboundBusEvents} | In snapshots: {networkDebug.inboundSnapshots}</div>
          {networkDebug.lastRealtimeError ? <div className="debug-panel-error">Err: {networkDebug.lastRealtimeError}</div> : null}
        </div>

        <div className="button-row">
          <button type="button" onClick={() => setShowReference((prev) => !prev)}>
            {showReference ? 'Hide Reference' : 'Show Reference'}
          </button>
          <button type="button" onClick={handleUndo} disabled={!canUndo}>
            Undo Throw
          </button>
          <button type="button" onClick={handleRedo} disabled={!canRedo}>
            Redo Throw
          </button>
          <button type="button" onClick={handleReset}>Reset Demo</button>
          <Link className="button-link ghost-link" to="/">
            Back Home
          </Link>
        </div>
      </section>

      <section className="card" aria-labelledby="score-title">
        <h2 id="score-title">Score + Throw Log</h2>
        {throws.length === 0 ? (
          <p className="saved-data">No throws yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Throw</th>
                  <th>Team/Inning</th>
                  <th>Zone</th>
                  <th>Call</th>
                  <th>Runs</th>
                  <th>Count</th>
                  <th>Outs</th>
                </tr>
              </thead>
              <tbody>
                {throws.map((result, index) => (
                  <tr key={result.id}>
                    <td>{index + 1}</td>
                    <td>{result.battingTeam.toUpperCase()} {result.inningLabel}</td>
                    <td>{result.target === 'miss' ? `miss (${result.nearest} nearest)` : result.target}</td>
                    <td>{result.call}</td>
                    <td>{result.runsScored}</td>
                    <td>{result.balls}-{result.strikes}</td>
                    <td>{result.outs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {hasRealtimeBridgeParams ? (
        <section className="card" aria-labelledby="chat-title">
          <h2 id="chat-title">Room Chat</h2>
          <p className="saved-data">Status: {connectionStatus}</p>
          {connectionError ? <p className="error-text">{connectionError}</p> : null}

          <div className="button-row reconnect-row">
            <button type="button" className="ghost" onClick={handleReconnect}>
              {roleParam === 'host' ? 'Rebind Host Room' : 'Reconnect'}
            </button>
          </div>

          <div className="lineup-setup" aria-label="Team assignments and batting order">
            <h3>Pregame Lineup</h3>
            <p className="saved-data">
              {lineupState.started
                ? `Live game. ${gameState.battingTeam.toUpperCase()} batter: ${activeBatterName}`
                : `Waiting to start. AWAY: ${lineupState.awayOrder.length} | HOME: ${lineupState.homeOrder.length}`}
            </p>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Role</th>
                    <th>Team</th>
                  </tr>
                </thead>
                <tbody>
                  {participants.map((participant) => {
                    const assignment = lineupState.assignments[participant.clientId] ?? 'spectator'
                    return (
                      <tr key={participant.clientId}>
                        <td>{participant.name}{participant.clientId === localClientId ? ' (you)' : ''}</td>
                        <td>{participant.isHost ? 'Host' : 'Guest'}</td>
                        <td>
                          {isHostController && !lineupState.started ? (
                            <select
                              value={assignment}
                              onChange={(event) => {
                                handleAssignTeam(participant.clientId, event.target.value as TeamAssignment)
                              }}
                            >
                              <option value="spectator">Spectator</option>
                              <option value="away">Away</option>
                              <option value="home">Home</option>
                            </select>
                          ) : (
                            assignment.toUpperCase()
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {!isHostController && !lineupState.started && localParticipant ? (
              <div className="button-row">
                <span className="saved-data">My team: {localAssignment.toUpperCase()}</span>
                <button
                  type="button"
                  className={localAssignment === 'away' ? '' : 'ghost'}
                  onClick={() => handleAssignTeam(localParticipant.clientId, 'away')}
                >
                  Join Away
                </button>
                <button
                  type="button"
                  className={localAssignment === 'home' ? '' : 'ghost'}
                  onClick={() => handleAssignTeam(localParticipant.clientId, 'home')}
                >
                  Join Home
                </button>
                <button
                  type="button"
                  className={localAssignment === 'spectator' ? '' : 'ghost'}
                  onClick={() => handleAssignTeam(localParticipant.clientId, 'spectator')}
                >
                  Spectate
                </button>
              </div>
            ) : null}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>AWAY Order</th>
                    <th>HOME Order</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: Math.max(lineupState.awayOrder.length, lineupState.homeOrder.length, 1) }, (_, index) => {
                    const awayClientId = lineupState.awayOrder[index]
                    const homeClientId = lineupState.homeOrder[index]
                    const awayName = awayClientId
                      ? (participants.find((participant) => participant.clientId === awayClientId)?.name ?? 'Unknown')
                      : ''
                    const homeName = homeClientId
                      ? (participants.find((participant) => participant.clientId === homeClientId)?.name ?? 'Unknown')
                      : ''

                    return (
                      <tr key={`order-row-${index}`}>
                        <td>
                          {awayName ? `${index + 1}. ${awayName}` : ''}
                          {isHostController && !lineupState.started && awayClientId ? (
                            <span>
                              {' '}
                              <button type="button" onClick={() => handleMoveBatter('away', awayClientId, 'up')} disabled={index === 0}>↑</button>
                              <button
                                type="button"
                                onClick={() => handleMoveBatter('away', awayClientId, 'down')}
                                disabled={index >= lineupState.awayOrder.length - 1}
                              >
                                ↓
                              </button>
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {homeName ? `${index + 1}. ${homeName}` : ''}
                          {isHostController && !lineupState.started && homeClientId ? (
                            <span>
                              {' '}
                              <button type="button" onClick={() => handleMoveBatter('home', homeClientId, 'up')} disabled={index === 0}>↑</button>
                              <button
                                type="button"
                                onClick={() => handleMoveBatter('home', homeClientId, 'down')}
                                disabled={index >= lineupState.homeOrder.length - 1}
                              >
                                ↓
                              </button>
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {isHostController ? (
              <div className="button-row">
                <button type="button" onClick={handleStartGame} disabled={!canStartLineupGame || lineupState.started}>
                  {lineupState.started ? 'Game Started' : 'Start Game'}
                </button>
                {!canStartLineupGame && !lineupState.started ? (
                  <span className="saved-data">Need at least one batter on each team.</span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="chat-box" aria-live="polite">
            {chatMessages.length === 0 ? (
              <p className="saved-data">No messages yet.</p>
            ) : (
              chatMessages.map((message) => (
                <p key={message.id} className={message.kind === 'system' ? 'chat-system' : 'chat-user'}>
                  <strong>{message.sender}:</strong> {message.text}
                </p>
              ))
            )}
          </div>

          <form className="chat-form" onSubmit={handleSendChat}>
            <label htmlFor="demo-chat-input">Message</label>
            <input
              id="demo-chat-input"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Send message to room"
              maxLength={300}
            />
            <div className="button-row">
              <button type="submit" disabled={!chatInput.trim()}>
                Send
              </button>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  )
}
export default DartDemoPage
