/**
 * Turns an uploaded SVG file into something the engine can wear.
 *
 * Three jobs, in order:
 *   1. sanitize  — this is a public tool rendering stranger-supplied markup inline
 *   2. namespace — a user's id="grad" would otherwise collide with the engine's defs
 *   3. fit       — measure the real drawn bounds and map them into the 228.541 face box
 *
 * Needs a DOM: the bounds come from getBBox() on a briefly-mounted copy, which is the only
 * way to account for transforms and nested groups accurately.
 */

import { FACE_BOX } from '../engine/faceEngine'

export interface ImportedShape {
  name: string
  fit: string
  body: string
  clip: string
  warnings: string[]
}

/** Elements allowed to survive sanitizing. Anything else is dropped. */
const ALLOWED = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'symbol',
  'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'use',
])

/** Elements that carry fill area, so they can define a clip region. */
const GEOMETRY = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon'])

/** Dropped outright, and worth telling the user about. */
const NOTABLE = new Set(['script', 'foreignObject', 'image', 'style', 'a', 'animate', 'animateTransform', 'animateMotion', 'set', 'filter'])

export class SvgImportError extends Error {}

export function importSvg(source: string, name: string): ImportedShape {
  const warnings: string[] = []

  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (doc.querySelector('parsererror')) {
    throw new SvgImportError("That file isn't valid SVG — the XML failed to parse.")
  }
  const root = doc.documentElement
  if (!root || root.localName !== 'svg') {
    throw new SvgImportError('That file has no <svg> root element.')
  }

  sanitize(root, warnings)
  namespaceIds(root, 'u' + Math.random().toString(36).slice(2, 8))

  const { fit, warning } = measureFit(root)
  if (warning) warnings.push(warning)

  const clip = flattenForClip(root)
  if (!clip) {
    warnings.push(
      'No filled shapes found, so the face has nothing to clip against — outline-only artwork needs a fill.'
    )
  }

  return { name, fit, body: root.innerHTML, clip, warnings }
}

/* ---------------------------------------------------------------- sanitize */

