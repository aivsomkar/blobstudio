import { useMemo, useRef, useState } from 'react'
import {
  MascotAvatar,
  STATE_GROUPS,
  type MascotShape,
  type MascotState,
} from '../engine/faceEngine'
import { downloadBlob, recordStates, videoSupported } from '../export/video'
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
const HOLD = 1000

export function VideoPanel(props: Props) {
  const { name, shape, gradient, eyeColor, showMouth, lookAround, gaze, motion, effects, glyphs } =
    props

  const states = useMemo(() => Object.values(STATE_GROUPS).flat(), [])
  const supported = useMemo(videoSupported, [])

  const [recording, setRecording] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [background, setBackground] = useState<'black' | 'white'>('black')
  // Which state the off-stage copy is holding. Driven by the recorder, not by the page.
  const [frame, setFrame] = useState<MascotState>(states[0])

  const stage = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)

  const seconds = Math.round((states.length * HOLD) / 1000)
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
        states,
        hold: HOLD,
        size: SIZE,
        fps: FPS,
        background: paper,
        show: setFrame,
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
        <span className="count">{states.length} states · {seconds}s</span>
      </div>
      <p className="hint">
        Every state in order, a second each, recorded from the live mascot. It records in real
        time, so it takes about {seconds} seconds — leave the tab in front while it runs.
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
            shape={shape}
            state={frame}
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
