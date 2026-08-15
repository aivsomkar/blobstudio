import { useRef, useState } from 'react'
import type { SaveResult } from '../state/project'

interface Props {
  status: SaveResult | null
  onSave: () => void
  onOpen: (file: File) => void
  onReset: () => void
}

/**
 * Autosave is the normal path, so this panel is mostly about the two things autosave
 * cannot do: move a mascot to another machine, and survive someone clearing site data.
 */
export function ProjectPanel({ status, onSave, onOpen, onReset }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="panel">
      <h2>Project</h2>
      <p className="hint">
        Your shape, fit, colours and settings save to this browser as you work. Download the
        project to move it somewhere else — or to keep it, since clearing site data takes the
        stored copy with it.
      </p>

      {status === 'saved-without-upload' && (
        <p className="warning">
          Everything except the artwork is saved — that SVG is too large for browser storage.
          Download the project to keep it.
        </p>
      )}
      {status === 'failed' && (
        <p className="warning">
          Browser storage is unavailable, so nothing is being saved automatically. Download
          the project before you close this tab.
        </p>
      )}

      <div className="row">
        <button className="primary" onClick={onSave}>
          Download project
        </button>
        <button onClick={() => input.current?.click()}>Open project</button>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={e => {
          const file = e.target.files?.[0]
          // Cleared so re-opening the same file fires change again.
          e.target.value = ''
          if (file) onOpen(file)
        }}
      />

      {confirming ? (
        <div className="row" style={{ marginTop: 10 }}>
          <button
            className="danger"
            onClick={() => {
              setConfirming(false)
              onReset()
            }}
          >
            Discard and start over
          </button>
          <button onClick={() => setConfirming(false)}>Keep it</button>
        </div>
      ) : (
        <button className="wide" style={{ marginTop: 10 }} onClick={() => setConfirming(true)}>
          Start over
        </button>
      )}
    </div>
  )
}
