/**
 * The orientation gizmo: three rings, one per axis, over the stage.
 *
 * It reads as a state display first and a control second. Dragging the stage itself is the
 * fast way to aim the head — the rings are there so you can see *which* way it is aimed
 * once it is, and grab a single axis when you want one.
 */
import { useRef, type PointerEvent as ReactPointerEvent } from 'react'

export interface Orientation {
  x: number
  y: number
  z: number
}

interface Props {
  orientation: Orientation
  onChange: (next: Orientation) => void
  size?: number
}

const AXES = [
  { key: 'x' as const, color: '#4ade80', label: 'X' },
  { key: 'y' as const, color: '#f87171', label: 'Y' },
  { key: 'z' as const, color: '#60a5fa', label: 'Z' },
]

export function Gizmo({ orientation, onChange, size = 92 }: Props) {
  const drag = useRef<{ axis: keyof Orientation; x: number; from: number } | null>(null)
  const r = size / 2
  const ring = r - 8

  const start = (axis: keyof Orientation) => (e: ReactPointerEvent<SVGEllipseElement>) => {
    e.preventDefault()
    e.stopPropagation()
    drag.current = { axis, x: e.clientX, from: orientation[axis] }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const move = (e: ReactPointerEvent<SVGEllipseElement>) => {
    const d = drag.current
    if (!d) return
    onChange({ ...orientation, [d.axis]: wrap(d.from + (e.clientX - d.x) * 0.8) })
  }

  const end = (e: ReactPointerEvent<SVGEllipseElement>) => {
    if (!drag.current) return
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  /*
    One hoop per axis, each at its own attitude so the three never collapse into each other,
    and a bead riding each hoop at that axis's current angle.

    Foreshortening the hoops by the cosine of their angle was the obvious way to show a pose
    — and it made two of them identical circles at rest, which is the pose you look at most.
    The bead shows the angle instead, leaving the hoops free to stay distinguishable.
  */
  const hoops = [
    { axis: AXES[0], rx: ring, ry: ring * 0.4, tilt: 0, angle: orientation.x },
    { axis: AXES[1], rx: ring * 0.4, ry: ring, tilt: 0, angle: orientation.y },
    { axis: AXES[2], rx: ring * 0.74, ry: ring * 0.74, tilt: 0, angle: orientation.z },
  ]

  return (
    <svg className="gizmo" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={r} cy={r} r={r - 1} className="gizmo-shell" />
      {hoops.map(({ axis, rx, ry, angle }) => (
        <g key={axis.key}>
          <ellipse
            cx={r}
            cy={r}
            rx={rx}
            ry={ry}
            stroke={axis.color}
            onPointerDown={start(axis.key)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          >
            <title>{`Drag to rotate ${axis.label} — currently ${angle.toFixed(1)}°`}</title>
          </ellipse>
          <circle
            className="gizmo-bead"
            cx={r + Math.cos(rad(angle - 90)) * rx}
            cy={r + Math.sin(rad(angle - 90)) * ry}
            r={3}
            fill={axis.color}
          />
        </g>
      ))}
    </svg>
  )
}

/** Keeps an angle readable rather than letting it wind up to 3600°. */
export const wrap = (deg: number) => {
  const w = ((deg + 180) % 360 + 360) % 360 - 180
  return Math.round(w * 10) / 10
}

const rad = (deg: number) => (deg * Math.PI) / 180

/**
 * Drag anywhere on the stage to aim the head — horizontal for yaw, vertical for pitch.
 * Returns handlers to spread onto the stage element.
 */
export function useOrbit(orientation: Orientation, onChange: (next: Orientation) => void) {
  const drag = useRef<{ x: number; y: number; from: Orientation } | null>(null)

  return {
    onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
      drag.current = { x: e.clientX, y: e.clientY, from: orientation }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
      const d = drag.current
      if (!d) return
      onChange({
        ...d.from,
        // Vertical drag nods the head, so pulling down looks down.
        x: wrap(d.from.x - (e.clientY - d.y) * 0.35),
        y: wrap(d.from.y + (e.clientX - d.x) * 0.35),
      })
    },
    onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
      if (!drag.current) return
      drag.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    },
    onPointerCancel(e: ReactPointerEvent<HTMLDivElement>) {
      if (!drag.current) return
      drag.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    },
  }
}
