interface Props {
  gradient: [string, string, string]
  onGradient: (g: [string, string, string]) => void
  eyeColor: string
  onEyeColor: (c: string) => void
  useGradient: boolean
  onUseGradient: (v: boolean) => void
}

/** A few ready-made ramps, so nobody has to fight three colour pickers to get started. */
const PRESETS: { name: string; stops: [string, string, string] }[] = [
  { name: 'Moss', stops: ['#3FB180', '#009A5A', '#00683B'] },
  { name: 'Ocean', stops: ['#A5D8FF', '#3B82F6', '#1E3A8A'] },
  { name: 'Ember', stops: ['#FFD8A8', '#F97316', '#9A3412'] },
  { name: 'Grape', stops: ['#E9D5FF', '#A855F7', '#581C87'] },
  { name: 'Rose', stops: ['#FECDD3', '#F43F5E', '#881337'] },
  { name: 'Slate', stops: ['#CBD5E1', '#64748B', '#1E293B'] },
]

export function ColorPanel({
  gradient,
  onGradient,
  eyeColor,
  onEyeColor,
  useGradient,
  onUseGradient,
}: Props) {
  const setStop = (i: number, value: string) => {
    const next = [...gradient] as [string, string, string]
    next[i] = value
    onGradient(next)
  }

  return (
    <div className="panel">
      <h2>Colour</h2>

      <label className="toggle">
        <input
          type="checkbox"
          checked={useGradient}
          onChange={e => onUseGradient(e.target.checked)}
        />
        <span>Recolour with a gradient</span>
      </label>
      <p className="hint">
        Off keeps whatever fills and gradients your artwork already had — usually what you
        want for a finished logo.
      </p>

      {useGradient && (
        <>
          <div className="chips">
            {PRESETS.map(p => (
              <button
                key={p.name}
                className={p.stops.join() === gradient.join() ? 'on' : ''}
                onClick={() => onGradient(p.stops)}
                title={p.name}
              >
                <span
                  className="swatch"
                  style={{
                    background: `linear-gradient(135deg, ${p.stops[0]}, ${p.stops[1]}, ${p.stops[2]})`,
                  }}
                />
                {p.name}
              </button>
            ))}
          </div>
          <div className="stops">
            {gradient.map((stop, i) => (
              <label key={i}>
                <input type="color" value={stop} onChange={e => setStop(i, e.target.value)} />
                <span>{['light', 'mid', 'dark'][i]}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="stops">
        <label>
          <input type="color" value={eyeColor} onChange={e => onEyeColor(e.target.value)} />
          <span>face</span>
        </label>
      </div>
    </div>
  )
}
