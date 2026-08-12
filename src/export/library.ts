/**
 * Assembles the whole mascot as a downloadable package.
 *
 * The point is that it should be usable however the recipient's app is built — the animated
 * React component for a React app, flat SVGs for a designer, a sprite for plain HTML, PNGs
 * for anything that can't take vectors. Plus a manifest so it can be wired up
 * programmatically, and a README so none of it needs explaining.
 */

import { generateComponent, sanitizeName, type ExportOptions } from './generate'
import {
  frameSvg,
  spriteSvg,
  stateIndex,
  svgToPng,
  type FrameOptions,
} from './frames'
import { EXPRESSION_COUNT, MASCOT_STATES, POOLS, STATE_GROUPS } from '../engine/faceEngine'
import { createZip, type ZipEntry } from './zip'

export interface LibraryOptions extends ExportOptions {
  frames: FrameOptions
  /** Also rasterise every state to PNG. Slower, so it is opt-in. */
  includePng: boolean
  pngSize: number
}

const encoder = new TextEncoder()
const text = (name: string, body: string): ZipEntry => ({ name, data: encoder.encode(body) })

export async function buildLibrary(
  options: LibraryOptions,
  onProgress?: (done: number, total: number) => void
): Promise<{ blob: Blob; filename: string; fileCount: number }> {
  const base = sanitizeName(options.componentName)
  const root = `${base}Mascot`
  const entries: ZipEntry[] = []

  const pngCount = options.includePng ? MASCOT_STATES.length : 0
  const total = EXPRESSION_COUNT + MASCOT_STATES.length + pngCount + 4
  let done = 0
  const tick = () => onProgress?.(++done, total)

  // The animated component.
  entries.push(text(`${root}/${base}Avatar.tsx`, generateComponent(options)))
  tick()

  // Every expression, frozen.
  for (let i = 0; i < EXPRESSION_COUNT; i++) {
    const name = String(i).padStart(2, '0')
    entries.push(
      text(
        `${root}/svg/expressions/expression-${name}.svg`,
        frameSvg(i, options.frames, `${base} expression ${name}`)
      )
    )
    tick()
  }

  // Every state, at its resting face.
  for (const state of MASCOT_STATES) {
    entries.push(
      text(
        `${root}/svg/states/${state}.svg`,
        frameSvg(POOLS[state][0], options.frames, `${base} ${state}`)
      )
    )
    tick()
  }

  // One sprite for plain HTML.
  entries.push(text(`${root}/svg/sprite.svg`, spriteSvg(options.frames)))
  tick()

  if (options.includePng) {
    for (const state of MASCOT_STATES) {
      const svg = frameSvg(POOLS[state][0], options.frames, `${base} ${state}`)
      entries.push({
        name: `${root}/png/${state}.png`,
        data: await svgToPng(svg, options.pngSize),
      })
      tick()
    }
  }

  entries.push(text(`${root}/manifest.json`, manifest(base, options)))
  tick()
  entries.push(text(`${root}/README.md`, readme(base, options)))
  tick()

  return {
    blob: createZip(entries),
    filename: `${root}.zip`,
    fileCount: entries.length,
  }
}

function manifest(base: string, options: LibraryOptions): string {
  return JSON.stringify(
    {
      name: base,
      shape: options.shape.name,
      expressions: EXPRESSION_COUNT,
      states: MASCOT_STATES.length,
      groups: STATE_GROUPS,
      restingExpression: stateIndex(),
      look: {
        gradient: options.gradient,
        eyeColor: options.eyeColor,
        lookAround: options.lookAround,
        gaze: options.gaze,
        motion: options.motion,
        effects: options.effects,
        glyphs: options.glyphs,
      },
      anchor: options.shape.anchor,
      generator: 'Blob Studio',
    },
    null,
    2
  )
}

function readme(base: string, options: LibraryOptions): string {
  const png = options.includePng
    ? `\n\`png/\` — every state at ${options.pngSize}×${options.pngSize}, for places that can't take\nvectors: Slack emoji, README badges, app icons.\n`
    : ''
  return `# ${base}

An animated mascot with ${EXPRESSION_COUNT} expressions and ${MASCOT_STATES.length} states, built on the
"${options.shape.name}" silhouette. Made with Blob Studio.

## What's in here

\`\`\`
${base}Avatar.tsx        the animated component — React is its only dependency
svg/states/*.svg      ${MASCOT_STATES.length} still frames, one per state
svg/expressions/*.svg  ${EXPRESSION_COUNT} still frames, one per expression
svg/sprite.svg        every state as a <symbol>, for plain HTML
manifest.json         states, groups, and which expression each rests on
\`\`\`
${png}
## Using it in React

Copy \`${base}Avatar.tsx\` into your project. Nothing else is needed.

\`\`\`tsx
import ${base}Avatar from './${base}Avatar'

<${base}Avatar state="thinking" size={160} />
\`\`\`

Set \`state\` and it animates itself: it picks that state's resting face, drifts through the
state's expression pool on its own cadence, blinks on its own rhythm, and moves its body to
match. \`${base.toUpperCase()}_STATES\` exports the full list.

Useful props: \`expression\` pins one face, \`lookAround\` controls how far the eyes drift from
centre (0 = always facing you), \`motion\` scales the body animation, \`effects\` and \`glyphs\`
switch off confetti/ribbons and the symbol morphs, \`gaze\` and \`turn\` aim it manually.

## Using it without React

Plain HTML, via the sprite:

\`\`\`html
<svg width="96" height="96"><use href="svg/sprite.svg#thinking" /></svg>
\`\`\`

Or reference a single file directly:

\`\`\`html
<img src="svg/states/thinking.svg" width="96" alt="thinking" />
\`\`\`

These are static — one frame, no animation. For the moving mascot, use the component.

## Licence

The expression geometry originates in Sébastien Montlouis-Calixte's GrokBot prototype
(<https://gist.github.com/smontlouis/49a4c9303de70118a90dc43badc1aba5>), which carries no
explicit licence. Bear that in mind before redistributing this as your own work.
`
}
