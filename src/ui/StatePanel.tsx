import { useState } from 'react'
import {
  EXPRESSION_COUNT,
  MASCOT_STATES,
  sequenceDuration,
  type MascotState,
} from '../engine/faceEngine'
import {
  createCustomState,
  duplicateCustomState,
  MAX_CUSTOM_STATES,
  MAX_STATE_STEPS,
  toSequence,
  type CustomState,
} from '../state/project'
import { sequenceKey } from '../export/generate'
import { Scrub } from './Scrub'

interface Props {
  states: CustomState[]
  activeId: string | null
  onStates: (next: CustomState[]) => void
  onActive: (id: string | null) => void
  /** Expression thumbnails, so a step is a face rather than a number. */
  renderExpression: (index: number, size: number) => React.ReactNode
  clipping: number[]
}

const TRANSITIONS = ['smooth', 'spring', 'snappy'] as const
const PLAYBACKS: { id: CustomState['playback']; label: string; hint: string }[] = [
  { id: 'loop', label: 'Loop', hint: 'Runs forever, back to the first step.' },
  { id: 'once', label: 'Once', hint: 'Plays through and holds on the last step.' },
  { id: 'pingPong', label: 'Ping-pong', hint: 'Turns around at each end.' },
]

/**
 * Builds a state the lab never authored.
 *
 * The built-in states pick at random from a pool, which is what makes a mood look
 * unscripted and is exactly wrong for a scripted beat. This is the other tool: ordered
 * steps, each with its own hold and feel.
 */
