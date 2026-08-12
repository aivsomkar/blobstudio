# Blob Studio — design

**Date:** 2026-08-12
**Status:** approved, implementing

A browser tool where anyone uploads an SVG silhouette and gets an animated mascot — the
GrokBot face engine (25 expressions, 39 states, eyes + mouth) fitted to their shape — then
downloads it as a self-contained React component.

## Why

The face engine currently only works on one hand-fitted shape. Fitting it to the maus took
an offline Python solver: rasterise, distance field, search anchor and scale against all 25
expressions. That work is mechanical, so it can be done in the browser for any shape.

## Decisions

| decision | choice |
| --- | --- |
| Default gaze | Centre every expression; re-apply 35% of its offset as look-around |
| Face placement | Auto-fit (SDF solver), then drag/scale to refine |
| Export | React `.tsx`, self-contained |
| Editor scope | Fit + colors + preview all states. No expression authoring. |
| Default shape | Circle — not the maus. This is a tool for other people's mascots. |
| Uploaded artwork | Keeps its own fills/gradients by default; gradient override is opt-in |
| Backend | None. Fully client-side; nothing is uploaded anywhere. |

## The gaze fix

Every expression currently bakes its look-direction into absolute eye positions. Expression
00 — the resting face for `idle` and 13 other states — sits +41 right and −61 up from face
centre, so a resting mascot permanently glances up-and-right.

Each expression is decomposed into **eye shape + gaze offset**, where the offset is the
eye-pair centroid relative to face centre. Stored rings are centred; at render time the
engine re-adds `offset × lookAround` (default **0.35**), so `idle` looks straight ahead
while `thinking` still glances up-left.

This also shrinks the face's footprint from 194×171 to 136×111 — 46% of the area — so the
face can be roughly 1.4× larger on any silhouette. The fix and the readability win are the
same change.

`lookAround` is a prop: 0 = always forward, 1 = the original behaviour.

## Auto-fit pipeline

1. **Rasterise** the fitted artwork to a 256² alpha mask on canvas.
2. **Signed distance field** via exact Felzenszwalb EDT, run on interior and exterior.
3. **Seed** the anchor at the largest inscribed circle (argmax of the SDF).
4. **Search** anchor × scale, testing every expression's eye points and mouth samples
   against the SDF. Mouth points require an extra `strokeWidth/2` of clearance.
5. **Report** which expressions clip, so the UI can say "3 of 25 expressions clip" and
   offer a one-click fix, rather than letting users discover it later.

## Modules

| module | responsibility |
| --- | --- |
| `svg/import.ts` | parse, sanitize, namespace ids, extract viewBox + body + clip markup |
| `fit/sdf.ts` | rasterise → signed distance field |
| `fit/solve.ts` | anchor/scale search → `{ anchor, scale, clipping[] }` |
| `engine/faceEngine.tsx` | shape-agnostic engine — single source of truth |
| `export/generate.ts` | assemble the downloadable `.tsx` |
| `ui/*` | upload, fit, colors, state grid, export panels |

The engine is imported normally for the live preview and via Vite `?raw` for the export
template, so the preview and the downloaded file cannot drift apart. The engine takes an
optional `shape` prop that defaults to a baked-in constant; the preview passes a live
shape, the export bakes one in.

## Safety

Uploaded SVGs are rendered inline, so `svg/import.ts` strips `<script>`, `on*` handlers,
`<foreignObject>`, and external `href`s, and namespaces all ids (a user's `id="grad"` would
otherwise collide with the engine's).

## Out of scope

Accounts, gallery/sharing, vanilla or Lottie export, per-expression mouth editing, custom
expression authoring, backend storage.

## Verification

- Unit: SDF against a circle (inscribed centre = centre, radius = r); solver monotonic in
  scale; sanitizer strips a hostile fixture.
- End-to-end in a real browser: upload each built-in shape, confirm auto-fit reports zero
  clipping, confirm the exported file typechecks and renders.
