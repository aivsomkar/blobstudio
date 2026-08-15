/**
 * What the studio remembers between visits.
 *
 * Everything the panels can change collapses to one small object. It autosaves to
 * localStorage, and the same object downloads as a `.blobstudio.json` file — which is both
 * the backup path and the way a mascot moves between machines.
 *
 * Two decisions worth knowing about:
 *
 * **The distance field is not stored.** It is a 256² Float32Array — a megabyte of derived
 * data that would swallow the storage quota to save work the solver does inside a frame.
 * It is rebuilt on load, the same way it is rebuilt on every shape-parameter drag.
 *
 * **Uploads keep their original file text, not the sanitized result.** Restoring replays
 * the exact upload path — parse, sanitize, namespace, measure — so a restored mascot cannot
 * differ from the one that was saved, and markup that has been sitting in localStorage is
 * re-sanitized before it is ever rendered rather than trusted because it was clean once.
 *
 * Reads are defensive per field: a corrupted gaze should cost you a gaze, not the artwork
 * you spent ten minutes fitting.
 */

import {
  DEFAULT_GRADIENT,
  EXPRESSION_COUNT,
  FACE_BOX,
  MASCOT_STATES,
  resolveSequence,
  type MascotState,
  type SequenceDef,
  type SequencePlayback,
  type SequenceTransition,
} from '../engine/faceEngine'
import { BUILTIN_SHAPES } from '../shapes/builtin'

/*
  Custom states and the eye-life flag were added without a version bump, on purpose. Both
  are additive optional fields, and every field is already parsed defensively with its own
  fallback — so an older document opens with the new fields at their defaults, and nothing
  needs migrating. The number is for changes that would make an old document mean something
  different, which is a promise worth keeping meaningful.
*/
export const PROJECT_VERSION = 1

const STORAGE_KEY = 'blob-studio-project-v1'

/**
 * Uploads above this are kept in the session but not written to storage. The quota is
 * around 5MB in practice, and a mascot that silently evicts itself on every save is worse
 * than one that says it is too big to keep.
 */
export const MAX_STORED_UPLOAD = 1_500_000

/**
 * A state someone built here rather than one the lab shipped.
 *
 * Steps reference an expression by index, which is the only identity expressions have:
 * the 25 outlines are generated into the engine as an ordered table, not authored here, so
 * there is nothing durable to point at instead. Regenerating the engine could in principle
 * renumber them — so the index is validated against EXPRESSION_COUNT on the way in and a
 * step pointing past the end is dropped rather than played.
 */
export interface CustomState {
  id: string
  name: string
  steps: {
    expression: number
    holdMs: number
    transitionMs: number
    transition: SequenceTransition
  }[]
  playback: SequencePlayback
  blink: { enabled: boolean; minMs: number; maxMs: number }
  /** A built-in state whose body motion to borrow, or null to inherit the current one. */
  motion: string | null
}

export interface Project {
  version: number
  name: string
  /** The original file text, for an upload. Null when a built-in shape is in play. */
  upload: string | null
  /** Non-null only for built-ins, which regenerate from their parameters. */
  shapeId: string | null
  shapeParams: Record<string, number>
  anchor: { x: number; y: number; scale: number }
  gaze: { x: number; y: number }
  lookAround: number
  motion: number
  spring: number
  eyes: { left: [number, number]; right: [number, number] }
  linkedEyes: boolean
  gradient: [string, string, string]
  eyeColor: string
  useGradient: boolean
  showMouth: boolean
  effects: boolean
  glyphs: boolean
  dark: boolean
  /** Micro-saccades between expression changes. */
  life: boolean
  state: MascotState
  customStates: CustomState[]
  /** Which custom state the stage is playing, or null for the built-in `state`. */
  activeCustomStateId: string | null
  /**
   * Set by the save path when the artwork had to be left out to fit the quota, so the next
   * load can explain why it opened on a plain shape instead of silently doing it.
   */
  uploadDropped?: boolean
}

export class ProjectFileError extends Error {}

/* ------------------------------------------------------------------ parsing */

const num = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, min), max)
    : fallback

const bool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

