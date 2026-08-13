import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MascotAvatar,
  MASCOT_STATES,
  STATE_GROUPS,
  EXPRESSION_COUNT,
  DEFAULT_GRADIENT,
  POOLS,
  type MascotAvatarHandle,
  type MascotShape,
  type MascotState,
} from './engine/faceEngine'
import { importSvg, SvgImportError, type ImportedShape } from './svg/import'
import { buildSdf, type Sdf } from './fit/sdf'
import { buildClouds, report, solveFit } from './fit/solve'
import { BUILTIN_SHAPES, builtinToSvg, type BuiltinShape } from './shapes/builtin'
import { Dropzone } from './ui/Dropzone'
import { GazePad, type Aim } from './ui/GazePad'
import { FitPanel } from './ui/FitPanel'
import { ColorPanel } from './ui/ColorPanel'
import { StateGrid } from './ui/StateGrid'
import { ExportPanel } from './ui/ExportPanel'
import { ShapePanel } from './ui/ShapePanel'
import { HeadPanel } from './ui/HeadPanel'
import { ExpressionGrid } from './ui/ExpressionGrid'
import { MOUTH_STROKE } from './engine/faceEngine'

export interface Mascot {
  name: string
  imported: ImportedShape
  anchor: { x: number; y: number; scale: number }
  sdf: Sdf
}

