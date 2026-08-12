# Blob Studio

Drop in an SVG. It gets eyes, a mouth, 25 expressions and 39 moods — then leaves as a React
component. Everything runs in the browser; nothing is uploaded anywhere.

The output is one self-contained `.tsx` file with React as its only dependency:

```tsx
import RoboAvatar from './RoboAvatar'

<RoboAvatar state="thinking" size={160} />
```

Set `state` and it animates itself — picks that state's resting face, drifts through its
expression pool on its own cadence, and blinks on its own rhythm.

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static files in dist/ — deploy anywhere
```

`src/engine/faceEngine.tsx` is generated but committed, so `build` never regenerates it —
a clean clone builds with nothing else present. Regeneration is a separate, manual step
(see below) that needs the original lab.

## What happens to an upload

1. **Sanitize.** This renders stranger-supplied markup inline, so `<script>`, `on*`
   handlers, `<foreignObject>`, `<image>` and external `href`s are stripped, and every id is
   namespaced (a user's `id="grad"` would otherwise collide with the engine's defs).
2. **Measure.** `getBBox()` on a briefly-mounted copy gives the artwork's real drawn bounds,
   which are mapped into the engine's 228.541-unit face box. The viewBox is only a fallback:
   artwork rarely fills its own canvas, and using it would leave the mascot small and
   off-centre.
3. **Fit.** Rasterise to a 256² alpha mask, build an exact signed distance field, seed the
   anchor at the largest inscribed circle, then search anchor × scale until every one of the
   25 expressions — eye outlines *and* mouth curve — sits inside the silhouette.
4. **Report.** Because the solver knows exactly which expressions fail, the UI can say
   "3 of 25 expressions clip" and offer a fix, instead of letting you find out later.

## Layout

```
src/engine/faceEngine.tsx   the animation engine — GENERATED, and the export payload
src/svg/import.ts           parse, sanitize, namespace, measure
src/fit/sdf.ts              rasterise → signed distance field
src/fit/solve.ts            anchor/scale search + clipping report
src/export/generate.ts      assemble the downloadable .tsx
src/shapes/builtin.ts       circle, squircle, blob, hex, star, drop
src/ui/                     dropzone, fit, colour, state grid, export
scripts/gen-engine.cjs      regenerates the engine from the GrokBot lab
```

The engine is imported normally for the live preview *and* via Vite's `?raw` for the export
template, so the preview and the downloaded file cannot drift apart.

## Regenerating the engine

Expression rings, the mouth table, state pools and cadences all come from the original
GrokBot lab at `../gist/index.html`. After changing it:

```sh
npm run gen:engine
```

The generator also does two things worth knowing about.

**Gaze is split from shape.** Every expression originally baked its look-direction into
absolute eye positions — expression 00, the resting face for `idle` and 13 other states, sat
+41 right and −61 up from centre, so a mascot at rest permanently glanced up-and-right. Each
expression is now centred, with its offset kept in `GAZE` and re-applied at render time as
`GAZE[i] × lookAround` (default 0.35). Side effect: the face's footprint drops from 194×171
to 136×111, so it fits roughly 1.4× larger on any silhouette.

**Resting faces point forward.** A state shows its pool's first expression at rest, and that
ordering wasn't chosen with resting in mind. Each expression is scored on how forward-facing
it is — level pair, matched sizes, matched tilt, upright — and each state now rests on its
most forward-facing member. Cycle order is otherwise untouched, so nothing loses character:
`angry` still rests on a scowl, because every face in its pool is a scowl. The seven states
sharing the generic `[0,8]` pool also gain expression 6, which is symmetric, upright, and
was used by no state at all.

## Body motion

The face engine on its own leaves the silhouette perfectly still, which reads as dead for
states literally named `bouncing` or `spawning`. `MOTION` gives every state its own body
behaviour — bob, sway, pulse, orbital drift, jitter, tilt, squash, plus one-shot entrances
and exits.

It is all shape-agnostic, so an uploaded logo animates exactly like the built-in circle:

- `bouncing` travels vertically and **squashes on landing**, pivoting on the ground rather
  than the middle, so it lands instead of floating
- `spawning` pops in from a dot with an overshoot; `powering-down` shrinks away and holds
- `alerting` and `scared` jitter on two incommensurate waves, so they read as nervous
  rather than metronomic
- `idle` just breathes, ±1.4%

The `motion` prop scales all of it (`0` holds the body still). It defaults to off when the
viewer's OS asks for reduced motion.

## Effects

Three more layers, all shape-agnostic, all driven imperatively from the frame loop rather
than React state — a celebrate burst is 16 elements changing every frame, and a page showing
every state at once would otherwise re-render continuously.

**Confetti** (`celebrate`, `excited`, `laughing`) launches from a ring at the body's rim
rather than from its centre, so a burst frames the face instead of covering it. Travel is
deliberately bounded: the viewBox carries only 15 units of margin, so a piece thrown much
past ~130 from centre would be clipped mid-flight.

**Ribbons** (`orbit`, `radar`, `progress`, `loading`, `uploading`, `sending`, `receiving`)
sweep around the body on their own periods and directions, drawn *behind* it so they duck
out of sight as they pass.

**Glyphs** (`alerting`, `notifying`, `confused`) replace the mascot with a symbol — `!` or
`?` — painted in the body's own gradient, scaling up as the body fades out so the swap reads
as a transformation rather than a cut. The glyph rides the body's motion, so an alerting
mascot's `!` jitters too.

`effects` and `glyphs` props turn each off. Both are baked into exports.

## Limits

- Clip regions come from *filled* shapes. Outline-only artwork (everything `fill="none"`)
  has no area to clip against, and the importer says so.
- `<use>` references and CSS `<style>` blocks are dropped rather than resolved.
- Recolouring with a gradient flattens multi-colour artwork to one ramp. Turn it off to keep
  the original fills.

## Credits

The face engine — the 25 expression outlines, the state pools and their cadences, the
spring morph and the spherical eye projection — is derived from Sébastien Montlouis-Calixte's
GrokBot reverse-engineering prototype:

<https://gist.github.com/smontlouis/49a4c9303de70118a90dc43badc1aba5>

That gist carries no explicit licence, so treat the expression data as the author's work.

Added on top of it here: the mouth system, the gaze/shape split that makes a resting mascot
look forward, the distance-field fitting solver, the SVG importer and sanitizer, and the
component exporter.
