import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MascotAvatar,
  MASCOT_STATES,
  STATE_GROUPS,
  EXPRESSION_COUNT,
  POOLS,
  type MascotAvatarHandle,
  type MascotShape,
  type MascotState,
} from './engine/faceEngine'
import { importSvg, SvgImportError, type ImportedShape } from './svg/import'
import { buildSdf, type Sdf } from './fit/sdf'
import { buildClouds, report, solveFit } from './fit/solve'
import { BUILTIN_SHAPES, builtinToSvg, type BuiltinShape } from './shapes/builtin'
import {
  clearProject,
  defaultProject,
  loadProject,
  parseProjectFile,
  projectFileName,
  prefersReducedMotion,
  ProjectFileError,
  saveProject,
  serializeProject,
  toSequence,
  type CustomState,
  type Project,
  type SaveResult,
} from './state/project'
import { describeSuppression, suppressedEffect } from './state/effects'
import { downloadFile } from './export/generate'
import { Dropzone } from './ui/Dropzone'
import { GazePad, type Aim } from './ui/GazePad'
import { FitPanel } from './ui/FitPanel'
import { ColorPanel } from './ui/ColorPanel'
import { StateGrid } from './ui/StateGrid'
import { ExportPanel } from './ui/ExportPanel'
import { VideoPanel } from './ui/VideoPanel'
import { PhotoPanel } from './ui/PhotoPanel'
import { ProjectPanel } from './ui/ProjectPanel'
import { ShapePanel } from './ui/ShapePanel'
import { StatePanel } from './ui/StatePanel'
import { HeadPanel } from './ui/HeadPanel'
import { ExpressionGrid } from './ui/ExpressionGrid'
import { FaceThumb, ThumbDefs, useThumbBody } from './ui/FaceThumb'
import type { FrameOptions } from './export/frames'
import { MOUTH_STROKE } from './engine/faceEngine'

export interface Mascot {
  name: string
  imported: ImportedShape
  anchor: { x: number; y: number; scale: number }
  sdf: Sdf
}

type Anchor = Mascot['anchor']

const initial = defaultProject()

