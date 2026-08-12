/**
 * Shapes to start from. The circle is the default: this is a tool for other people's
 * mascots, so it should open on something neutral rather than someone else's character.
 *
 * Each is a raw silhouette; anchors are computed by the solver at load, not hardcoded, so
 * these go through exactly the same path as an uploaded file.
 */

export interface BuiltinShape {
  id: string
  name: string
  /** Markup in its own coordinate space, sized to fit `viewBox`. */
  markup: string
  viewBox: string
}

const CIRCLE = `<circle cx="100" cy="100" r="100" fill="{{GRADIENT}}"/>`

const SQUIRCLE =
  `<path fill="{{GRADIENT}}" d="M100 0C170 0 200 30 200 100C200 170 170 200 100 200C30 200 0 170 0 100C0 30 30 0 100 0Z"/>`

// The original GrokBot silhouette — a circle with a gentle wobble.
const BLOB =
  `<path fill="{{GRADIENT}}" d="M200 100C200 113.9 197.1 127.8 191.5 140.5C186.2 152.5 178.5 163.4 169 172.4C136.5 203.3 87.1 208.8 48.6 185.7C39.5 180.2 31.2 173.3 24.3 165.2C16.8 156.5 10.8 146.6 6.7 135.9C2.3 124.4 0 112.2 0 100C0 86.1 2.9 72.2 8.5 59.4C13.9 47.4 21.6 36.5 31.1 27.5C63.6 -3.4 113 -8.8 151.5 14.2C160.6 19.7 168.9 26.6 175.8 34.6C183.3 43.3 189.3 53.2 193.4 63.9C197.8 75.4 200 87.6 200 100Z"/>`

// A closed ring of outward-bulging arcs — lobed underneath as well as on top, so it reads
// as a cloud rather than a cloud resting on a shelf.
//
// One path rather than overlapping circles: the gradient resolves per element, so a cloud
// assembled from separate bumps would show a seam wherever two of them met.
const CLOUD =
  `<path fill="{{GRADIENT}}" d="M18 100A30 30 0 0 1 42 58A37 37 0 0 1 100 40A37 37 0 0 1 158 58` +
  `A30 30 0 0 1 182 100A30 30 0 0 1 158 142A37 37 0 0 1 100 160A37 37 0 0 1 42 142A30 30 0 0 1 18 100Z"/>`

// Deliberately lopsided: its widest region is nowhere near the bounding-box centre, so it
// shows that the fit is solved rather than guessed.
const DROP =
  `<path fill="{{GRADIENT}}" d="M100 6 C138 62 178 96 178 126 A78 78 0 0 1 22 126 C22 96 62 62 100 6 Z"/>`

const STAR =
  `<path fill="{{GRADIENT}}" d="M100 4 L124 72 L196 72 L138 114 L160 182 L100 140 L40 182 L62 114 L4 72 L76 72 Z"/>`

const HEX =
  `<path fill="{{GRADIENT}}" d="M100 2 L185 51 L185 149 L100 198 L15 149 L15 51 Z"/>`

export const BUILTIN_SHAPES: BuiltinShape[] = [
  { id: 'circle', name: 'Circle', markup: CIRCLE, viewBox: '0 0 200 200' },
  { id: 'squircle', name: 'Squircle', markup: SQUIRCLE, viewBox: '0 0 200 200' },
  { id: 'blob', name: 'Blob', markup: BLOB, viewBox: '0 0 200 200' },
  { id: 'cloud', name: 'Cloud', markup: CLOUD, viewBox: '0 0 200 200' },
  { id: 'hex', name: 'Hex', markup: HEX, viewBox: '0 0 200 200' },
  { id: 'star', name: 'Star', markup: STAR, viewBox: '0 0 200 200' },
  { id: 'drop', name: 'Drop', markup: DROP, viewBox: '0 0 200 200' },
]

/** Wraps a builtin as a standalone SVG document, so it imports exactly like an upload. */
export function builtinToSvg(shape: BuiltinShape): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${shape.viewBox}">${shape.markup}</svg>`
}
