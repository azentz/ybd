import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import baseballFieldReference from '../assets/baseball-field-reference-02.svg'
import {
  BASEBALL_ZONES,
  PITCHER_CENTER,
  resolveBaseballZoneHit,
  type BaseballZone,
  type Point,
  type ZoneShape,
} from '../lib/baseballZoneModel'

type ThrowResult = {
  id: string
  serial: number
  score: number
  target: string
  nearest: string
  impact: Point
}

type GesturePoint = Point & { t: number }

const FIELD_SIZE = 1000

const MIN_PULLBACK_PIXELS = 28
const ABSOLUTE_MIN_PULLBACK_PIXELS = 12
const MIN_FLICK_PIXELS = 28
const PULLBACK_PLATEAU_TOLERANCE = 8
const TRUE_FORWARD_START_PIXELS = 8
const MIN_FLICK_SPEED = 0.12
const MAX_FLICK_SPEED = 2.2
const MIN_CONTROL_FACTOR = 0.25
const TAU = Math.PI * 2
const OUTER_ARC_BULGE = 0

function zoneColor(zoneId: string): string {
  if (zoneId.includes('blue')) return '#1C20E6'
  if (zoneId.includes('dark-green')) return '#0A7A10'
  if (zoneId.includes('light-green') || zoneId.includes('green')) return '#31F227'
  if (zoneId.includes('yellow')) return '#F3F32F'
  if (zoneId.includes('orange')) return '#F2822F'
  if (zoneId.includes('gray') || zoneId.includes('grey')) return '#6E6E6E'
  if (zoneId.includes('dirt')) return '#8A520D'
  if (zoneId.includes('circle') || zoneId.includes('red') || zoneId.includes('badge')) return '#F30D0D'
  return '#6A6A6A'
}

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

