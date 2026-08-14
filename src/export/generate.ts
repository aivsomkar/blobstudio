/**
 * Produces the file the user downloads.
 *
 * The payload is the very engine this page is running — imported as raw source via Vite's
 * `?raw`, with the shape block swapped and the names rebranded. Preview and download cannot
 * drift apart, because there is only one engine.
 */

import engineSource from '../engine/faceEngine.tsx?raw'
import type { MascotShape } from '../engine/faceEngine'
import { toSequence, type CustomState } from '../state/project'

export interface ExportOptions {
  /** Base name, e.g. "Robo" produces RoboAvatar, RoboState, ROBO_STATES. */
  componentName: string
  shape: MascotShape
  gradient: [string, string, string]
  eyeColor: string
  lookAround: number
  gaze: { x: number; y: number }
  motion: number
  effects: boolean
  glyphs: boolean
  /** States built in the studio, baked in so the recipient can play them by name. */
  customStates?: CustomState[]
}

const SHAPE_START = '/* __SHAPE_START__ */'
const SHAPE_END = '/* __SHAPE_END__ */'
const SEQUENCES_START = '/* __SEQUENCES_START__ */'
const SEQUENCES_END = '/* __SEQUENCES_END__ */'

export function generateComponent(options: ExportOptions): string {
  const {
    componentName,
    shape,
    gradient,
    eyeColor,
    lookAround,
    gaze,
    motion,
    effects,
    glyphs,
    customStates = [],
  } = options
  const base = sanitizeName(componentName)

  let source = engineSource

  // 1. Swap in this mascot's silhouette.
  source = replaceBlock(source, SHAPE_START, SHAPE_END, shapeBlock(shape))

  // 2. Bake any states built in the studio, so they travel with the component.
  source = replaceBlock(source, SEQUENCES_START, SEQUENCES_END, sequencesBlock(customStates))

  // 3. Bake the chosen colours and gaze as the defaults.
  source = source.replace(
    /export const DEFAULT_GRADIENT: \[string, string, string\] = \[[^\]]*\]/,
    `export const DEFAULT_GRADIENT: [string, string, string] = ${JSON.stringify(gradient)}`
  )
  source = source.replace(/eyeColor = '#ffffff'/, `eyeColor = ${JSON.stringify(eyeColor)}`)
  source = source.replace(/lookAround = 0\.35/g, `lookAround = ${lookAround}`)
  source = source.replace(
    /export const DEFAULT_GAZE: \{ x: number; y: number \} = \{[^}]*\}/,
    `export const DEFAULT_GAZE: { x: number; y: number } = { x: ${gaze.x}, y: ${gaze.y} }`
  )
  source = source.replace(
    /const motionStrength = motion \?\? \(prefersReducedMotion \? 0 : 1\)/,
    `const motionStrength = motion ?? (prefersReducedMotion ? 0 : ${motion})`
  )
  source = source.replace(/effects = true,/, `effects = ${effects},`)
  source = source.replace(/glyphs = true,/, `glyphs = ${glyphs},`)

  // 4. Rebrand.
  source = source.replace(/\bMascot/g, base).replace(/\bMASCOT_/g, upperSnake(base) + '_')

  // 5. Replace the generated-file header with one that makes sense to the recipient.
  source = source.replace(/^\/\*\*[\s\S]*?\*\/\n/, header(base, shape.name))

  return source
}

function replaceBlock(source: string, start: string, end: string, body: string): string {
  const from = source.indexOf(start)
  const to = source.indexOf(end)
  if (from < 0 || to < 0) throw new Error(`engine source is missing its ${start} markers`)
  return source.slice(0, from) + body + source.slice(to + end.length)
}

/**
 * The studio's states, as a lookup the exported component can play by name.
 *
 * Keys are slugs rather than the display names, because this becomes a prop value someone
 * types. Resolved through the same validation the engine uses, so a step pointing at a
 * missing expression is dropped here rather than shipped and thrown at runtime.
 */
function sequencesBlock(customStates: CustomState[]): string {
  const used = new Set<string>()
  const entries = customStates.flatMap(state => {
    const sequence = toSequence(state)
    if (!sequence) return []
    let key = sequenceKey(state.name)
    let suffix = 2
    while (used.has(key)) key = `${sequenceKey(state.name)}-${suffix++}`
    used.add(key)
    return [`  ${JSON.stringify(key)}: ${JSON.stringify(sequence)},`]
  })
  return entries.length
    ? `export const SEQUENCES: Record<string, SequenceDef> = {\n${entries.join('\n')}\n}`
    : 'export const SEQUENCES: Record<string, SequenceDef> = {}'
}

/**
 * The key a custom state gets in the exported SEQUENCES map.
 *
 * Exported because two panels show it back to the user, and a preview that disagrees with
 * what the file actually contains is worse than no preview. Collisions get a numeric suffix
 * at build time, which a single-name preview cannot know about.
 */
export const sequenceKey = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'state'

function shapeBlock(shape: MascotShape): string {
  return [
    'export const SHAPE: MascotShape = {',
    `  name: ${JSON.stringify(shape.name)},`,
    `  fit: ${JSON.stringify(shape.fit)},`,
    `  body: ${JSON.stringify(shape.body)},`,
    `  clip: ${JSON.stringify(shape.clip)},`,
    `  anchor: { x: ${shape.anchor.x}, y: ${shape.anchor.y}, scale: ${shape.anchor.scale} },`,
    '}',
  ].join('\n')
}

function header(base: string, shapeName: string): string {
  return `/**
 * ${base}Avatar — an animated mascot built on the "${shapeName}" silhouette.
 *
 * Self-contained: React is the only dependency. Drop this file in and use it.
 *
 *   import ${base}Avatar from './${base}Avatar'
 *
 *   <${base}Avatar state="thinking" size={160} />
 *
 * The state drives everything — which expressions cycle, how often, and when it blinks.
 * Set \`state\` and it animates itself; see ${upperSnake(base)}_STATES for the full list.
 *
 * Props of note:
 *   state        one of ${upperSnake(base)}_STATES
 *   expression   pin a single face and stop the cycling
 *   lookAround   how much each expression glances around. 0 = always straight ahead
 *   gaze / turn  aim the eyes, or rotate the head around its implied sphere
 *   showMouth    false for an eyes-only face
 *
 * Made with Blob Studio.
 */
`
}

/** A valid PascalCase TS identifier, because this becomes a component name. */
export function sanitizeName(input: string): string {
  const cleaned = input
    .replace(/[^A-Za-z0-9 _-]/g, ' ')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join('')
  if (!cleaned || /^[0-9]/.test(cleaned)) return 'Mascot'
  return cleaned
}

const upperSnake = (base: string) =>
  base.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

export function downloadFile(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