function sanitize(root: Element, warnings: string[]) {
  const dropped = new Set<string>()

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.localName
      if (!ALLOWED.has(tag)) {
        if (NOTABLE.has(tag)) dropped.add(`<${tag}>`)
        child.remove()
        continue
      }
      walk(child)
    }

    for (const attr of Array.from(el.attributes)) {
      const nameLower = attr.localName.toLowerCase()
      // Event handlers execute script.
      if (nameLower.startsWith('on')) {
        dropped.add('event handlers')
        el.removeAttributeNode(attr)
        continue
      }
      // Only same-document references; no network fetches.
      if (nameLower === 'href' || nameLower === 'xlink:href') {
        if (!attr.value.trim().startsWith('#')) {
          dropped.add('external references')
          el.removeAttributeNode(attr)
        }
        continue
      }
      // A style attribute may only reference in-document paint servers.
      if (nameLower === 'style' && /url\(\s*(?!#)/i.test(attr.value)) {
        dropped.add('external references')
        attr.value = attr.value.replace(/url\(\s*(?!#)[^)]*\)/gi, 'none')
      }
    }
  }

  walk(root)
  if (dropped.size) {
    warnings.push(`Removed for safety: ${[...dropped].join(', ')}.`)
  }
}

/* --------------------------------------------------------------- namespace */

/** Rewrites every id and every reference to it, so uploads can't collide with engine defs. */
function namespaceIds(root: Element, prefix: string) {
  const map = new Map<string, string>()
  root.querySelectorAll('[id]').forEach(el => {
    const id = el.getAttribute('id')!
    map.set(id, `${prefix}-${id}`)
  })
  if (!map.size) return

  const all = [root, ...Array.from(root.querySelectorAll('*'))]
  for (const el of all) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.localName === 'id') {
        const next = map.get(attr.value)
        if (next) attr.value = next
        continue
      }
      // url(#id) in fill/stroke/clip-path/mask/style, and href="#id"
      let value = attr.value
      if (value.includes('#')) {
        for (const [from, to] of map) {
          value = value
            .replace(new RegExp(`url\\(\\s*#${escapeRe(from)}\\s*\\)`, 'g'), `url(#${to})`)
            .replace(new RegExp(`^#${escapeRe(from)}$`), `#${to}`)
        }
        if (value !== attr.value) attr.value = value
      }
    }
  }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/* --------------------------------------------------------------------- fit */

/**
 * Maps the artwork's real drawn bounds into the face box, preserving aspect ratio.
 * Uses getBBox rather than the viewBox: artwork rarely fills its own canvas, and a viewBox
 * with padding would leave the mascot small and off-centre.
 */
function measureFit(root: Element): { fit: string; warning?: string } {
  const host = document.createElement('div')
  host.setAttribute(
    'style',
    'position:absolute;left:-99999px;top:0;width:1000px;height:1000px;visibility:hidden'
  )
  const copy = root.cloneNode(true) as SVGSVGElement
  copy.setAttribute('width', '1000')
  copy.setAttribute('height', '1000')
  host.appendChild(copy)
  document.body.appendChild(host)

  let box: { x: number; y: number; width: number; height: number } | null = null
  try {
    const measured = copy.getBBox()
    if (measured.width > 0 && measured.height > 0) box = measured
  } catch {
    box = null
  }
  host.remove()

  let warning: string | undefined
  if (!box) {
    const vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      box = { x: vb[0], y: vb[1], width: vb[2], height: vb[3] }
      warning = 'Could not measure the drawing, so the viewBox was used instead.'
    } else {
      throw new SvgImportError('That SVG appears to be empty — nothing to draw.')
    }
  }

  const scale = FACE_BOX / Math.max(box.width, box.height)
  const tx = (FACE_BOX - box.width * scale) / 2 - box.x * scale
  const ty = (FACE_BOX - box.height * scale) / 2 - box.y * scale
  return {
    fit: `translate(${round(tx)} ${round(ty)}) scale(${round(scale, 6)})`,
    warning,
  }
}

const round = (n: number, places = 4) => Number(n.toFixed(places))

/* -------------------------------------------------------------------- clip */

/**
 * Flattens the tree into clipPath-legal markup.
 *
 * A clipPath may only contain shapes — a <g> inside one is ignored by browsers — so every
 * geometry element is emitted at top level carrying its ancestors' transforms composed
 * onto its own. Shapes with fill="none" are skipped: they draw no area, so including them
 * would clip against a region the user cannot see.
 */
function flattenForClip(root: Element): string {
  const out: string[] = []

  const walk = (el: Element, inherited: string[], inheritedFill: string | null) => {
    for (const child of Array.from(el.children)) {
      const tag = child.localName
      if (tag === 'defs' || tag === 'clipPath' || tag === 'mask' || tag === 'symbol') continue

      const transform = child.getAttribute('transform')
      const chain = transform ? [...inherited, transform] : inherited
      const fill = child.getAttribute('fill') ?? inheritedFill

      if (GEOMETRY.has(tag)) {
        if (fill === 'none') continue
        const clone = child.cloneNode(false) as Element
        for (const attr of Array.from(clone.attributes)) {
          // Geometry and transform only — paint has no meaning inside a clipPath.
          if (!GEOMETRY_ATTRS.has(attr.localName)) clone.removeAttributeNode(attr)
        }
        if (chain.length) clone.setAttribute('transform', chain.join(' '))
        out.push(clone.outerHTML)
      } else {
        walk(child, chain, fill)
      }
    }
  }

  walk(root, [], null)
  return out.join('')
}

const GEOMETRY_ATTRS = new Set([
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'points', 'transform',
  'clip-rule', 'fill-rule',
])
