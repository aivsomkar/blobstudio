import { describe, expect, it } from 'vitest'
import { fieldFromMask, largestInscribedCircle, sampleSdf } from './sdf'
import { FACE_BOX } from '../engine/faceEngine'

/*
  The rasterise step needs a canvas, so these go in one layer down at fieldFromMask, which
  is where the arithmetic that can actually be wrong lives. A mask built by hand has an
  analytically known answer, which is the point: an approximate distance transform would
  pass an eyeball check and fail these.
*/

const SIZE = 64

/** A filled disc, centred, in mask pixels. */
const disc = (radius: number, size = SIZE) => {
  const mask = new Uint8Array(size * size)
  const centre = size / 2 - 0.5
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - centre
      const dy = y - centre
      mask[y * size + x] = dx * dx + dy * dy <= radius * radius ? 1 : 0
    }
  }
  return mask
}

const unitsPerPixel = FACE_BOX / SIZE

describe('fieldFromMask', () => {
  it('is positive inside and negative outside', () => {
    const sdf = fieldFromMask(disc(20), SIZE)
    const centre = SIZE / 2
    expect(sdf.data[centre * SIZE + centre]).toBeGreaterThan(0)
    expect(sdf.data[0]).toBeLessThan(0)
  })

  it('reports the disc radius at the centre, within a pixel', () => {
    const radius = 20
    const sdf = fieldFromMask(disc(radius), SIZE)
    const centre = SIZE / 2
    const measured = sdf.data[centre * SIZE + centre] / unitsPerPixel
    expect(Math.abs(measured - radius)).toBeLessThan(1.5)
  })

  it('measures an exact diagonal distance, which a chamfer pass would not', () => {
    // One lit pixel: the distance to a point 3 across and 4 down is exactly 5.
    const mask = new Uint8Array(SIZE * SIZE)
    mask[10 * SIZE + 10] = 1
    const sdf = fieldFromMask(mask, SIZE)
    const measured = -sdf.data[14 * SIZE + 13] / unitsPerPixel
    expect(measured).toBeCloseTo(5, 5)
  })

  it('scales distances into face-space units', () => {
    const sdf = fieldFromMask(disc(20), SIZE)
    expect(sdf.unitsPerPixel).toBeCloseTo(unitsPerPixel, 10)
    expect(sdf.size).toBe(SIZE)
  })

  it('is entirely negative for an empty mask', () => {
    const sdf = fieldFromMask(new Uint8Array(SIZE * SIZE), SIZE)
    expect(Math.max(...sdf.data)).toBeLessThan(0)
  })
})

describe('sampleSdf', () => {
  it('reads far outside for points beyond the grid', () => {
    const sdf = fieldFromMask(disc(20), SIZE)
    expect(sampleSdf(sdf, -10, 10)).toBe(-999)
    expect(sampleSdf(sdf, 10, -10)).toBe(-999)
    expect(sampleSdf(sdf, FACE_BOX * 2, 10)).toBe(-999)
  })

  it('agrees with the underlying grid at a point inside it', () => {
    const sdf = fieldFromMask(disc(20), SIZE)
    const centre = (SIZE / 2) * unitsPerPixel
    expect(sampleSdf(sdf, centre, centre)).toBeCloseTo(sdf.data[(SIZE / 2) * SIZE + SIZE / 2], 10)
  })
})

describe('largestInscribedCircle', () => {
  it('finds the centre of a centred disc', () => {
    const radius = 20
    const sdf = fieldFromMask(disc(radius), SIZE)
    const found = largestInscribedCircle(sdf)
    const centre = (SIZE / 2) * unitsPerPixel
    expect(Math.abs(found.x - centre)).toBeLessThan(unitsPerPixel * 2)
    expect(Math.abs(found.y - centre)).toBeLessThan(unitsPerPixel * 2)
    expect(found.radius / unitsPerPixel).toBeGreaterThan(radius - 1.5)
  })

  it('picks the larger lobe when a shape has two', () => {
    const mask = new Uint8Array(SIZE * SIZE)
    const fill = (cx: number, cy: number, r: number) => {
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const dx = x - cx
          const dy = y - cy
          if (dx * dx + dy * dy <= r * r) mask[y * SIZE + x] = 1
        }
      }
    }
    fill(16, 32, 6)
    fill(46, 32, 14)
    const found = largestInscribedCircle(fieldFromMask(mask, SIZE))
    expect(found.x / unitsPerPixel).toBeGreaterThan(32)
  })

  it('reports a zero radius rather than a negative one for an empty mask', () => {
    const found = largestInscribedCircle(fieldFromMask(new Uint8Array(SIZE * SIZE), SIZE))
    expect(found.radius).toBe(0)
  })
})