export default function App() {
  const [mascot, setMascot] = useState<Mascot | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<MascotState>('idle')
  const [expression, setExpression] = useState<number | undefined>(undefined)
  const [lookAround, setLookAround] = useState(0.35)
  // A touch off-centre by default: dead-centre eyes read as a stare.
  const [gaze, setGaze] = useState<Aim>({ x: 0.22, y: 0 })
  const [motion, setMotion] = useState(1)
  const [gradient, setGradient] = useState<[string, string, string]>(DEFAULT_GRADIENT)
  const [eyeColor, setEyeColor] = useState('#ffffff')
  const [showMouth, setShowMouth] = useState(true)
  const [effects, setEffects] = useState(true)
  const [glyphs, setGlyphs] = useState(true)
  const [useGradient, setUseGradient] = useState(true)
  // Null once an upload is in play: parameters only mean something for generated shapes.
  const [shapeId, setShapeId] = useState<string | null>(BUILTIN_SHAPES[0].id)
  const [shapeParams, setShapeParams] = useState<Record<string, number>>(
    BUILTIN_SHAPES[0].defaults
  )
  const [linkedEyes, setLinkedEyes] = useState(true)
  const [eyes, setEyes] = useState<{ left: [number, number]; right: [number, number] }>({
    left: [1, 1],
    right: [1, 1],
  })
  const [spring, setSpring] = useState(7)
  const [dark, setDark] = useState(true)
  const avatar = useRef<MascotAvatarHandle>(null)
  const gazeRef = useRef(gaze)
  gazeRef.current = gaze

  /** Import markup, measure it, and place the face. Shared by uploads and builtins. */
  const load = useCallback(
    async (source: string, name: string, isUpload = false) => {
      setBusy(true)
      setError(null)
      try {
        const imported = importSvg(source, name)
        const sdf = await buildSdf(imported.clip || imported.body, imported.fit)
        const fit = solveFit(sdf, lookAround, undefined, gazeRef.current)
        setMascot({ name, imported, anchor: fit.anchor, sdf })
        // Someone uploading finished artwork wants to keep its colours. The built-ins are
        // plain silhouettes drawn to take the gradient, so they start recoloured.
        setUseGradient(!isUpload)
      } catch (e) {
        setError(
          e instanceof SvgImportError || e instanceof Error
            ? e.message
            : 'Something went wrong reading that file.'
        )
      } finally {
        setBusy(false)
      }
    },
    [lookAround]
  )

  // Open on the circle, so the page is alive before anyone uploads anything.
  useEffect(() => {
    const circle = BUILTIN_SHAPES[0]
    void load(builtinToSvg(circle, circle.defaults), circle.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pickShape = (shape: BuiltinShape) => {
    setShapeId(shape.id)
    setShapeParams(shape.defaults)
    void load(builtinToSvg(shape, shape.defaults), shape.name)
  }

  /*
    Every parameter change re-imports and re-solves. That sounds heavy and isn't: the solver
    runs on a 256² distance field and finishes inside a frame, so dragging a width reads as
    the shape moving rather than as a rebuild. Debounced anyway so a fast drag does not
    queue a rasterise per pixel.
  */
  const paramTimer = useRef<number | null>(null)
  const setParam = (key: string, value: number) => {
    const shape = BUILTIN_SHAPES.find(b => b.id === shapeId)
    if (!shape) return
    const next = { ...shapeParams, [key]: value }
    setShapeParams(next)
    if (paramTimer.current !== null) window.clearTimeout(paramTimer.current)
    paramTimer.current = window.setTimeout(() => {
      void load(builtinToSvg(shape, next), shape.name)
    }, 90)
  }

  const shape: MascotShape | null = useMemo(() => {
    if (!mascot) return null
    const body = useGradient ? paintWithGradient(mascot.imported.body) : mascot.imported.body
    return {
      name: mascot.name,
      fit: mascot.imported.fit,
      body,
      clip: mascot.imported.clip,
      anchor: mascot.anchor,
    }
  }, [mascot, useGradient])

  /** Live clipping report — recomputed whenever the placement or gaze changes. */
  const fitReport = useMemo(() => {
    if (!mascot) return null
    return report(buildClouds(lookAround, undefined, gaze), mascot.sdf, mascot.anchor)
  }, [mascot, lookAround, gaze])

  const setAnchor = (next: Partial<Mascot['anchor']>) =>
    setMascot(m => (m ? { ...m, anchor: { ...m.anchor, ...next } } : m))

  const autoFit = () =>
    setMascot(m =>
      m ? { ...m, anchor: solveFit(m.sdf, lookAround, undefined, gaze).anchor } : m
    )

  const onUpload = async (file: File) => {
    const text = await file.text()
    setShapeId(null)
    await load(text, file.name.replace(/\.svg$/i, '') || 'Mascot', true)
  }

  /** Jump to a random face from this state's own pool, the way the engine would. */
  const randomExpression = () => {
    const pool = POOLS[state]
    const options = pool.filter(i => i !== expression)
    setExpression((options.length ? options : pool)[Math.floor(Math.random() * (options.length || pool.length))])
  }

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <h1>Blob Studio</h1>
          <p>
            Drop in an SVG. It gets eyes, a mouth, {EXPRESSION_COUNT} expressions and{' '}
            {MASCOT_STATES.length} moods — then leaves as a React component. Everything runs in
            your browser; nothing is uploaded.
          </p>
        </div>
        <nav className="masthead-links">
          <a href="https://supamaus.com" target="_blank" rel="noopener noreferrer">
            SupaMaus
            <Outbound />
          </a>
          <a
            href="https://github.com/milind-soni/OpenMausBot"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenMausBot
            <Outbound />
          </a>
        </nav>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <div className="layout">
        <section className="stage">
          <div className={'preview' + (dark ? ' dark' : '')}>
            {shape && (
              <MascotAvatar
                ref={avatar}
                shape={shape}
                state={state}
                expression={expression}
                lookAround={lookAround}
                gaze={gaze}
                eyeScale={eyes}
                spring={spring}
                motion={motion}
                effects={effects}
                glyphs={glyphs}
                gradient={gradient}
                eyeColor={eyeColor}
                showMouth={showMouth}
                size="100%"
                title={`${mascot?.name} preview`}
              />
            )}
            {busy && <div className="busy">fitting…</div>}
          </div>

          <div className="stage-meta">
            <strong>{state}</strong>
            <span>{expression === undefined ? 'auto' : `expression ${pad(expression)}`}</span>
          </div>

          <div className="row">
            <button onClick={() => avatar.current?.blink()}>Blink</button>
            <button onClick={() => avatar.current?.spin()}>Spin</button>
            <button
              className={showMouth ? 'on' : ''}
              onClick={() => setShowMouth(v => !v)}
            >
              Mouth
            </button>
            <button
              className={effects ? 'on' : ''}
              onClick={() => setEffects(v => !v)}
              title="Confetti and motion ribbons"
            >
              Effects
            </button>
            <button
              className={glyphs ? 'on' : ''}
              onClick={() => setGlyphs(v => !v)}
              title="Let alerting and confused replace the mascot with a symbol"
            >
              Glyphs
            </button>
            <button
              className={dark ? 'on' : ''}
              onClick={() => setDark(v => !v)}
              title="Dark stage — a mascot reads differently on each, and both ship"
            >
              Dark
            </button>
          </div>

          {mascot?.imported.warnings.map(w => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
        </section>

        <section className="panels">
          <Dropzone onFile={onUpload} busy={busy} />

          <ShapePanel
            shapeId={shapeId}
            params={shapeParams}
            onPick={pickShape}
            onParam={setParam}
            busy={busy}
          />

          <HeadPanel
            eyes={eyes}
            onEyes={setEyes}
            linked={linkedEyes}
            onLinked={setLinkedEyes}
          />

          {mascot && (
            <FitPanel
              anchor={mascot.anchor}
              onChange={setAnchor}
              onAuto={autoFit}
              lookAround={lookAround}
              onLookAround={setLookAround}
              motion={motion}
              onMotion={setMotion}
              clipping={fitReport?.clipping ?? []}
              clearance={fitReport?.clearance ?? 0}
              total={EXPRESSION_COUNT}
            />
          )}

          <GazePad gaze={gaze} onChange={setGaze} />

          <ColorPanel
            gradient={gradient}
            onGradient={setGradient}
            eyeColor={eyeColor}
            onEyeColor={setEyeColor}
            useGradient={useGradient}
            onUseGradient={setUseGradient}
          />

          {shape && (
            <ExpressionGrid
              shape={shape}
              gradient={gradient}
              eyeColor={eyeColor}
              showMouth={showMouth}
              lookAround={lookAround}
              mouthStroke={MOUTH_STROKE}
              expression={expression}
              onExpression={setExpression}
              clipping={fitReport?.clipping ?? []}
              spring={spring}
              onSpring={setSpring}
              onBlink={() => avatar.current?.blink()}
              onRandom={randomExpression}
            />
          )}

          {shape && (
            <ExportPanel
              key={mascot!.name}
              defaultName={mascot!.name}
              shape={shape}
              gradient={gradient}
              eyeColor={eyeColor}
              lookAround={lookAround}
              gaze={gaze}
              motion={motion}
              effects={effects}
              glyphs={glyphs}
            />
          )}
        </section>
      </div>

      {shape && (
        <StateGrid
          shape={shape}
          gradient={gradient}
          eyeColor={eyeColor}
          showMouth={showMouth}
          lookAround={lookAround}
          gaze={gaze}
          motion={motion}
          effects={effects}
          glyphs={glyphs}
          active={state}
          onPick={s => {
            setState(s)
            setExpression(undefined)
          }}
          groups={STATE_GROUPS}
        />
      )}

      <footer>
        <span>
          Built on the GrokBot face engine. {EXPRESSION_COUNT} expressions ×{' '}
          {MASCOT_STATES.length} states, fitted to your shape by a distance-field solver.
        </span>
      </footer>
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Marks a link as leaving the page, so the two in the masthead don't read as tabs. */
const Outbound = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path d="M2.5 7.5 7.5 2.5M3.6 2.5h3.9v3.9" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * Strips the artwork's own paint so the gradient shows through. Uploaded logos usually
 * want to keep their colours, so this is opt-in.
 */
function paintWithGradient(markup: string): string {
  if (markup.includes('{{GRADIENT}}')) return markup
  const stripped = markup.replace(/\s(fill|stroke)="[^"]*"/g, '')
  return `<g fill="{{GRADIENT}}">${stripped}</g>`
}
