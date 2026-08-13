import { useRef, useState } from 'react'

interface Props {
  onFile: (file: File) => void
  busy: boolean
}

/** Upload only — picking a starting shape belongs to the shape panel, next to its knobs. */
export function Dropzone({ onFile, busy }: Props) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const take = (files: FileList | null) => {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className="panel">
      <h2>Your artwork</h2>
      <div
        className={'dropzone' + (over ? ' over' : '') + (busy ? ' busy' : '')}
        onDragOver={e => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={e => {
          e.preventDefault()
          setOver(false)
          take(e.dataTransfer.files)
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') input.current?.click()
        }}
      >
        <strong>Drop an SVG</strong>
        <span>or click to choose a file</span>
        <input
          ref={input}
          type="file"
          accept=".svg,image/svg+xml"
          hidden
          onChange={e => {
            take(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}
