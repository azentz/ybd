import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import baseballFieldTarget from '../assets/baseball-field-target.svg'

type Point = { x: number; y: number }

type ThrowResult = {
  id: string
  serial: number
  score: number
  target: 'small' | 'medium' | 'large' | 'miss'
  nearest: 'small' | 'medium' | 'large'
  impact: Point
}

type GesturePoint = Point & { t: number }

type TargetDot = {
  id: 'small' | 'medium' | 'large'
  center: Point
  radius: number
  score: number
}

const FIELD_SIZE = 360
const HIT_BUFFER = 14

const TARGETS: TargetDot[] = [
  { id: 'small', center: { x: Math.round(FIELD_SIZE * 0.25), y: Math.round(FIELD_SIZE * 0.24) }, radius: 8, score: 3 },
  { id: 'medium', center: { x: Math.round(FIELD_SIZE * 0.74), y: Math.round(FIELD_SIZE * 0.41) }, radius: 14, score: 2 },
  { id: 'large', center: { x: Math.round(FIELD_SIZE * 0.39), y: Math.round(FIELD_SIZE * 0.77) }, radius: 22, score: 1 },
]

const MIN_PULLBACK_PIXELS = 28
const ABSOLUTE_MIN_PULLBACK_PIXELS = 12
const MIN_FLICK_PIXELS = 28
const PULLBACK_PLATEAU_TOLERANCE = 8
const TRUE_FORWARD_START_PIXELS = 8
const MIN_FLICK_SPEED = 0.12
const MAX_FLICK_SPEED = 2.2
const MIN_CONTROL_FACTOR = 0.25

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolveHit(impact: Point): { score: number; target: ThrowResult['target'] } {
  let winner: TargetDot | null = null
  let bestRatio = Number.POSITIVE_INFINITY

  for (const target of TARGETS) {
    const distance = Math.hypot(impact.x - target.center.x, impact.y - target.center.y)
    const ratio = distance / (target.radius + HIT_BUFFER)

    if (ratio <= 1 && ratio < bestRatio) {
      bestRatio = ratio
      winner = target
    }
  }

  if (!winner) {
    return { score: 0, target: 'miss' }
  }

  return { score: winner.score, target: winner.id }
}

function nearestTargetId(impact: Point): 'small' | 'medium' | 'large' {
  let nearest: TargetDot = TARGETS[0]
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const target of TARGETS) {
    const distance = Math.hypot(impact.x - target.center.x, impact.y - target.center.y)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = target
    }
  }

  return nearest.id
}

function DartDemoPage() {
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const throwSerialRef = useRef(0)

  const [dragPoint, setDragPoint] = useState<Point | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [primaryAim, setPrimaryAim] = useState<Point | null>(null)
  const [status, setStatus] = useState('Step 1: Click a primary aim point in the target field.')
  const [throws, setThrows] = useState<ThrowResult[]>([])
  const [pullQualityLabel, setPullQualityLabel] = useState('')
  const gesturePathRef = useRef<GesturePoint[]>([])

  const totalScore = useMemo(() => throws.reduce((sum, result) => sum + result.score, 0), [throws])

  function pointerToField(clientX: number, clientY: number, clampToField: boolean): GesturePoint {
    const rect = fieldRef.current?.getBoundingClientRect()

    if (!rect) {
      return { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2, t: performance.now() }
    }

    const x = clientX - rect.left
    const y = clientY - rect.top

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

    const scored = resolveHit(impact)
    const nearest = nearestTargetId(impact)
    throwSerialRef.current += 1

    const result: ThrowResult = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      serial: throwSerialRef.current,
      score: scored.score,
      target: scored.target,
      nearest,
      impact,
    }

    setThrows((prev) => [result, ...prev].slice(0, 12))
    setStatus(
      scored.score > 0
        ? `Hit ${scored.target.toUpperCase()} target: +${scored.score} points`
        : `Missed all targets. Closest to ${nearest.toUpperCase()}.`,
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

    setPrimaryAim({ x: point.x, y: point.y })
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
              src={baseballFieldTarget}
              alt="Baseball field target"
              draggable={false}
            />

            {primaryAim ? (
              <div
                className="primary-aim-dot"
                style={{ left: `${primaryAim.x}px`, top: `${primaryAim.y}px` }}
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
                style={{ left: `${result.impact.x}px`, top: `${result.impact.y}px` }}
                aria-label={`Throw ${result.serial}: ${result.target}`}
              >
                <span className="impact-index">{result.serial}</span>
              </div>
            ))}
          </div>
        </div>

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
