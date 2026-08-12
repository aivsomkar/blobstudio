import { useEffect, useMemo, useState } from 'react'
import type { MascotShape } from '../engine/faceEngine'
import { downloadFile, generateComponent, sanitizeName } from '../export/generate'

interface Props {
  defaultName: string
  shape: MascotShape
  gradient: [string, string, string]
  eyeColor: string
  lookAround: number
  motion: number
  effects: boolean
  glyphs: boolean
}

export function ExportPanel({
  defaultName,
  shape,
  gradient,
  eyeColor,
  lookAround,
  motion,
  effects,
  glyphs,
}: Props) {
  const [raw, setRaw] = useState(defaultName)
  const [copied, setCopied] = useState(false)
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
        motion,
        effects,
        glyphs,
      }),
    [raw, shape, gradient, eyeColor, lookAround, motion, effects, glyphs]
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
        {`import ${base}Avatar from './${base}Avatar'\n\n<${base}Avatar state="thinking" size={160} />`}
      </pre>

      <div className="row">
        <button className="primary" onClick={() => downloadFile(filename, source)}>
          Download {filename}
        </button>
        <button onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>

      <p className="hint">
        One file, {Math.round(source.length / 1024)} KB, React as the only dependency. Your
        shape, colours and fit are baked in.
      </p>
    </div>
  )
}