const HEX = /^#[0-9a-f]{6}$/i
const hex = (value: unknown, fallback: string) =>
  typeof value === 'string' && HEX.test(value) ? value : fallback

const text = (value: unknown, fallback: string, max = 120) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback

const pair = (
  value: unknown,
  fallback: [number, number],
  min: number,
  max: number
): [number, number] =>
  Array.isArray(value) && value.length === 2
    ? [num(value[0], fallback[0], min, max), num(value[1], fallback[1], min, max)]
    : [...fallback]

const STATES = new Set<string>(MASCOT_STATES)
const TRANSITIONS: SequenceTransition[] = ['spring', 'smooth', 'snappy']
const PLAYBACKS: SequencePlayback[] = ['loop', 'once', 'pingPong']

const oneOf = <T extends string>(value: unknown, allowed: T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

export const MAX_CUSTOM_STATES = 24
export const MAX_STATE_STEPS = 32

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const createCustomState = (name = 'New state'): CustomState => ({
  id: newId(),
  name,
  steps: [
    { expression: 0, holdMs: 1400, transitionMs: 400, transition: 'smooth' },
    { expression: 8, holdMs: 1400, transitionMs: 400, transition: 'smooth' },
  ],
  playback: 'loop',
  blink: { enabled: true, minMs: 3200, maxMs: 6000 },
  motion: null,
})

/** A deep copy under a fresh identity — the steps array must not stay shared. */
export const duplicateCustomState = (source: CustomState): CustomState => ({
  ...source,
  id: newId(),
  name: `${source.name} copy`,
  steps: source.steps.map(step => ({ ...step })),
  blink: { ...source.blink },
})

/**
 * Turns a stored custom state into what the engine's `sequence` prop wants. The engine
 * validates again on its own account — it accepts sequences from callers who never went
 * through here — but doing it once at the boundary keeps bad data out of the document.
 */
export const toSequence = (custom: CustomState): SequenceDef | null =>
  resolveSequence(
    {
      name: custom.name,
      steps: custom.steps,
      playback: custom.playback,
      blink: custom.blink.enabled
        ? { minMs: custom.blink.minMs, maxMs: custom.blink.maxMs }
        : null,
      motion: custom.motion,
    },
    EXPRESSION_COUNT
  )

const parseCustomState = (value: unknown): CustomState | null => {
  if (!value || typeof value !== 'object') return null
  const stored = value as Partial<CustomState>
  const steps = Array.isArray(stored.steps)
    ? stored.steps
        .filter(
          step =>
            step &&
            typeof step === 'object' &&
            typeof step.expression === 'number' &&
            Number.isInteger(step.expression) &&
            // A step pointing past the end of the expression table is dropped rather than
            // wrapped: wrapping would silently play a face nobody chose.
            step.expression >= 0 &&
            step.expression < EXPRESSION_COUNT
        )
        .slice(0, MAX_STATE_STEPS)
        .map(step => ({
          expression: step.expression,
          holdMs: num(step.holdMs, 1400, 120, 60000),
          transitionMs: num(step.transitionMs, 400, 0, 5000),
          transition: oneOf(step.transition, TRANSITIONS, 'smooth'),
        }))
    : []
  // A state with no playable steps is not a state.
  if (!steps.length) return null
  const minMs = num((stored.blink as CustomState['blink'])?.minMs, 3200, 200, 60000)
  return {
    id: typeof stored.id === 'string' && stored.id ? stored.id.slice(0, 64) : newId(),
    name: text(stored.name, 'Untitled state', 48),
    steps,
    playback: oneOf(stored.playback, PLAYBACKS, 'loop'),
    blink: {
      enabled: bool((stored.blink as CustomState['blink'])?.enabled, true),
      minMs,
      maxMs: Math.max(minMs, num((stored.blink as CustomState['blink'])?.maxMs, 6000, 200, 60000)),
    },
    motion:
      typeof stored.motion === 'string' && STATES.has(stored.motion) ? stored.motion : null,
  }
}

const parseCustomStates = (value: unknown): CustomState[] => {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: CustomState[] = []
  for (const item of value.slice(0, MAX_CUSTOM_STATES)) {
    const parsed = parseCustomState(item)
    // Duplicate ids would make "which one did I just edit" unanswerable.
    if (!parsed || seen.has(parsed.id)) continue
    seen.add(parsed.id)
    out.push(parsed)
  }
  return out
}

/**
 * A built-in's parameters are only meaningful against that shape's own knobs, so they are
 * validated against its declared ranges rather than waved through. An unknown key is
 * dropped; a missing one falls back to the default.
 */
const shapeParams = (value: unknown, shapeId: string | null): Record<string, number> => {
  const shape = BUILTIN_SHAPES.find(item => item.id === shapeId)
  if (!shape) return {}
  const stored = (value ?? {}) as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const param of shape.params) {
    out[param.key] = num(stored[param.key], shape.defaults[param.key], param.min, param.max)
  }
  return out
}

