/**
 * A setting you set by dragging a bar.
 *
 * No readout. A number beside a control invites reading it, comparing it, and typing at it,
 * and none of that is what these settings are for — every one of them is judged by looking
 * at the mascot, not at the value. The bar's own position is the only feedback that matters,
 * and it is already on screen.
 *
 * The range still needs to be right, because with nothing written down the ends of the bar
 * are the only thing telling you how far a setting goes.
 */
interface Props {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  disabled?: boolean
}

export function Slider({ label, value, onChange, min, max, step = 1, disabled }: Props) {
  return (
    <label className={'slider' + (disabled ? ' disabled' : '')}>
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={event => onChange(+event.target.value)}
      />
    </label>
  )
}
