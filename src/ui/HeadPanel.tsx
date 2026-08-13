import { Scrub } from './Scrub'
import type { Orientation } from './Gizmo'

/**
 * Where the head is pointing, and how big each eye is.
 *
 * These live together because they are the same job: aiming the face. Orientation moves the
 * whole head, eye size trims the two things on it, and in practice you reach for one right
 * after the other.
 */
interface Props {
  orientation: Orientation
  onOrientation: (next: Orientation) => void
  eyes: { left: [number, number]; right: [number, number] }
  onEyes: (next: { left: [number, number]; right: [number, number] }) => void
  linked: boolean
  onLinked: (next: boolean) => void
}

export function HeadPanel({ orientation, onOrientation, eyes, onEyes, linked, onLinked }: Props) {
  const aimed = orientation.x !== 0 || orientation.y !== 0 || orientation.z !== 0

  /** With the link on, whichever eye you touch drags the other with it. */
  const setEye = (side: 'left' | 'right', axis: 0 | 1, value: number) => {
    const next = {
      left: [...eyes.left] as [number, number],
      right: [...eyes.right] as [number, number],
    }
    next[side][axis] = value
    if (linked) next[side === 'left' ? 'right' : 'left'][axis] = value
    onEyes(next)
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Head</h2>
        {aimed && (
          <button className="mini" onClick={() => onOrientation({ x: 0, y: 0, z: 0 })}>
            Face front
          </button>
        )}
      </div>
      <p className="hint">
        Drag the stage to aim it, or the gizmo's rings for one axis at a time. The eyes travel
        around the sphere; the silhouette narrows with them.
      </p>

      <div className="scrubs">
        <Scrub
          label="Turn"
          value={orientation.y}
          onChange={y => onOrientation({ ...orientation, y })}
          min={-180}
          max={180}
          step={1}
          precision={1}
          suffix="°"
        />
        <Scrub
          label="Nod"
          value={orientation.x}
          onChange={x => onOrientation({ ...orientation, x })}
          min={-180}
          max={180}
          step={1}
          precision={1}
          suffix="°"
        />
        <Scrub
          label="Roll"
          value={orientation.z}
          onChange={z => onOrientation({ ...orientation, z })}
          min={-180}
          max={180}
          step={1}
          precision={1}
          suffix="°"
        />
      </div>

      <div className="panel-head spaced">
        <h3>Eyes</h3>
        <button
          className={'mini link' + (linked ? ' on' : '')}
          onClick={() => onLinked(!linked)}
          title={linked ? 'Sizing both eyes together' : 'Sizing each eye on its own'}
          aria-pressed={linked}
        >
          {linked ? '🔗 Linked' : '⛓️‍💥 Separate'}
        </button>
      </div>

      <div className="scrubs two">
        <Scrub
          label="Left w"
          value={eyes.left[0]}
          onChange={v => setEye('left', 0, v)}
          min={0.2}
          max={2.4}
          step={0.01}
          precision={2}
        />
        <Scrub
          label="Right w"
          value={eyes.right[0]}
          onChange={v => setEye('right', 0, v)}
          min={0.2}
          max={2.4}
          step={0.01}
          precision={2}
        />
        <Scrub
          label="Left h"
          value={eyes.left[1]}
          onChange={v => setEye('left', 1, v)}
          min={0.2}
          max={2.4}
          step={0.01}
          precision={2}
        />
        <Scrub
          label="Right h"
          value={eyes.right[1]}
          onChange={v => setEye('right', 1, v)}
          min={0.2}
          max={2.4}
          step={0.01}
          precision={2}
        />
      </div>
    </div>
  )
}