export function StatePanel({
  states,
  activeId,
  onStates,
  onActive,
  renderExpression,
  clipping,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [picking, setPicking] = useState<{ stateId: string; step: number } | null>(null)
  const open = states.find(s => s.id === openId) ?? null

  const update = (id: string, change: (state: CustomState) => CustomState) =>
    onStates(states.map(state => (state.id === id ? change(state) : state)))

  const add = () => {
    const created = createCustomState(`State ${states.length + 1}`)
    onStates([...states, created])
    setOpenId(created.id)
    onActive(created.id)
  }

  const remove = (id: string) => {
    onStates(states.filter(state => state.id !== id))
    if (openId === id) setOpenId(null)
    if (activeId === id) onActive(null)
  }

  const duplicate = (source: CustomState) => {
    const created = duplicateCustomState(source)
    onStates([...states, created])
    setOpenId(created.id)
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Your states</h2>
        {states.length > 0 && (
          <button onClick={() => onActive(null)} className={activeId === null ? 'on' : ''}>
            Built-in
          </button>
        )}
      </div>

      <p className="hint" style={{ marginTop: 0 }}>
        The {MASCOT_STATES.length} built-in states pick from a pool at random, which is what
        makes a mood look unscripted. A state you build here runs its steps in order, so you
        can script a beat — or add the one your app needs that the lab never had.
      </p>

      {states.length === 0 ? (
        <button className="wide primary" style={{ marginTop: 12 }} onClick={add}>
          Build a state
        </button>
      ) : (
        <>
          <div className="state-list">
            {states.map(state => {
              const sequence = toSequence(state)
              return (
                <div
                  key={state.id}
                  className={'state-row' + (activeId === state.id ? ' on' : '')}
                >
                  <button
                    className="state-play"
                    onClick={() => onActive(activeId === state.id ? null : state.id)}
                    title={activeId === state.id ? 'Stop playing this' : 'Play this on the stage'}
                  >
                    {activeId === state.id ? '■' : '▶'}
                  </button>
                  <button className="state-name" onClick={() => setOpenId(state.id)}>
                    <strong>{state.name}</strong>
                    <em>
                      {state.steps.length} step{state.steps.length === 1 ? '' : 's'}
                      {sequence ? ` · ${(sequenceDuration(sequence) / 1000).toFixed(1)}s` : ''}
                    </em>
                  </button>
                  <button onClick={() => duplicate(state)} title="Duplicate">
                    ⧉
                  </button>
                  <button className="danger" onClick={() => remove(state.id)} title="Delete">
                    ×
                  </button>
                </div>
              )
            })}
          </div>
          <button
            className="wide"
            style={{ marginTop: 10 }}
            onClick={add}
            disabled={states.length >= MAX_CUSTOM_STATES}
          >
            {states.length >= MAX_CUSTOM_STATES ? 'That is plenty of states' : 'Build another'}
          </button>
        </>
      )}

      {open && (
        <div className="editor">
          <hr />
          <label className="field">
            <span>Name</span>
            <input
              value={open.name}
              spellCheck={false}
              onChange={e => update(open.id, s => ({ ...s, name: e.target.value }))}
            />
          </label>
          <p className="hint" style={{ margin: '-6px 0 12px' }}>
            Exports as <code>sequenceName=&quot;{sequenceKey(open.name)}&quot;</code> — a slug,
            because it becomes a prop value someone types.
          </p>

          <span className="field-label">Steps</span>
          <div className="steps">
            {open.steps.map((step, index) => (
              <div className="step" key={index}>
                <button
                  className={'step-face' + (clipping.includes(step.expression) ? ' clips' : '')}
                  onClick={() =>
                    setPicking(
                      picking?.stateId === open.id && picking.step === index
                        ? null
                        : { stateId: open.id, step: index }
                    )
                  }
                  title={
                    clipping.includes(step.expression)
                      ? `Expression ${pad(step.expression)} clips this silhouette`
                      : `Expression ${pad(step.expression)} — click to change`
                  }
                >
                  {renderExpression(step.expression, 52)}
                </button>

                <div className="step-knobs">
                  <Scrub
                    label="hold"
                    value={step.holdMs}
                    onChange={value =>
                      update(open.id, s => ({
                        ...s,
                        steps: s.steps.map((x, i) => (i === index ? { ...x, holdMs: value } : x)),
                      }))
                    }
                    min={120}
                    max={20000}
                    step={50}
                    precision={0}
                    suffix="ms"
                  />
                  <Scrub
                    label="morph"
                    value={step.transitionMs}
                    onChange={value =>
                      update(open.id, s => ({
                        ...s,
                        steps: s.steps.map((x, i) =>
                          i === index ? { ...x, transitionMs: value } : x
                        ),
                      }))
                    }
                    min={0}
                    max={3000}
                    step={25}
                    precision={0}
                    suffix="ms"
                  />
                  <div className="chips">
                    {TRANSITIONS.map(transition => (
                      <button
                        key={transition}
                        className={step.transition === transition ? 'on' : ''}
                        onClick={() =>
                          update(open.id, s => ({
                            ...s,
                            steps: s.steps.map((x, i) =>
                              i === index ? { ...x, transition } : x
                            ),
                          }))
                        }
                      >
                        {transition}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="step-order">
                  <button
                    disabled={index === 0}
                    title="Move up"
                    onClick={() => update(open.id, s => ({ ...s, steps: swap(s.steps, index, -1) }))}
                  >
                    ↑
                  </button>
                  <button
                    disabled={index === open.steps.length - 1}
                    title="Move down"
                    onClick={() => update(open.id, s => ({ ...s, steps: swap(s.steps, index, 1) }))}
                  >
                    ↓
                  </button>
                  <button
                    className="danger"
                    disabled={open.steps.length === 1}
                    title={
                      open.steps.length === 1 ? 'A state needs at least one step' : 'Remove step'
                    }
                    onClick={() =>
                      update(open.id, s => ({
                        ...s,
                        steps: s.steps.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {picking?.stateId === open.id && (
            <div className="picker">
              <p className="hint" style={{ marginTop: 0 }}>
                Pick a face for step {picking.step + 1}.
              </p>
              <div className="picker-grid">
                {Array.from({ length: EXPRESSION_COUNT }, (_, i) => (
                  <button
                    key={i}
                    className={
                      (open.steps[picking.step]?.expression === i ? 'on ' : '') +
                      (clipping.includes(i) ? 'clips' : '')
                    }
                    onClick={() => {
                      update(open.id, s => ({
                        ...s,
                        steps: s.steps.map((x, index) =>
                          index === picking.step ? { ...x, expression: i } : x
                        ),
                      }))
                      setPicking(null)
                    }}
                  >
                    {renderExpression(i, 40)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            className="wide"
            style={{ marginTop: 10 }}
            disabled={open.steps.length >= MAX_STATE_STEPS}
            onClick={() =>
              update(open.id, s => ({
                ...s,
                steps: [...s.steps, { ...s.steps[s.steps.length - 1] }],
              }))
            }
          >
            Add step
          </button>

          <span className="field-label">Playback</span>
          <div className="chips">
            {PLAYBACKS.map(option => (
              <button
                key={option.id}
                className={open.playback === option.id ? 'on' : ''}
                title={option.hint}
                onClick={() => update(open.id, s => ({ ...s, playback: option.id }))}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="toggle" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              checked={open.blink.enabled}
              onChange={e =>
                update(open.id, s => ({ ...s, blink: { ...s.blink, enabled: e.target.checked } }))
              }
            />
            <span>Blink</span>
          </label>
          {open.blink.enabled && (
            <div className="scrubs two" style={{ marginTop: 8 }}>
              <Scrub
                label="every"
                value={open.blink.minMs}
                onChange={value =>
                  update(open.id, s => ({
                    ...s,
                    blink: { ...s.blink, minMs: value, maxMs: Math.max(value, s.blink.maxMs) },
                  }))
                }
                min={400}
                max={20000}
                step={100}
                precision={0}
                suffix="ms"
              />
              <Scrub
                label="to"
                value={open.blink.maxMs}
                onChange={value =>
                  update(open.id, s => ({
                    ...s,
                    blink: { ...s.blink, maxMs: Math.max(value, s.blink.minMs) },
                  }))
                }
                min={400}
                max={20000}
                step={100}
                precision={0}
                suffix="ms"
              />
            </div>
          )}

          <label className="field" style={{ marginTop: 12 }}>
            <span>Body motion — borrowed from a built-in state</span>
            <select
              value={open.motion ?? ''}
              onChange={e =>
                update(open.id, s => ({ ...s, motion: e.target.value || null }))
              }
            >
              <option value="">Inherit the current state</option>
              {MASCOT_STATES.map((name: MascotState) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <button className="wide" style={{ marginTop: 12 }} onClick={() => setOpenId(null)}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

function swap<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items]
  const target = index + delta
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
