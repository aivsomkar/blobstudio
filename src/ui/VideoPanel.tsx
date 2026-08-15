import { useMemo, useRef, useState } from 'react'
import {
  EXPRESSION_COUNT,
  MascotAvatar,
  POOLS,
  STATE_GROUPS,
  type MascotAvatarHandle,
  type MascotShape,
} from '../engine/faceEngine'
import { downloadBlob, recordStates, videoSupported, type Step } from '../export/video'
import { sanitizeName } from '../export/generate'

/**
 * A reel of every state, recorded in the browser.
 *
 * The running order is the state groups exactly as the grid lists them — lifecycle,
 * reactions, agent morphs, product cycle — so the video is the page's own contents played
 * end to end, and nobody has to decide what goes in it.
 */
interface Props {
  name: string
  shape: MascotShape
  gradient: [string, string, string]
  eyeColor: string
  showMouth: boolean
  lookAround: number
  gaze: { x: number; y: number }
  motion: number
  effects: boolean
  glyphs: boolean
}

const SIZE = 1080
const FPS = 30
/** How long each state gets, split between the faces it rests on. */
const STATE_HOLD = 760
/** Faces per state. Two is enough to read as alive without turning a reel into a flicker. */
const FACES_PER_STATE = 2
/** How long each face gets in the closing sweep through the full set. */
const EXPRESSION_HOLD = 380

/*
  The running order.

  Left to itself the mascot barely moves here: the engine drifts between faces on its own
  cadence, which runs from 800ms to nine seconds, so inside a second-long hold it almost
  never changes — and 40 states share only 17 resting faces between them, expression 6
  alone covering eight of them. The result was long stretches where consecutive states
  looked identical and nothing on screen moved.

  So the reel pins the face rather than waiting for the engine to pick one. Each state
  cycles through its own pool, which keeps a sleeping mascot showing sleepy faces, and the
  whole expression set plays at the end so every one of them is actually seen.
*/
function buildSteps(): Step[] {
  const steps: Step[] = []

  for (const state of Object.values(STATE_GROUPS).flat()) {
    const pool = POOLS[state]
    const faces = Math.min(FACES_PER_STATE, pool.length)
    for (let i = 0; i < faces; i++) {
      steps.push({ state, expression: pool[i], hold: STATE_HOLD / faces })
    }
  }

  for (let i = 0; i < EXPRESSION_COUNT; i++) {
    steps.push({ state: 'idle', expression: i, hold: EXPRESSION_HOLD })
  }

  return steps
}

export function VideoPanel(props: Props) {
  const { name, shape, gradient, eyeColor, showMouth, lookAround, gaze, motion, effects, glyphs } =
    props

  const steps = useMemo(buildSteps, [])
  const stateCount = useMemo(() => Object.values(STATE_GROUPS).flat().length, [])
  const supported = useMemo(videoSupported, [])

  const [recording, setRecording] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [background, setBackground] = useState<'black' | 'white'>('black')
  // Which pose the off-stage copy is holding. Driven by the recorder, not by the page.
  const [frame, setFrame] = useState<Step>(steps[0])

  const stage = useRef<HTMLDivElement>(null)
  const avatar = useRef<MascotAvatarHandle>(null)
  const abort = useRef<AbortController | null>(null)

  const seconds = Math.round(steps.reduce((total, step) => total + step.hold, 0) / 1000)
  const paper = background === 'black' ? '#000000' : '#ffffff'

  const start = async () => {
    setError(null)
    setProgress(0)
    setRecording(true)
    const controller = new AbortController()
    abort.current = controller
    try {
      // A frame for the off-stage mascot to mount before the first rasterise.
      await new Promise(requestAnimationFrame)
      const { blob, extension } = await recordStates({
        steps,
        size: SIZE,
        fps: FPS,
        background: paper,
        show: setFrame,
        // A blink on entering each state, since the engine's own runs on a cadence far
        // slower than any pose is held for.
        onStep: (_, step) => {
          if (step.expression === POOLS[step.state][0]) avatar.current?.blink()
        },
        getSvg: () => stage.current?.querySelector('svg') ?? null,
        onProgress: setProgress,
        signal: controller.signal,
      })
      if (!controller.signal.aborted) {
        downloadBlob(`${sanitizeName(name)}-states.${extension}`, blob)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recording failed.')
    } finally {
      abort.current = null
      setRecording(false)
      setProgress(0)
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Video</h2>
        <span className="count">
          {stateCount} states · {EXPRESSION_COUNT} faces · {seconds}s
        </span>
      </div>
      <p className="hint">
        Every state in order, each cycling its own faces, then the whole expression set. It
        records in real time, so it takes about {seconds} seconds — leave the tab in front
        while it runs.
      </p>

      <span className="field-label">Background</span>
      <div className="chips">
        {(['black', 'white'] as const).map(option => (
          <button
            key={option}
            className={background === option ? 'on' : ''}
            onClick={() => setBackground(option)}
            disabled={recording}
          >
            {option === 'black' ? 'Black' : 'White'}
          </button>
        ))}
      </div>

      {!supported && (
        <p className="warning">
          This browser has no video recorder, so the download is unavailable here. Chrome, Edge
          and Firefox all support it.
        </p>
      )}

      {recording ? (
        <>
          <div className="progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <div className="row">
            <span className="hint">Recording {Math.round(progress * 100)}%</span>
            <button onClick={() => abort.current?.abort()}>Cancel</button>
          </div>
        </>
      ) : (
        <button className="primary wide" onClick={start} disabled={!supported}>
          Download video
        </button>
      )}

      {error && <p className="warning">{error}</p>}

      {/*
        The copy being filmed. Off to the side rather than hidden: `display: none` and
        `visibility: hidden` both stop it rendering, and a mascot that is not rendering
        cannot be rasterised.
      */}
      {recording && (
        <div className="offstage" ref={stage} aria-hidden="true">
          <MascotAvatar
            ref={avatar}
            shape={shape}
            state={frame.state}
            expression={frame.expression}
            size={SIZE}
            gradient={gradient}
            eyeColor={eyeColor}
            showMouth={showMouth}
            lookAround={lookAround}
            gaze={gaze}
            motion={motion}
            effects={effects}
            glyphs={glyphs}
            title={null}
          />
        </div>
      )}
    </div>
  )
}
