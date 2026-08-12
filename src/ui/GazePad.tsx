import { useRef } from 'react'

export interface Aim {
  x: number
  y: number
}

interface Props {
  gaze: Aim
  onChange: (next: Aim) => void
}

/** Where the eyes point, as a place rather than two numbers. */
const PRESETS: { label: string; aim: Aim }[] = [
  { label: 'left', aim: { x: -0.55, y: 0 } },
  { label: 'centre', aim: { x: 0, y: 0 } },
  { label: 'right', aim: { x: 0.55, y: 0 } },
  { label: 'up', aim: { x: 0, y: -0.6 } },
  { label: 'down', aim: { x: 0, y: 0.6 } },
]

const clamp = (v: number) => Math.max(-1, Math.min(1, v))

export function GazePad({ gaze, onChange }: Props) {
  const pad = useRef<HTMLDivElement>(null)

  const aimAt = (clientX: number, clientY: number) => {
    const box = pad.current?.getBoundingClientRect()
    if (!box) return
    onChange({
      x: clamp(((clientX - box.left) / box.width) * 2 - 1),
      y: clamp(((clientY - box.top) / box.height) * 2 - 1),
    })
  }

  const nudge = (dx: number, dy: number) =>
    onChange({ x: clamp(gaze.x + dx), y: clamp(gaze.y + dy) })

  return (
    <div className="panel">
      <h2>Gaze</h2>

      <div className="gaze-row">
        <div
          ref={pad}
          className="gaze-pad"
          role="application"
          aria-label="Eye direction. Drag, or use the arrow keys."
          tabIndex={0}
          onPointerDown={e => {
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            aimAt(e.clientX, e.clientY)
          }}
          onPointerMove={e => {
            if (e.buttons === 1) aimAt(e.clientX, e.clientY)
          }}
          onKeyDown={e => {
            const step = e.shiftKey ? 0.2 : 0.05
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            }
            const move = moves[e.key]
            if (move) {
              e.preventDefault()
              nudge(move[0], move[1])
            }
            if (e.key === '0') onChange({ x: 0, y: 0 })
          }}
        >
          <span className="gaze-cross" />
          <span
            className="gaze-dot"
            style={{
              left: `${((gaze.x + 1) / 2) * 100}%`,
              top: `${((gaze.y + 1) / 2) * 100}%`,
            }}
          />
        </div>

        <div className="gaze-side">
          <div className="chips">
            {PRESETS.map(preset => (
              <button
                key={preset.label}
                className={
                  Math.abs(gaze.x - preset.aim.x) < 0.02 && Math.abs(gaze.y - preset.aim.y) < 0.02
                    ? 'on'
                    : ''
                }
                onClick={() => onChange(preset.aim)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Where the eyes rest, on top of whatever each expression does. Drag the pad or use
            the arrow keys.
          </p>
          <p className="gaze-readout">
            x {gaze.x.toFixed(2)} · y {gaze.y.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  )
}
