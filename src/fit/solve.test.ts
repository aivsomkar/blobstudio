import { describe, expect, it } from 'vitest'
import { buildClouds, report, solveFit } from './solve'
import { fieldFromMask } from './sdf'
import { EXPRESSION_COUNT, FACE_BOX, SACCADE_RADIUS } from '../engine/faceEngine'

/*
  The solver's contract is narrow and checkable: whatever placement it returns must not clip.
  It is allowed to return a small face, and on a shape that cannot hold one it is allowed to
  give up — but it is never allowed to claim a fit it does not have, because the clipping
  report is the thing the UI shows people.
*/

const SIZE = 128
const unitsPerPixel = FACE_BOX / SIZE

const maskFrom = (test: (x: number, y: number) => boolean, size = SIZE) => {
  const mask = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) mask[y * size + x] = test(x, y) ? 1 : 0
  }
  return mask
}

const disc = (radius: number) => {
  const centre = SIZE / 2 - 0.5
  return maskFrom((x, y) => (x - centre) ** 2 + (y - centre) ** 2 <= radius * radius)
}

const field = (mask: Uint8Array) => fieldFromMask(mask, SIZE)

describe('solveFit', () => {
  it('fits every expression inside a generous circle', () => {
    const result = solveFit(field(disc(60)), 0.35)
    expect(result.clipping).toEqual([])
    expect(result.clearance).toBeGreaterThanOrEqual(0)
    expect(result.anchor.scale).toBeGreaterThan(0.5)
  })

  it('never returns a placement its own report calls clipping', () => {
    for (const radius of [60, 44, 30, 22, 16]) {
      const sdf = field(disc(radius))
      const result = solveFit(sdf, 0.35)
      const verify = report(buildClouds(0.35), sdf, result.anchor)
      expect(verify.clipping, `radius ${radius}`).toEqual([])
    }
  })

  it('caps the face at the size the expressions were drawn for', () => {
    // A shape far larger than the face box should not inflate the eyes past 1:1.
    expect(solveFit(field(disc(200)), 0.35).anchor.scale).toBeLessThanOrEqual(1)
  })

  it('places the anchor near the centre of a centred disc', () => {
    const result = solveFit(field(disc(60)), 0.35)
    const centre = (SIZE / 2) * unitsPerPixel
    expect(Math.abs(result.anchor.x - centre)).toBeLessThan(FACE_BOX * 0.2)
    expect(Math.abs(result.anchor.y - centre)).toBeLessThan(FACE_BOX * 0.2)
  })

  it('finds room a naive centre would miss', () => {
    // A crescent: the shape's centroid sits in the bite, so seeding there and stopping
    // would report a face that cannot fit anywhere.
    const centre = SIZE / 2 - 0.5
    const mask = maskFrom((x, y) => {
      const inOuter = (x - centre) ** 2 + (y - centre) ** 2 <= 58 * 58
      const inBite = (x - centre - 34) ** 2 + (y - centre) ** 2 <= 40 * 40
      return inOuter && !inBite
    })
    const result = solveFit(field(mask), 0.35)
    expect(result.anchor.scale).toBeGreaterThan(0.02)
    expect(result.clipping).toEqual([])
    // The face has to have moved away from the bite to find that room.
    expect(result.anchor.x).toBeLessThan((SIZE / 2) * unitsPerPixel)
  })

  it('gives up honestly on a shape with no area', () => {
    const result = solveFit(field(new Uint8Array(SIZE * SIZE)), 0.35)
    expect(result.anchor.scale).toBe(0.02)
    expect(result.clipping.length).toBe(EXPRESSION_COUNT)
  })

  it('fits a larger face when the eyes are told not to drift', () => {
    // The gaze/shape split is what makes this true: centring the expressions shrinks the
    // face's footprint, so the same silhouette holds more of it.
    const sdf = field(disc(34))
    expect(solveFit(sdf, 0).anchor.scale).toBeGreaterThan(solveFit(sdf, 1).anchor.scale)
  })

  it('accounts for a constant aim, not just per-expression drift', () => {
    /*
      Aiming hard at a corner moves every point of every face toward it. The placement
      solved without the aim is genuinely wrong once the aim is applied — that is the
      failure being guarded against, and it is asserted directly rather than through the
      scale, which is not monotonic in the aim: the solver mostly answers an aim by moving
      the anchor, and a shifted anchor can hold a slightly larger face than a centred one.
    */
    const sdf = field(disc(34))
    const aim = { x: 1, y: 1 }
    const ignorant = solveFit(sdf, 0.35, undefined, { x: 0, y: 0 })
    expect(report(buildClouds(0.35, undefined, aim), sdf, ignorant.anchor).clipping.length)
      .toBeGreaterThan(0)

    const aware = solveFit(sdf, 0.35, undefined, aim)
    expect(report(buildClouds(0.35, undefined, aim), sdf, aware.anchor).clipping).toEqual([])
    expect(aware.anchor.x).not.toBe(ignorant.anchor.x)
  })
})

