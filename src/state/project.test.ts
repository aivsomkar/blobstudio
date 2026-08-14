import { describe, expect, it } from 'vitest'
import {
  createCustomState,
  duplicateCustomState,
  defaultProject,
  loadProject,
  MAX_STORED_UPLOAD,
  parseProject,
  parseProjectFile,
  projectFileName,
  ProjectFileError,
  PROJECT_VERSION,
  saveProject,
  serializeProject,
  toSequence,
  type CustomState,
  type Project,
  type StorageLike,
} from './project'
import { BUILTIN_SHAPES } from '../shapes/builtin'
import { EXPRESSION_COUNT, FACE_BOX } from '../engine/faceEngine'

/*
  The promise this module makes is that a corrupted field costs you that field and nothing
  else. Most of these tests are variations on "hand it something wrong and check what
  survives", because the failure that matters is the one where a bad gaze loses the artwork.
*/

const fakeStorage = (initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } => {
  const data = { ...initial }
  return {
    data,
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: key => {
      delete data[key]
    },
  }
}

const failingStorage = (): StorageLike => ({
  getItem: () => null,
  setItem: () => {
    throw new DOMException('QuotaExceededError')
  },
  removeItem: () => {},
})

describe('parseProject', () => {
  it('returns the defaults for junk', () => {
    expect(parseProject(null)).toEqual(defaultProject())
    expect(parseProject('nope')).toEqual(defaultProject())
    expect(parseProject(42)).toEqual(defaultProject())
  })

  it('keeps good fields when a neighbour is corrupt', () => {
    const parsed = parseProject({
      ...defaultProject(),
      gaze: 'not a gaze',
      eyeColor: '#123456',
    })
    expect(parsed.gaze).toEqual(defaultProject().gaze)
    expect(parsed.eyeColor).toBe('#123456')
  })

  it('clamps numbers into the range the panels enforce', () => {
    const parsed = parseProject({
      ...defaultProject(),
      lookAround: 99,
      motion: -4,
      spring: 1e9,
      anchor: { x: -500, y: 1e6, scale: 400 },
      gaze: { x: -12, y: 12 },
    })
    expect(parsed.lookAround).toBe(1)
    expect(parsed.motion).toBe(0)
    expect(parsed.spring).toBe(20)
    expect(parsed.anchor).toEqual({ x: 0, y: FACE_BOX, scale: 1.6 })
    expect(parsed.gaze).toEqual({ x: -1, y: 1 })
  })

  it('rejects NaN and Infinity, which JSON.parse will happily produce from strings', () => {
    const parsed = parseProject({ ...defaultProject(), lookAround: NaN, motion: Infinity })
    expect(parsed.lookAround).toBe(defaultProject().lookAround)
    expect(parsed.motion).toBe(defaultProject().motion)
  })

  it('rejects colours that are not six-digit hex', () => {
    const parsed = parseProject({
      ...defaultProject(),
      eyeColor: 'javascript:alert(1)',
      gradient: ['#fff', 'red', '#00ff00'],
    })
    expect(parsed.eyeColor).toBe(defaultProject().eyeColor)
    expect(parsed.gradient[0]).toBe(defaultProject().gradient[0])
    expect(parsed.gradient[2]).toBe('#00ff00')
  })

  it('rejects an unknown state', () => {
    expect(parseProject({ ...defaultProject(), state: 'dancing' }).state).toBe('idle')
  })

  it('rejects an unknown shape id and falls back to a real one', () => {
    const parsed = parseProject({ ...defaultProject(), shapeId: 'not-a-shape' })
    expect(BUILTIN_SHAPES.some(shape => shape.id === parsed.shapeId)).toBe(true)
  })

  it('validates shape parameters against that shape own knobs', () => {
    const circle = BUILTIN_SHAPES[0]
    const key = circle.params[0].key
    const parsed = parseProject({
      ...defaultProject(),
      shapeId: circle.id,
      shapeParams: { [key]: 1e6, bogus: 3 },
    })
    expect(parsed.shapeParams[key]).toBe(circle.params[0].max)
    expect('bogus' in parsed.shapeParams).toBe(false)
  })

  it('clears the shape id when there is artwork, since the two are exclusive', () => {
    const parsed = parseProject({
      ...defaultProject(),
      upload: '<svg/>',
      shapeId: BUILTIN_SHAPES[0].id,
    })
    expect(parsed.upload).toBe('<svg/>')
    expect(parsed.shapeId).toBeNull()
  })

  it('falls back to a shape when the artwork went missing', () => {
    const parsed = parseProject({ ...defaultProject(), upload: null, shapeId: null })
    expect(parsed.shapeId).not.toBeNull()
  })

  it('caps a runaway name', () => {
    expect(parseProject({ ...defaultProject(), name: 'x'.repeat(5000) }).name.length).toBe(120)
  })
})

