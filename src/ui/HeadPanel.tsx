import { Slider } from './Slider'

/**
 * Eye sizing.
 *
 * The two eyes are usually the same size and occasionally deliberately are not — a lopsided
 * pair reads as a character rather than a template — so the link is on by default and the
 * moment you turn it off both halves are already there.
 */
interface Props {
  eyes: { left: [number, number]; right: [number, number] }
  onEyes: (next: { left: [number, number]; right: [number, number] }) => void
  linked: boolean
  onLinked: (next: boolean) => void
}

export function HeadPanel({ eyes, onEyes, linked, onLinked }: Props) {
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
        <h2>Eyes</h2>
        <button
          className={'mini link' + (linked ? ' on' : '')}
          onClick={() => onLinked(!linked)}
          title={linked ? 'Sizing both eyes together' : 'Sizing each eye on its own'}
          aria-pressed={linked}
        >
          {linked ? '🔗 Linked' : '⛓️‍💥 Separate'}
        </button>
      </div>

      <div className="sliders two">
        <Slider label="Left w" value={eyes.left[0]} onChange={v => setEye('left', 0, v)} min={0.2} max={2.4} step={0.01} />
        <Slider label="Right w" value={eyes.right[0]} onChange={v => setEye('right', 0, v)} min={0.2} max={2.4} step={0.01} />
        <Slider label="Left h" value={eyes.left[1]} onChange={v => setEye('left', 1, v)} min={0.2} max={2.4} step={0.01} />
        <Slider label="Right h" value={eyes.right[1]} onChange={v => setEye('right', 1, v)} min={0.2} max={2.4} step={0.01} />
      </div>
    </div>
  )
}
