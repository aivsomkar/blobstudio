import { useEffect, useMemo, useState } from 'react'
import type { MascotShape } from '../engine/faceEngine'
import { downloadFile, generateComponent, sanitizeName, sequenceKey } from '../export/generate'
import { buildLibrary } from '../export/library'
import { downloadBlob } from '../export/zip'
import { EXPRESSION_COUNT, MASCOT_STATES, MOUTH_STROKE } from '../engine/faceEngine'
import type { CustomState } from '../state/project'

interface Props {
  defaultName: string
  shape: MascotShape
  gradient: [string, string, string]
  eyeColor: string
  lookAround: number
  gaze: { x: number; y: number }
  motion: number
  effects: boolean
  glyphs: boolean
  customStates: CustomState[]
}

export function ExportPanel({
  defaultName,
  shape,
  gradient,
  eyeColor,
  lookAround,
  gaze,
  motion,
  effects,
  glyphs,
  customStates,
}: Props) {
  const [raw, setRaw] = useState(defaultName)
  const [copied, setCopied] = useState(false)
  const [includePng, setIncludePng] = useState(false)
  const [pngSize, setPngSize] = useState(512)
  const [progress, setProgress] = useState<string | null>(null)
  const base = sanitizeName(raw)
  const filename = `${base}Avatar.tsx`

  const source = useMemo(
    () =>
      generateComponent({
        componentName: raw,
        shape,
        gradient,
        eyeColor,
        lookAround,
        gaze,
        motion,
        effects,
        glyphs,
        customStates,
      }),
    [raw, shape, gradient, eyeColor, lookAround, gaze, motion, effects, glyphs, customStates]
  )

  // Test seam: lets an automated run assert against the exact source a user would download.
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, string>).__mascotSource = source
  }, [source])

  const copy = async () => {
    await navigator.clipboard.writeText(source)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="panel">
      <h2>Export</h2>

      <label className="field">
        <span>Component name</span>
        <input value={raw} onChange={e => setRaw(e.target.value)} spellCheck={false} />
      </label>

      <pre className="usage">
        {`import ${base}Avatar from './${base}Avatar'\n\n<${base}Avatar state="thinking" size={160} />` +
          (customStates.length
            ? `\n\n// your states travel with it\n<${base}Avatar sequenceName=${JSON.stringify(
                sequenceKey(customStates[0].name)
              )} />`
            : '')}
      </pre>

      <div className="row">
        <button className="primary" onClick={() => downloadFile(filename, source)}>
          Download {filename}
        </button>
        <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>

      <p className="hint">
        One file, {Math.round(source.length / 1024)} KB, React as the only dependency. Your
        shape, colours and fit are baked in
        {customStates.length
          ? `, along with ${customStates.length} state${customStates.length === 1 ? '' : 's'} you built`
          : ''}
        .
      </p>

      <hr />

      <h2>Whole library</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        The component plus every expression and state as a still SVG, a sprite for plain
        HTML, and a manifest — so it drops into any app, not just a React one.
      </p>

      <label className="toggle">
        <input
          type="checkbox"
          checked={includePng}
          onChange={e => setIncludePng(e.target.checked)}
        />
        <span>Also render PNGs</span>
      </label>
      {includePng && (
        <div className="chips" style={{ marginTop: 8 }}>
          {[256, 512, 1024].map(size => (
            <button
              key={size}
              className={pngSize === size ? 'on' : ''}
              onClick={() => setPngSize(size)}
            >
              {size}px
            </button>
          ))}
        </div>
      )}

      <button
        className="wide primary"
        style={{ marginTop: 10 }}
        disabled={progress !== null}
        onClick={async () => {
          setProgress('starting…')
          try {
            const built = await buildLibrary(
              {
                componentName: raw,
                shape,
                gradient,
                eyeColor,
                lookAround,
                gaze,
                motion,
                effects,
                glyphs,
                customStates,
                includePng,
                pngSize,
                frames: {
                  shape,
                  gradient,
                  eyeColor,
                  lookAround,
                  showMouth: true,
                  mouthStroke: MOUTH_STROKE,
                },
              },
              (doneCount, total) => setProgress(`${doneCount} / ${total}`)
            )
            downloadBlob(built.filename, built.blob)
            setProgress(null)
          } catch {
            setProgress(null)
          }
        }}
      >
        {progress ? `Building ${progress}` : `Download library (.zip)`}
      </button>
      <p className="hint">
        {EXPRESSION_COUNT} expressions + {MASCOT_STATES.length} states
        {includePng ? ` + ${MASCOT_STATES.length} PNGs` : ''}, plus the component, sprite,
        manifest and a README.
      </p>
    </div>
  )
}