describe('storage', () => {
  it('round-trips a project', () => {
    const storage = fakeStorage()
    const project = { ...defaultProject(), eyeColor: '#abcdef', lookAround: 0.5 }
    expect(saveProject(project, storage)).toBe('saved')
    const loaded = loadProject(storage)
    expect(loaded?.eyeColor).toBe('#abcdef')
    expect(loaded?.lookAround).toBe(0.5)
  })

  it('returns null when there is nothing stored', () => {
    expect(loadProject(fakeStorage())).toBeNull()
  })

  it('returns null rather than throwing on unparseable storage', () => {
    expect(loadProject(fakeStorage({ 'blob-studio-project-v1': '{{{' }))).toBeNull()
  })

  it('ignores a project written by another version', () => {
    const storage = fakeStorage()
    saveProject(defaultProject(), storage)
    const key = Object.keys(storage.data)[0]
    storage.data[key] = JSON.stringify({ ...defaultProject(), version: 99 })
    expect(loadProject(storage)).toBeNull()
  })

  it('drops oversized artwork rather than losing the whole project', () => {
    const storage = fakeStorage()
    const project = { ...defaultProject(), upload: 'x'.repeat(MAX_STORED_UPLOAD + 1) }
    expect(saveProject(project, storage)).toBe('saved-without-upload')
    const loaded = loadProject(storage)
    expect(loaded).not.toBeNull()
    expect(loaded!.upload).toBeNull()
    expect(loaded!.uploadDropped).toBe(true)
  })

  it('retries without the artwork when storage refuses the write', () => {
    expect(saveProject({ ...defaultProject(), upload: '<svg/>' }, failingStorage())).toBe('failed')
  })

  it('reports failure when there is no storage at all', () => {
    expect(saveProject(defaultProject(), null)).toBe('failed')
    expect(loadProject(null)).toBeNull()
  })

  it('clears the dropped flag once the artwork fits again', () => {
    const storage = fakeStorage()
    saveProject({ ...defaultProject(), upload: 'x'.repeat(MAX_STORED_UPLOAD + 1) }, storage)
    saveProject({ ...defaultProject(), upload: '<svg/>' }, storage)
    expect(loadProject(storage)!.uploadDropped).toBe(false)
  })
})

describe('project files', () => {
  it('round-trips through the file format', () => {
    const project = { ...defaultProject(), name: 'Robo', lookAround: 0.15 }
    const parsed = parseProjectFile(serializeProject(project))
    expect(parsed.name).toBe('Robo')
    expect(parsed.lookAround).toBe(0.15)
  })

  it('rejects a file that is not JSON', () => {
    expect(() => parseProjectFile('not json')).toThrow(ProjectFileError)
  })

  it('rejects JSON that is not a project', () => {
    expect(() => parseProjectFile('{"hello":true}')).toThrow(ProjectFileError)
  })

  it('names the version mismatch rather than failing vaguely', () => {
    const source = JSON.stringify({ ...defaultProject(), version: PROJECT_VERSION + 1 })
    expect(() => parseProjectFile(source)).toThrow(/version/)
  })

  it('rejects a project with neither artwork nor a shape', () => {
    const source = JSON.stringify({ version: PROJECT_VERSION, upload: null, shapeId: null })
    expect(() => parseProjectFile(source)).toThrow(ProjectFileError)
  })
})

describe('projectFileName', () => {
  it('slugifies', () => {
    expect(projectFileName('My Robot!')).toBe('my-robot.blobstudio.json')
  })

  it('strips accents rather than dropping the word', () => {
    expect(projectFileName('Créature')).toBe('creature.blobstudio.json')
  })

  it('falls back for a name with nothing usable in it', () => {
    expect(projectFileName('!!!')).toBe('mascot.blobstudio.json')
  })
})

