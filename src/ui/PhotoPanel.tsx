import { useState } from 'react'
import {
  SnapshotError,
  snapshotFileName,
  snapshotPng,
  snapshotSvg,
  type SnapshotBackground,
} from '../export/snapshot'
import { downloadBlob } from '../export/zip'
import { downloadFile } from '../export/generate'

interface Props {
  /** Reads the live preview node at click time — it is remounted whenever the shape changes. */
  getSvg: () => SVGSVGElement | null
  name: string
  state: string
  gradient: [string, string, string]
  paused: boolean
  onPaused: (value: boolean) => void
}

const BACKGROUNDS: { id: SnapshotBackground; label: string }[] = [
  { id: 'transparent', label: 'None' },
  { id: 'solid', label: 'Solid' },
  { id: 'linear', label: 'Linear' },
  { id: 'radial', label: 'Radial' },
]

const SIZES = [256, 512, 1024]

export function PhotoPanel({ getSvg, name, state, gradient, paused, onPaused }: Props) {
  const [background, setBackground] = useState<SnapshotBackground>('transparent')
  const [from, setFrom] = useState(gradient[2])
  const [to, setTo] = useState(gradient[0])
  const [size, setSize] = useState(512)
  const [error, setError] = useState<string | null>(null)

  const take = async (extension: 'svg' | 'png') => {
    setError(null)
    const live = getSvg()
    if (!live) {
      setError('Nothing on the stage to photograph yet.')
      return
    }
    try {
      const svg = snapshotSvg(live, {
        background,
        colorFrom: from,
        colorTo: to,
        size,
        title: `${name} — ${state}`,
      })
      const filename = snapshotFileName(name, state, extension)
      if (extension === 'svg') {
        downloadFile(filename, svg)
        return
      }
      downloadBlob(filename, await snapshotPng(svg, size))
    } catch (e) {
      setError(
        e instanceof SnapshotError || e instanceof Error
          ? e.message
          : 'Could not take that photo.'
      )
    }
  }

  return (
    <div className="panel">
      <h2>Photo</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        The frame on the stage right now, exactly as it stands — mid-bounce, mid-orbit,
        confetti still in the air. The library export renders clean catalogue stills instead.
      </p>

      <label className="toggle" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={paused} onChange={e => onPaused(e.target.checked)} />
        <span>Hold the frame</span>
      </label>
      <p className="hint">
        Freezes the stage so you can catch a specific instant rather than gambling on the
        click.
      </p>

      <span className="field-label">Background</span>
      <div className="chips">
        {BACKGROUNDS.map(option => (
          <button
            key={option.id}
            className={background === option.id ? 'on' : ''}
            onClick={() => setBackground(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {background !== 'transparent' && (
        <div className="stops" style={{ marginTop: 10 }}>
          <label>
            <span>{background === 'solid' ? 'Fill' : 'From'}</span>
            <input type="color" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          {background !== 'solid' && (
            <label>
              <span>To</span>
              <input type="color" value={to} onChange={e => setTo(e.target.value)} />
            </label>
          )}
        </div>
      )}

      <span className="field-label" style={{ marginTop: 12 }}>
        Size
      </span>
      <div className="chips">
        {SIZES.map(option => (
          <button
            key={option}
            className={size === option ? 'on' : ''}
            onClick={() => setSize(option)}
          >
            {option}px
          </button>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => void take('png')}>
          Save PNG
        </button>
        <button onClick={() => void take('svg')}>Save SVG</button>
      </div>

      {error && <p className="warning">{error}</p>}
    </div>
  )
}