export default function App() {
  const [mascot, setMascot] = useState<Mascot | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [state, setState] = useState<MascotState>(initial.state)
  const [expression, setExpression] = useState<number | undefined>(undefined)
  const [lookAround, setLookAround] = useState(initial.lookAround)
  // A touch off-centre by default: dead-centre eyes read as a stare.
  const [gaze, setGaze] = useState<Aim>(initial.gaze)
  /*
    A stored project can carry a motion value from before the machine asked for less, so the
    preference wins on load and the saved number is only a starting point. Dragging the
    slider is still an explicit override, which is the one signal that should beat it.
  */
  const [motion, setMotion] = useState(prefersReducedMotion() ? 0 : initial.motion)
  const [gradient, setGradient] = useState<[string, string, string]>(initial.gradient)
  const [eyeColor, setEyeColor] = useState(initial.eyeColor)
  const [showMouth, setShowMouth] = useState(initial.showMouth)
  const [effects, setEffects] = useState(initial.effects)
  const [glyphs, setGlyphs] = useState(initial.glyphs)
  const [useGradient, setUseGradient] = useState(initial.useGradient)
  // Null once an upload is in play: parameters only mean something for generated shapes.
  const [shapeId, setShapeId] = useState<string | null>(initial.shapeId)
  const [shapeParams, setShapeParams] = useState<Record<string, number>>(initial.shapeParams)
  /** The uploaded file's own text, kept so a project can replay the exact import. */
  const [upload, setUpload] = useState<string | null>(null)
  const [linkedEyes, setLinkedEyes] = useState(initial.linkedEyes)
  const [eyes, setEyes] = useState<{ left: [number, number]; right: [number, number] }>(
    initial.eyes
  )
  const [spring, setSpring] = useState(initial.spring)
  const [dark, setDark] = useState(initial.dark)
  const [life, setLife] = useState(initial.life)
  const [customStates, setCustomStates] = useState<CustomState[]>(initial.customStates)
  const [activeCustomStateId, setActiveCustomStateId] = useState<string | null>(
    initial.activeCustomStateId
  )
  const [paused, setPaused] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveResult | null>(null)
  const avatar = useRef<MascotAvatarHandle>(null)
  const preview = useRef<HTMLDivElement>(null)
  const gazeRef = useRef(gaze)
  gazeRef.current = gaze
  const lookAroundRef = useRef(lookAround)
  lookAroundRef.current = lookAround
  const lifeRef = useRef(life)
  lifeRef.current = life

  /**
   * Import markup, measure it, and place the face. Shared by uploads, builtins and restores.
   * A restore passes its saved anchor; everything else solves for one.
   */
  const load = useCallback(
    async (source: string, name: string, options: { anchor?: Anchor } = {}) => {
      setBusy(true)
      setError(null)
      try {
        const imported = importSvg(source, name)
        const sdf = await buildSdf(imported.clip || imported.body, imported.fit)
        const anchor =
          options.anchor ??
          solveFit(sdf, lookAroundRef.current, undefined, gazeRef.current, lifeRef.current)
            .anchor
        setMascot({ name, imported, anchor, sdf })
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
    []
  )

  /** Pushes a stored project back into the panels. Geometry is loaded separately. */
  const applyProject = useCallback((project: Project) => {
    setState(project.state)
    setExpression(undefined)
    setLookAround(project.lookAround)
    lookAroundRef.current = project.lookAround
    setGaze(project.gaze)
    gazeRef.current = project.gaze
    setMotion(project.motion)
    setSpring(project.spring)
    setGradient(project.gradient)
    setEyeColor(project.eyeColor)
    setUseGradient(project.useGradient)
    setShowMouth(project.showMouth)
    setEffects(project.effects)
    setGlyphs(project.glyphs)
    setDark(project.dark)
    setLife(project.life)
    lifeRef.current = project.life
    setCustomStates(project.customStates)
    setActiveCustomStateId(project.activeCustomStateId)
    setEyes(project.eyes)
    setLinkedEyes(project.linkedEyes)
    setShapeId(project.shapeId)
    setShapeParams(project.shapeParams)
    setUpload(project.upload)
  }, [])

  /** The markup a project describes: its own artwork, or the built-in it names. */
  const sourceFor = useCallback((project: Project) => {
    if (project.upload) return { source: project.upload, name: project.name }
    const shape = BUILTIN_SHAPES.find(item => item.id === project.shapeId) ?? BUILTIN_SHAPES[0]
    return { source: builtinToSvg(shape, project.shapeParams), name: shape.name }
  }, [])

  const openProject = useCallback(
    (project: Project) => {
      applyProject(project)
      const { source, name } = sourceFor(project)
      void load(source, name, { anchor: project.anchor })
    },
    [applyProject, load, sourceFor]
  )

  /*
    Boot. A returning visitor lands on their own mascot; a first-time one lands on the
    circle, so the page is alive before anyone uploads anything. The saved anchor is used
    as-is rather than re-solved — someone who nudged the fit by hand should get their fit
    back, not the solver's opinion of it.
  */
  const ready = useRef(false)
  useEffect(() => {
    const stored = loadProject()
    if (stored) {
      if (stored.uploadDropped) {
        setNotice(
          'Your artwork was too large for browser storage, so the studio opened on a plain shape. Download the project next time to keep it.'
        )
      }
      openProject(stored)
    } else {
      const circle = BUILTIN_SHAPES[0]
      void load(builtinToSvg(circle, circle.defaults), circle.name)
    }
    ready.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Everything the panels can change, as one saveable object. */
  const project = useMemo<Project>(
    () => ({
      version: initial.version,
      name: mascot?.name ?? initial.name,
      upload,
      shapeId,
      shapeParams,
      anchor: mascot?.anchor ?? initial.anchor,
      gaze,
      lookAround,
      motion,
      spring,
      eyes,
      linkedEyes,
      gradient,
      eyeColor,
      useGradient,
      showMouth,
      effects,
      glyphs,
      dark,
      life,
      state,
      customStates,
      activeCustomStateId,
    }),
    [
      mascot,
      upload,
      shapeId,
      shapeParams,
      gaze,
      lookAround,
      motion,
      spring,
      eyes,
      linkedEyes,
      gradient,
      eyeColor,
      useGradient,
      showMouth,
      effects,
      glyphs,
      dark,
      life,
      state,
      customStates,
      activeCustomStateId,
    ]
  )

  /*
    Autosave, debounced. Held until the boot restore has run, or the first render would
    overwrite a stored project with the defaults it is about to replace.
  */
  useEffect(() => {
    if (!ready.current || !mascot) return
    const timer = window.setTimeout(() => setSaveStatus(saveProject(project)), 400)
    return () => window.clearTimeout(timer)
  }, [project, mascot])

  const pickShape = (shape: BuiltinShape) => {
    setShapeId(shape.id)
    setShapeParams(shape.defaults)
    setUpload(null)
    // The built-ins are plain silhouettes drawn to take the gradient.
    setUseGradient(true)
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

  /* Shared by the expression picker and the state builder — see FaceThumb. */
  const thumbBody = useThumbBody(shape)
  const thumbOptions = useMemo<FrameOptions | null>(
    () =>
      shape
        ? { shape, gradient, eyeColor, lookAround, showMouth, mouthStroke: MOUTH_STROKE }
        : null,
    [shape, gradient, eyeColor, lookAround, showMouth]
  )

  /*
    A custom state is played by handing the engine its resolved sequence. Selecting one
    also clears any pinned expression, because pinning is the one thing that stops a
    sequence dead — the two controls contradict each other by design.
  */
  const activeCustomState = useMemo(
    () => customStates.find(item => item.id === activeCustomStateId) ?? null,
    [customStates, activeCustomStateId]
  )
  const sequence = useMemo(
    () => (activeCustomState ? toSequence(activeCustomState) : null),
    [activeCustomState]
  )

  /*
    The toggles persist now, so a state that draws comets can sit there drawing nothing with
    no visible reason why. Only reported for the built-in states: a custom state plays
    expressions, and its body motion is borrowed rather than its own.
  */
  const suppressed = useMemo(
    () => (activeCustomState ? null : suppressedEffect(state, { effects, glyphs, motion })),
    [activeCustomState, state, effects, glyphs, motion]
  )

  /** Live clipping report — recomputed whenever the placement or gaze changes. */
  const fitReport = useMemo(() => {
    if (!mascot) return null
    return report(buildClouds(lookAround, undefined, gaze, life), mascot.sdf, mascot.anchor)
  }, [mascot, lookAround, gaze, life])

  const setAnchor = (next: Partial<Anchor>) =>
    setMascot(m => (m ? { ...m, anchor: { ...m.anchor, ...next } } : m))

  const autoFit = () =>
    setMascot(m =>
      m ? { ...m, anchor: solveFit(m.sdf, lookAround, undefined, gaze, life).anchor } : m
    )

  const onUpload = async (file: File) => {
    const text = await file.text()
    const name = file.name.replace(/\.svg$/i, '') || 'Mascot'
    setShapeId(null)
    setUpload(text)
    // Someone uploading finished artwork wants to keep its colours.
    setUseGradient(false)
    setNotice(null)
    await load(text, name)
  }

  const onOpenProject = async (file: File) => {
    setNotice(null)
    try {
      openProject(parseProjectFile(await file.text()))
    } catch (e) {
      setError(
        e instanceof ProjectFileError || e instanceof Error
          ? e.message
          : 'Could not read that project.'
      )
    }
  }

  const onResetProject = () => {
    clearProject()
    setNotice(null)
    setError(null)
    setSaveStatus(null)
    openProject(defaultProject())
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
      {notice && <div className="banner">{notice}</div>}

      <div className="layout">
        <section className="stage">
          <div className={'preview' + (dark ? ' dark' : '')} ref={preview}>
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
                paused={paused}
                sequence={sequence}
                life={life}
                size="100%"
                title={`${mascot?.name} preview`}
              />
            )}
            {busy && <div className="busy">fitting…</div>}
          </div>

          <div className="stage-meta">
            <strong>{activeCustomState ? activeCustomState.name : state}</strong>
            <span>
              {activeCustomState
                ? `${activeCustomState.steps.length} steps · ${activeCustomState.playback}`
                : expression === undefined
                  ? 'auto'
                  : `expression ${pad(expression)}`}
            </span>
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
            <button
              className={life ? 'on' : ''}
              onClick={() => setLife(v => !v)}
              title="Micro-saccades — small eye movements between expression changes"
            >
              Life
            </button>
            <button
              className={paused ? 'on' : ''}
              onClick={() => setPaused(v => !v)}
              title="Freeze the stage on this frame"
            >
              Hold
            </button>
          </div>

          {suppressed && (
            <p className="suppressed">
              <span>{describeSuppression(suppressed)}</span>
              <button
                onClick={() => {
                  // Fixing one reason is not always enough, so clear all of them.
                  for (const reason of suppressed.reasons) {
                    if (reason === 'effects') setEffects(true)
                    if (reason === 'glyphs') setGlyphs(true)
                    if (reason === 'motion') setMotion(1)
                  }
                }}
              >
                Show it
              </button>
            </p>
          )}

          {mascot?.imported.warnings.map(w => (
            <p className="warning" key={w}>
              {w}
            </p>
          ))}
        </section>

        <section className="panels">
          {shape && <ThumbDefs shape={shape} gradient={gradient} />}

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
            <StatePanel
              states={customStates}
              activeId={activeCustomStateId}
              onStates={setCustomStates}
              onActive={id => {
                setActiveCustomStateId(id)
                setExpression(undefined)
              }}
              renderExpression={(index, size) => (
                <FaceThumb
                  body={thumbBody}
                  shape={shape}
                  options={thumbOptions!}
                  expression={index}
                  size={size}
                />
              )}
              clipping={fitReport?.clipping ?? []}
            />
          )}

          {shape && (
            <PhotoPanel
              getSvg={() => preview.current?.querySelector('svg') ?? null}
              name={mascot!.name}
              state={state}
              gradient={gradient}
              paused={paused}
              onPaused={setPaused}
            />
          )}

          {shape && (
            <VideoPanel
              name={mascot!.name}
              shape={shape}
              gradient={gradient}
              eyeColor={eyeColor}
              showMouth={showMouth}
              lookAround={lookAround}
              gaze={gaze}
              motion={motion}
              effects={effects}
              glyphs={glyphs}
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
              customStates={customStates}
            />
          )}

          <ProjectPanel
            status={saveStatus}
            onSave={() =>
              downloadFile(projectFileName(project.name), serializeProject(project))
            }
            onOpen={file => void onOpenProject(file)}
            onReset={onResetProject}
          />
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