describe('custom states', () => {
  const withStates = (customStates: unknown) => parseProject({ ...defaultProject(), customStates })

  it('defaults to none', () => {
    expect(defaultProject().customStates).toEqual([])
    expect(parseProject({}).customStates).toEqual([])
  })

  it('round-trips a state someone built', () => {
    const built = createCustomState('Greeting')
    const parsed = withStates([built])
    expect(parsed.customStates).toHaveLength(1)
    expect(parsed.customStates[0].name).toBe('Greeting')
    expect(parsed.customStates[0].steps).toHaveLength(built.steps.length)
  })

  it('drops a step pointing past the end of the expression table', () => {
    /*
      Steps reference expressions by index because that is the only identity a generated
      table has. Regenerating the engine with fewer expressions must therefore drop the
      dangling step, not wrap it round to a face nobody chose.
    */
    const parsed = withStates([
      { ...createCustomState('X'), steps: [
        { expression: 0, holdMs: 1000, transitionMs: 200, transition: 'smooth' },
        { expression: EXPRESSION_COUNT + 5, holdMs: 1000, transitionMs: 200, transition: 'smooth' },
      ] },
    ])
    expect(parsed.customStates[0].steps).toHaveLength(1)
    expect(parsed.customStates[0].steps[0].expression).toBe(0)
  })

  it('drops a state left with no playable steps at all', () => {
    const parsed = withStates([
      { ...createCustomState('X'), steps: [{ expression: 999, holdMs: 1, transitionMs: 1, transition: 'smooth' }] },
    ])
    expect(parsed.customStates).toEqual([])
  })

  it('drops duplicate ids, which would make editing ambiguous', () => {
    const one = createCustomState('One')
    expect(withStates([one, { ...one, name: 'Two' }]).customStates).toHaveLength(1)
  })

  it('clamps step timings into playable ranges', () => {
    const parsed = withStates([
      { ...createCustomState('X'), steps: [
        { expression: 0, holdMs: 0, transitionMs: -50, transition: 'smooth' },
      ] },
    ])
    const step = parsed.customStates[0].steps[0]
    expect(step.holdMs).toBeGreaterThanOrEqual(120)
    expect(step.transitionMs).toBeGreaterThanOrEqual(0)
  })

  it('keeps blink bounds in order', () => {
    const parsed = withStates([
      { ...createCustomState('X'), blink: { enabled: true, minMs: 9000, maxMs: 500 } },
    ])
    const blink = parsed.customStates[0].blink
    expect(blink.maxMs).toBeGreaterThanOrEqual(blink.minMs)
  })

  it('rejects a borrowed motion that is not a real state', () => {
    expect(withStates([{ ...createCustomState('X'), motion: 'dancing' }]).customStates[0].motion)
      .toBeNull()
  })

  it('drops a selection pointing at a state that did not survive', () => {
    const parsed = parseProject({
      ...defaultProject(),
      customStates: [],
      activeCustomStateId: 'gone',
    })
    expect(parsed.activeCustomStateId).toBeNull()
  })

  it('keeps a selection that does resolve', () => {
    const built = createCustomState('Keep')
    const parsed = parseProject({
      ...defaultProject(),
      customStates: [built],
      activeCustomStateId: built.id,
    })
    expect(parsed.activeCustomStateId).toBe(built.id)
  })

  it('survives the project file round trip', () => {
    const built = createCustomState('Greeting')
    const project = { ...defaultProject(), customStates: [built], activeCustomStateId: built.id }
    const parsed = parseProjectFile(serializeProject(project))
    expect(parsed.customStates[0].id).toBe(built.id)
    expect(parsed.activeCustomStateId).toBe(built.id)
  })

  it('opens a document written before custom states existed', () => {
    const legacy = { ...defaultProject() } as Partial<Project>
    delete legacy.customStates
    delete legacy.activeCustomStateId
    delete legacy.life
    const parsed = parseProject(legacy)
    expect(parsed.customStates).toEqual([])
    expect(parsed.activeCustomStateId).toBeNull()
    expect(parsed.life).toBe(true)
  })
})

describe('duplicateCustomState', () => {
  it('copies under a fresh identity', () => {
    const source = createCustomState('Wave')
    const copy = duplicateCustomState(source)
    expect(copy.id).not.toBe(source.id)
    expect(copy.name).toBe('Wave copy')
  })

  it('does not share the steps array with its source', () => {
    const source = createCustomState('Wave')
    const copy = duplicateCustomState(source)
    copy.steps[0].holdMs = 9999
    copy.blink.enabled = false
    expect(source.steps[0].holdMs).not.toBe(9999)
    expect(source.blink.enabled).toBe(true)
  })
})

describe('toSequence', () => {
  it('produces something the engine will play', () => {
    const sequence = toSequence(createCustomState('Wave'))
    expect(sequence).not.toBeNull()
    expect(sequence!.steps.length).toBeGreaterThan(0)
  })

  it('turns a disabled blink into no blink at all', () => {
    const state: CustomState = {
      ...createCustomState('Wave'),
      blink: { enabled: false, minMs: 3000, maxMs: 5000 },
    }
    expect(toSequence(state)!.blink).toBeNull()
  })
})