/** Whether this machine has asked for less movement. */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const defaultProject = (): Project => {
  const circle = BUILTIN_SHAPES[0]
  return {
    version: PROJECT_VERSION,
    name: circle.name,
    upload: null,
    shapeId: circle.id,
    shapeParams: { ...circle.defaults },
    anchor: { x: FACE_BOX / 2, y: FACE_BOX / 2, scale: 1 },
    gaze: { x: 0.22, y: 0 },
    lookAround: 0.35,
    /*
      Full motion unless the machine has asked for less.

      The engine already falls back to stillness when `motion` is left undefined, but this
      page always supplies the prop — so that fallback never ran here, and a viewer who had
      asked for reduced motion still got forty mascots moving at once. Reading the
      preference into the default is what actually honours it.
    */
    motion: prefersReducedMotion() ? 0 : 1,
    spring: 7,
    eyes: { left: [1, 1], right: [1, 1] },
    linkedEyes: true,
    gradient: [...DEFAULT_GRADIENT] as [string, string, string],
    eyeColor: '#ffffff',
    useGradient: true,
    showMouth: true,
    effects: true,
    glyphs: true,
    dark: true,
    life: true,
    state: 'idle',
    customStates: [],
    activeCustomStateId: null,
    uploadDropped: false,
  }
}

/**
 * Reads a stored or imported object into a usable project. Never throws — every field
 * either parses or falls back, so a partially corrupted document still opens.
 */
export const parseProject = (value: unknown, fallback: Project = defaultProject()): Project => {
  const stored = (value ?? {}) as Partial<Project>

  const upload = typeof stored.upload === 'string' && stored.upload.trim() ? stored.upload : null
  // A project is one or the other. An upload wins, because it is the thing that cannot be
  // regenerated from parameters if we guess wrong.
  const known =
    typeof stored.shapeId === 'string' && BUILTIN_SHAPES.some(item => item.id === stored.shapeId)
  const shapeId = upload ? null : known ? stored.shapeId! : fallback.shapeId

  const customStates = parseCustomStates(stored.customStates)
  const gradient = Array.isArray(stored.gradient) && stored.gradient.length === 3

  return {
    version: PROJECT_VERSION,
    name: text(stored.name, fallback.name),
    upload,
    shapeId,
    shapeParams: shapeParams(stored.shapeParams, shapeId),
    anchor: {
      x: num((stored.anchor as Project['anchor'])?.x, fallback.anchor.x, 0, FACE_BOX),
      y: num((stored.anchor as Project['anchor'])?.y, fallback.anchor.y, 0, FACE_BOX),
      scale: num((stored.anchor as Project['anchor'])?.scale, fallback.anchor.scale, 0.02, 1.6),
    },
    gaze: {
      x: num((stored.gaze as Project['gaze'])?.x, fallback.gaze.x, -1, 1),
      y: num((stored.gaze as Project['gaze'])?.y, fallback.gaze.y, -1, 1),
    },
    lookAround: num(stored.lookAround, fallback.lookAround, 0, 1),
    motion: num(stored.motion, fallback.motion, 0, 1.5),
    spring: num(stored.spring, fallback.spring, 1, 20),
    eyes: {
      left: pair((stored.eyes as Project['eyes'])?.left, fallback.eyes.left, 0.2, 2.4),
      right: pair((stored.eyes as Project['eyes'])?.right, fallback.eyes.right, 0.2, 2.4),
    },
    linkedEyes: bool(stored.linkedEyes, fallback.linkedEyes),
    gradient: gradient
      ? [
          hex(stored.gradient![0], fallback.gradient[0]),
          hex(stored.gradient![1], fallback.gradient[1]),
          hex(stored.gradient![2], fallback.gradient[2]),
        ]
      : [...fallback.gradient],
    eyeColor: hex(stored.eyeColor, fallback.eyeColor),
    useGradient: bool(stored.useGradient, fallback.useGradient),
    showMouth: bool(stored.showMouth, fallback.showMouth),
    effects: bool(stored.effects, fallback.effects),
    glyphs: bool(stored.glyphs, fallback.glyphs),
    dark: bool(stored.dark, fallback.dark),
    life: bool(stored.life, fallback.life),
    state:
      typeof stored.state === 'string' && STATES.has(stored.state)
        ? (stored.state as MascotState)
        : fallback.state,
    customStates,
    // Pointing at a state that did not survive parsing would leave the stage playing
    // nothing, so an unresolvable selection falls back to the built-in state.
    activeCustomStateId:
      typeof stored.activeCustomStateId === 'string' &&
      customStates.some(item => item.id === stored.activeCustomStateId)
        ? stored.activeCustomStateId
        : null,
    uploadDropped: stored.uploadDropped === true,
  }
}

