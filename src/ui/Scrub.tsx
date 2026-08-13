import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

/**
 * A number you change by dragging its label, the way Figma and Blender do it.
 *
 * A slider spends its width encoding a range, which is exactly what a panel of a dozen
 * values cannot afford — and it caps precision at however many pixels it got. Dragging the
 * label costs one line, has no range to fit, and reads finer the slower you go.
 *
 * The field is still a real input: dragging is the fast path, typing is the exact one.
 */
interface Props {
  label: string
  value: number
  onChange: (value: number) => void
  /** Units per pixel dragged. */
  step?: number
  min?: number
  max?: number
  /** Decimal places shown while not being edited. */
  precision?: number
  /** Trailing unit, e.g. `°` or `u`. */
  suffix?: string
  disabled?: boolean
}

export function Scrub({
  label,
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  precision = 1,
  suffix,
  disabled,
}: Props) {
  const [typing, setTyping] = useState<string | null>(null)
  const drag = useRef<{ x: number; from: number } | null>(null)

  const clamp = (v: number) => Math.min(Math.max(v, min), max)

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (disabled) return
    e.preventDefault()
    drag.current = { x: e.clientX, from: value }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = drag.current
    if (!d) return
    // Shift for fine control — the same modifier every design tool uses for this.
    const scale = e.shiftKey ? 0.15 : 1
    onChange(clamp(d.from + (e.clientX - d.x) * step * scale))
  }

  const end = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!drag.current) return
    drag.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const commit = () => {
    if (typing === null) return
    const parsed = Number(typing.replace(',', '.'))
    if (Number.isFinite(parsed)) onChange(clamp(parsed))
    setTyping(null)
  }

  return (
    <div className={'scrub' + (disabled ? ' disabled' : '')}>
      <span
        className="scrub-label"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        title={disabled ? undefined : 'Drag to change · hold shift for fine control'}
      >
        {label}
      </span>
      <label className="scrub-field">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={typing ?? value.toFixed(precision)}
          onChange={e => setTyping(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setTyping(null)
            // Arrows nudge, because a value you can drag you should also be able to tap.
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              const by = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
              onChange(clamp(value + by))
            }
          }}
        />
        {suffix && <em>{suffix}</em>}
      </label>
    </div>
  )
}
