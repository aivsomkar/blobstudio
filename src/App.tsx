import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MascotAvatar,
  MASCOT_STATES,
  STATE_GROUPS,
  EXPRESSION_COUNT,
  DEFAULT_GRADIENT,
  type MascotAvatarHandle,
  type MascotShape,
  type MascotState,
} from './engine/faceEngine'
import { importSvg, SvgImportError, type ImportedShape } from './svg/import'
import { buildSdf, type Sdf } from './fit/sdf'
import { buildClouds, report, solveFit } from './fit/solve'
import { BUILTIN_SHAPES, builtinToSvg } from './shapes/builtin'
import { Dropzone } from './ui/Dropzone'
import { FitPanel } from './ui/FitPanel'
import { ColorPanel } from './ui/ColorPanel'
import { StateGrid } from './ui/StateGrid'
import { ExportPanel } from './ui/ExportPanel'

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
  const [motion, setMotion] = useState(1)
  const [gradient, setGradient] = useState<[string, string, string]>(DEFAULT_GRADIENT)
  const [eyeColor, setEyeColor] = useState('#ffffff')
  const [showMouth, setShowMouth] = useState(true)
  const [useGradient, setUseGradient] = useState(true)
  const avatar = useRef<MascotAvatarHandle>(null)

  /** Import markup, measure it, and place the face. Shared by uploads and builtins. */
  const load = useCallback(
    async (source: string, name: string, isUpload = false) => {
      setBusy(true)
      setError(null)
      try {
        const imported = importSvg(source, name)
        const sdf = await buildSdf(imported.clip || imported.body, imported.fit)
        const fit = solveFit(sdf, lookAround)
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
    void load(builtinToSvg(circle), circle.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    return report(buildClouds(lookAround), mascot.sdf, mascot.anchor)
  }, [mascot, lookAround])

  const setAnchor = (next: Partial<Mascot['anchor']>) =>
    setMascot(m => (m ? { ...m, anchor: { ...m.anchor, ...next } } : m))

  const autoFit = () =>
    setMascot(m => (m ? { ...m, anchor: solveFit(m.sdf, lookAround).anchor } : m))

  const onUpload = async (file: File) => {
    const text = await file.text()
    await load(text, file.name.replace(/\.svg$/i, '') || 'Mascot', true)
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
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}

      <div className="layout">
        <section className="stage">
          <div className="preview">
            {shape && (
              <MascotAvatar
                ref={avatar}
                shape={shape}
                state={state}
                expression={expression}
                lookAround={lookAround}
                motion={motion}
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
          </div>

          {mascot?.imported.warnings.map(w => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
        </section>

        <section className="panels">
          <Dropzone onFile={onUpload} onBuiltin={id => {
            const s = BUILTIN_SHAPES.find(b => b.id === id)!
            void load(builtinToSvg(s), s.name)
          }} busy={busy} />

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

          <ColorPanel
            gradient={gradient}
            onGradient={setGradient}
            eyeColor={eyeColor}
            onEyeColor={setEyeColor}
            useGradient={useGradient}
            onUseGradient={setUseGradient}
          />

          <div className="panel">
            <h2>Expression</h2>
            <div className="chips">
              <button
                className={expression === undefined ? 'on' : ''}
                onClick={() => setExpression(undefined)}
              >
                auto
              </button>
              {Array.from({ length: EXPRESSION_COUNT }, (_, i) => (
                <button
                  key={i}
                  className={
                    (expression === i ? 'on ' : '') +
                    (fitReport?.clipping.includes(i) ? 'clips' : '')
                  }
                  title={fitReport?.clipping.includes(i) ? 'Clips at this size' : undefined}
                  onClick={() => setExpression(i)}
                >
                  {pad(i)}
                </button>
              ))}
            </div>
          </div>

          {shape && (
            <ExportPanel
              key={mascot!.name}
              defaultName={mascot!.name}
              shape={shape}
              gradient={gradient}
              eyeColor={eyeColor}
              lookAround={lookAround}
              motion={motion}
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
          motion={motion}
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

/**
 * Strips the artwork's own paint so the gradient shows through. Uploaded logos usually
 * want to keep their colours, so this is opt-in.
 */
function paintWithGradient(markup: string): string {
  if (markup.includes('{{GRADIENT}}')) return markup
  const stripped = markup.replace(/\s(fill|stroke)="[^"]*"/g, '')
  return `<g fill="{{GRADIENT}}">${stripped}</g>`
}