/* ------------------------------------------------------------------ storage */

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

const browserStorage = (): StorageLike | null => {
  try {
    return window.localStorage
  } catch {
    // Storage can throw on access alone under some privacy settings.
    return null
  }
}

/** The stored project, or null if there isn't one worth restoring. */
export const loadProject = (storage: StorageLike | null = browserStorage()): Project | null => {
  if (!storage) return null
  let raw: string | null = null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<Project>
    if (!value || value.version !== PROJECT_VERSION) return null
    return parseProject(value)
  } catch {
    return null
  }
}

export type SaveResult = 'saved' | 'saved-without-upload' | 'failed'

/**
 * Writes the project, dropping an oversized upload rather than failing the whole save —
 * losing the colours too because the artwork was large would be the wrong trade. Returns
 * what actually happened so the UI can be honest about it.
 */
export const saveProject = (
  project: Project,
  storage: StorageLike | null = browserStorage()
): SaveResult => {
  if (!storage) return 'failed'
  const oversized = project.upload !== null && project.upload.length > MAX_STORED_UPLOAD
  const withoutUpload = () => ({ ...project, upload: null, uploadDropped: true })
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(oversized ? withoutUpload() : { ...project, uploadDropped: false })
    )
    return oversized ? 'saved-without-upload' : 'saved'
  } catch {
    // Quota exceeded, or storage disabled mid-session. Try once more without the artwork.
    if (project.upload === null) return 'failed'
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(withoutUpload()))
      return 'saved-without-upload'
    } catch {
      return 'failed'
    }
  }
}

export const clearProject = (storage: StorageLike | null = browserStorage()) => {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing useful to do; the in-memory project stays authoritative either way.
  }
}

/* --------------------------------------------------------------------- file */

export const serializeProject = (project: Project) => JSON.stringify(project, null, 2)

/** Reads a downloaded project back. Throws with something worth showing a person. */
export const parseProjectFile = (source: string): Project => {
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new ProjectFileError("That file isn't a Blob Studio project — the JSON failed to parse.")
  }
  const candidate = value as Partial<Project> | null
  if (!candidate || typeof candidate !== 'object' || typeof candidate.version !== 'number') {
    throw new ProjectFileError("That file isn't a Blob Studio project.")
  }
  if (candidate.version !== PROJECT_VERSION) {
    throw new ProjectFileError(
      `That project was saved by version ${candidate.version}; this studio reads version ${PROJECT_VERSION}.`
    )
  }
  if (candidate.upload === null || candidate.upload === undefined) {
    if (typeof candidate.shapeId !== 'string') {
      throw new ProjectFileError('That project has neither artwork nor a starting shape.')
    }
  }
  return parseProject(candidate)
}

export const projectFileName = (name: string) => {
  const slug =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'mascot'
  return `${slug}.blobstudio.json`
}