describe('report', () => {
  it('flags every expression when the face is pushed off the shape', () => {
    const sdf = field(disc(40))
    const result = report(buildClouds(0.35), sdf, { x: 0, y: 0, scale: 1 })
    expect(result.clipping.length).toBe(EXPRESSION_COUNT)
    expect(result.clearance).toBeLessThan(0)
  })

  it('reports clearance as a positive number for a comfortable fit', () => {
    const sdf = field(disc(60))
    const fit = solveFit(sdf, 0.35)
    expect(report(buildClouds(0.35), sdf, fit.anchor).clearance).toBeGreaterThanOrEqual(0)
  })
})

describe('buildClouds', () => {
  it('builds one cloud per expression', () => {
    expect(buildClouds(0.35).length).toBe(EXPRESSION_COUNT)
  })

  it('gives the mouth samples more clearance than the eye outlines', () => {
    const [cloud] = buildClouds(0.35)
    const needs = Array.from(cloud.need)
    expect(Math.max(...needs)).toBeGreaterThan(Math.min(...needs))
  })

  it('clamps an out-of-range aim rather than trusting it', () => {
    const sane = buildClouds(0.35, undefined, { x: 1, y: 0 })
    const absurd = buildClouds(0.35, undefined, { x: 40, y: 0 })
    expect(Array.from(absurd[0].points)).toEqual(Array.from(sane[0].points))
  })
})

describe('micro-saccades', () => {
  /*
    The eyes move on their own now, and the clipping report is only worth showing if it
    already knows that. These are the tests that keep the two in step.
  */

  it('reserves exactly the saccade radius on eye points', () => {
    // Compared at float32 precision on purpose: `need` is a Float32Array, so that is the
    // precision the solver actually works in.
    const withLife = buildClouds(0.35, undefined, { x: 0, y: 0 }, true)
    const without = buildClouds(0.35, undefined, { x: 0, y: 0 }, false)
    expect(withLife[0].need[0] - without[0].need[0]).toBeCloseTo(SACCADE_RADIUS, 5)
  })

  it('leaves the mouth alone, because the engine does not saccade it', () => {
    const withLife = buildClouds(0.35, undefined, { x: 0, y: 0 }, true)
    const without = buildClouds(0.35, undefined, { x: 0, y: 0 }, false)
    const lastOf = (cloud: { need: Float32Array }) => cloud.need[cloud.need.length - 1]
    expect(lastOf(withLife[0])).toBeCloseTo(lastOf(without[0]), 10)
  })

  it('does not move the points themselves', () => {
    // Saccades are paid for in clearance, not in extra samples — same cloud, more room.
    const withLife = buildClouds(0.35, undefined, { x: 0, y: 0 }, true)
    const without = buildClouds(0.35, undefined, { x: 0, y: 0 }, false)
    expect(Array.from(withLife[0].points)).toEqual(Array.from(without[0].points))
  })

  it('costs face size, which is the honest price of live eyes', () => {
    const sdf = field(disc(34))
    expect(solveFit(sdf, 0.35, undefined, { x: 0, y: 0 }, true).anchor.scale).toBeLessThan(
      solveFit(sdf, 0.35, undefined, { x: 0, y: 0 }, false).anchor.scale
    )
  })

  it('still returns a placement its own report calls clean', () => {
    for (const radius of [60, 44, 30, 22]) {
      const sdf = field(disc(radius))
      const fit = solveFit(sdf, 0.35, undefined, { x: 0, y: 0 }, true)
      const verify = report(buildClouds(0.35, undefined, { x: 0, y: 0 }, true), sdf, fit.anchor)
      expect(verify.clipping, `radius ${radius}`).toEqual([])
    }
  })

  it('would have clipped had the solver ignored the eye movement', () => {
    // The whole reason `life` threads through the solver: a fit solved without it is not
    // safe once the eyes start moving.
    const sdf = field(disc(30))
    const ignorant = solveFit(sdf, 0.35, undefined, { x: 0, y: 0 }, false)
    const underLife = report(buildClouds(0.35, undefined, { x: 0, y: 0 }, true), sdf, ignorant.anchor)
    expect(underLife.clipping.length).toBeGreaterThan(0)
  })
})