function zonePath(zone: BaseballZone): string {
  const shape = zone.shape
  if (shape.kind === 'sector') return sectorPath(shape)
  if (shape.kind === 'arc-triangle') return arcTrianglePath(shape)
  if (shape.kind === 'circle-lens') return circleLensPath(shape)
  if (shape.kind === 'polygon') {
    return polygonPath(shape.points)
  }
  return ''
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function DartDemoPage() {
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const throwSerialRef = useRef(0)

  const [dragPoint, setDragPoint] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [primaryAim, setPrimaryAim] = useState<Point | null>(null)
  const [aimZoneLabel, setAimZoneLabel] = useState('')
  const [status, setStatus] = useState('Step 1: Click a primary aim point in the target field.')
  const [throws, setThrows] = useState<ThrowResult[]>([])
  const [pullQualityLabel, setPullQualityLabel] = useState('')
  const gesturePathRef = useRef<GesturePoint[]>([])

  const orderedZones = useMemo(
    () => [...BASEBALL_ZONES].sort((a, b) => a.priority - b.priority),
    [],
  )

  const shownZones = orderedZones

  const totalScore = useMemo(() => throws.reduce((sum, result) => sum + result.score, 0), [throws])

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

    // If the user pauses at max pullback, use the latest point on that plateau
    // so the hold is not counted as part of the flick.
    for (let i = path.length - 1; i >= backIndex; i -= 1) {
      const distanceFromAim = Math.hypot(path[i].x - primaryAim.x, path[i].y - primaryAim.y)
      if (distanceFromAim >= maxPullbackDistance - PULLBACK_PLATEAU_TOLERANCE) {
        backIndex = i
        break
      }
    }

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
      setStatus('After pulling back, move forward with intent, then release.')
      return
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
    const speedLift = Math.pow(effectiveSpeed, 1.3) * 220 * unlockedPower
    const gravityDrop = Math.pow(1 - normalizedSpeed, 1.15) * 130

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
    const impact = {
      x: clamp(primaryAim.x + lateralAdjust + jitterX, 0, FIELD_SIZE),
      y: clamp(primaryAim.y - speedLift - angleLift + gravityDrop + jitterY, 0, FIELD_SIZE),
    }

    const hit = resolveBaseballZoneHit(impact)
    const score = hit.zone?.score ?? 0
    const target = hit.zone?.id ?? 'miss'
    const nearest = hit.nearest.id
    throwSerialRef.current += 1

    const result: ThrowResult = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      serial: throwSerialRef.current,
      score,
      target,
      nearest,
      impact,
    }

    setThrows((prev) => [result, ...prev].slice(0, 12))
    setStatus(
      score > 0
        ? `Hit ${target}: +${score} points`
        : `Missed all scoring zones. Closest to ${nearest}.`,
    )

    const qualityText =
      pullQuality > 0.82
        ? 'smooth'
        : pullQuality > 0.58
          ? 'okay'
          : 'jerky'

    setPullQualityLabel(
      `Pull: ${qualityText} (straight ${pullStraightness.toFixed(2)}). Flick speed: ${normalizedSpeed.toFixed(2)} (control ${flickControlFactor.toFixed(2)}, straight ${flickStraightness.toFixed(2)}). Pullback: ${Math.round(pullback)}px.`,
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
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = pointerToField(event.clientX, event.clientY, true)
    const aimHit = resolveBaseballZoneHit(point)
    const aimTarget = aimHit.zone?.id ?? `miss (${aimHit.nearest.id} nearest)`

    setPrimaryAim({ x: point.x, y: point.y })
    setAimZoneLabel(`Aim zone: ${aimTarget}`)
    setStatus('Aim set. Pull back (inside or outside the field), then flick forward and release.')
    setIsDragging(true)
    gesturePathRef.current = [point]
    setDragPoint(point)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!isDragging) {
      return
    }

    const point = pointerToField(event.clientX, event.clientY, false)
    gesturePathRef.current.push(point)
    setDragPoint(point)
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!isDragging) {
      return
    }

    const releasePoint = pointerToField(event.clientX, event.clientY, false)
    gesturePathRef.current.push(releasePoint)
    setIsDragging(false)
    setDragPoint(null)
    registerThrow(releasePoint)
    gesturePathRef.current = []
  }

  function handleReset(): void {
    setThrows([])
    setPrimaryAim(null)
    setAimZoneLabel('')
    gesturePathRef.current = []
    throwSerialRef.current = 0
    setPullQualityLabel('')
    setStatus('Demo reset. Step 1: click a primary aim point in the target field.')
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
          <div
            ref={fieldRef}
            className="target-field"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            role="application"
            aria-label="Baseball field target"
          >
            <img
              className="target-field-image"
              src={baseballFieldReference}
              alt="Baseball field reference"
              draggable={false}
            />

            <svg
              className="zone-overlay"
              viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}
              aria-label="Hit zone overlay"
            >
              {shownZones.map((zone: BaseballZone) => {
                if (zone.shape.kind === 'circle') {
                  return (
                    <circle
                      key={zone.id}
                      className="zone-overlay-shape"
                      cx={zone.shape.center.x}
                      cy={zone.shape.center.y}
                      r={zone.shape.radius}
                      fill={zoneColor(zone.id)}
                      stroke={zoneColor(zone.id)}
                      strokeWidth={1.6}
                    />
                  )
                }

                return (
                  <path
                    key={zone.id}
                    className="zone-overlay-shape"
                    d={zonePath(zone)}
                    fill={zoneColor(zone.id)}
                    stroke={zoneColor(zone.id)}
                    strokeWidth={1.6}
                  />
                )
              })}
            </svg>

            {primaryAim ? (
              <div
                className="primary-aim-dot"
                style={{ left: `${(primaryAim.x / FIELD_SIZE) * 100}%`, top: `${(primaryAim.y / FIELD_SIZE) * 100}%` }}
                aria-label="Primary aim point"
              />
            ) : null}

            {primaryAim && dragPoint && isDragging ? (
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

            {throws.slice(0, 8).map((result, index) => (
              <div
                key={result.id}
                className={`impact-dot ${result.target === 'miss' ? 'impact-dot-miss' : 'impact-dot-hit'} ${index === 0 ? 'impact-dot-new' : 'impact-dot-old'}`}
                style={{ left: `${(result.impact.x / FIELD_SIZE) * 100}%`, top: `${(result.impact.y / FIELD_SIZE) * 100}%` }}
                aria-label={`Throw ${result.serial}: ${result.target}`}
              >
                <span className="impact-index">{result.serial}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="saved-data">
          Zone overlay: showing all {shownZones.length} zones. Hover a zone to highlight it.
        </p>
        {aimZoneLabel ? <p className="saved-data">{aimZoneLabel}</p> : null}

        <p className="status-text">{status}</p>
        {pullQualityLabel ? <p className="saved-data">{pullQualityLabel}</p> : null}
        <div className="button-row">
          <button type="button" onClick={handleReset}>Reset Demo</button>
          <Link className="button-link ghost-link" to="/">
            Back Home
          </Link>
        </div>
      </section>

      <section className="card" aria-labelledby="score-title">
        <h2 id="score-title">Score + Throw Log</h2>
        <p className="saved-data"><strong>Total score:</strong> {totalScore}</p>
        {throws.length === 0 ? (
          <p className="saved-data">No throws yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Throw</th>
                  <th>Target</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                {throws.map((result, index) => (
                  <tr key={result.id}>
                    <td>{index + 1}</td>
                    <td>{result.target === 'miss' ? `miss (${result.nearest} nearest)` : result.target}</td>
                    <td>{result.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default DartDemoPage
