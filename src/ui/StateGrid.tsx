import { MascotAvatar, type MascotShape, type MascotState } from '../engine/faceEngine'

interface Props {
  shape: MascotShape
  gradient: [string, string, string]
  eyeColor: string
  showMouth: boolean
  lookAround: number
  motion: number
  effects: boolean
  glyphs: boolean
  active: MascotState
  onPick: (state: MascotState) => void
  groups: Record<string, MascotState[]>
}

/** Every state, alive at once — the fastest way to judge whether a mascot reads. */
export function StateGrid({
  shape,
  gradient,
  eyeColor,
  showMouth,
  lookAround,
  motion,
  effects,
  glyphs,
  active,
  onPick,
  groups,
}: Props) {
  return (
    <section className="states">
      {Object.entries(groups).map(([group, names]) => (
        <div key={group}>
          <h2>{translate(group)}</h2>
          <div className="grid">
            {names.map(name => (
              <button
                key={name}
                className={'cell' + (name === active ? ' on' : '')}
                onClick={() => onPick(name)}
              >
                <MascotAvatar
                  shape={shape}
                  state={name}
                  gradient={gradient}
                  eyeColor={eyeColor}
                  showMouth={showMouth}
                  lookAround={lookAround}
                  motion={motion}
                  effects={effects}
                  glyphs={glyphs}
                  size="100%"
                  title={name}
                />
                <figcaption>{name}</figcaption>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

/** The engine's groups came from the original French lab. */
const LABELS: Record<string, string> = {
  'Cycle de vie': 'Lifecycle',
  Réactions: 'Reactions',
  'Morphes agent': 'Agent morphs',
  'Cycle produit': 'Product cycle',
}
const translate = (group: string) => LABELS[group] ?? group
