# Blob Studio

Drop in an SVG. It gets eyes, a mouth, 25 expressions and 40 moods — then leaves as a React
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
src/shapes/builtin.ts       nine parametric starting shapes
src/ui/                     dropzone, shape, head, fit, colour, expressions, states, export
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

## Gaze

Two different things aim the eyes, and they compose:

- **`lookAround`** is per-expression drift — how much of each expression's own baked-in
  look-direction to apply. It varies as expressions cycle.
- **`gaze`** is a constant aim on top of that, each axis −1…1. The studio's pad sets it; it
  defaults slightly right, because dead-centre eyes read as a stare rather than as
  attention.

The fit solver accounts for gaze, not just `lookAround`. Aiming the eyes at an edge moves
every point of every face toward it, so the clipping report has to include it or it would
claim a fit that anyone can see is wrong.

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

**Comets** (`orbit`, `radar`, `progress`, `loading`, `uploading`) circle the body on rings
that are tipped and rolled in 3D. Each is a filled outline rather than a stroke, because SVG
cannot taper a stroke and taper is most of what separates a comet from a hoop: a round head
thinning to a tail, with a gradient running its length. Every ring is cut at the horizon, so
a comet passes behind the mascot and comes back out in front — the near half draws over the
body, the far half under it. These states also sit the body back to about three quarters
size, which is what gives the rings room to clear the silhouette instead of scribbling
across its face.

**Comet dash** (`sending`, `receiving`) balls the mascot up into a dot and throws it along a
figure-eight with three tails strung out behind, mirrored between the two.

**Thinking dots** (`thinking-dots`) breaks the body apart into the three-dot loading
indicator every chat app has. The dots are not a separate picture that replaces the mascot —
the body shrinks toward the middle one while the outer two slide out from behind it, so what
you read is one thing dividing. The body runs on a shorter clock than the row, so it has
gone by the time the outer dots are still travelling. Run the state's clock back down to
zero and it plays in reverse: the row gathers and the body reforms.

**Pops** (`spawning`, `powering-down`) shed a few small copies of the body as it collapses to
a point or springs out of one.

**Badge** (`notifying`) lands an unread dot on the mascot's shoulder — it keeps its face,
because it is telling you about something rather than becoming it.

**Glyphs** (`alerting`, `notifying`, `confused`) replace the mascot with a symbol — `!` or
`?` — painted in the body's own gradient, scaling up as the body fades out so the swap reads
as a transformation rather than a cut. The glyph rides the body's motion, so an alerting
mascot's `!` jitters too.

`effects` and `glyphs` props turn each off. Both are baked into exports.

## Facing

`orientation` aims the head in three axes, in degrees — `y` turns, `x` nods, `z` rolls. The
face travels around the implied sphere: eyes and mouth move across the surface and
foreshorten as they near the limb, while the silhouette narrows by the cosine of each axis
the way a flat shape turning away would. Without that second half the eyes slide across a
body that never moves, which reads as a decal rather than a head. Past a quarter turn the
silhouette mirrors, because that is its back.

A longitude that has gone round the back is brought to the equivalent point on the near
side, so a turning head always has a face. A sphere painted on one hemisphere shows nothing
for half a revolution, which is correct and useless — a mascot with no face is a bug in
almost every situation it can find itself in. The handoff is invisible: both branches meet at
the limb, where the silhouette has flattened to a sliver and the eye has foreshortened to
nothing.

Drag the stage to aim it, or the gizmo's three beaded hoops for one axis at a time.

`eyeScale` takes a number for both eyes, or `{ left: [w, h], right: [w, h] }` to size each
on its own. Which path is the left eye is decided by where it sits, not by which was authored
first.

## The panel

- **Shape** — nine generated starting shapes, each with its own parameters, because the
  meaningful knobs differ: a cone has a tip and a base to round, a polygon has sides and
  corners, a circle has neither. Changing one re-imports and re-solves, debounced; the
  solver finishes inside a frame.
- **Scrubbable numbers** — drag a label to change its value, shift for fine, arrows to
  nudge, or type. A slider spends its width encoding a range, which a panel of a dozen
  values cannot afford.
- **Expressions** — all 25 as rendered faces rather than numbered chips, drawn from the live
  shape and colours so they stay honest, with any that clip ringed in red.
- **Dark stage** — a mascot reads differently on light and dark, and both ship.

## Downloading the library

The component on its own only helps a React project. **Download library (.zip)** packages
the mascot so it drops into anything:

```
<Name>Mascot/
  <Name>Avatar.tsx        the animated component — React its only dependency
  svg/states/*.svg        40 still frames, one per state
  svg/expressions/*.svg   25 still frames, one per expression
  svg/sprite.svg          every state as a <symbol>, for plain HTML
  png/*.png               optional, 256/512/1024, for anywhere vectors won't go
  manifest.json           states, groups, and which expression each rests on
  README.md               usage for React and non-React alike
```

The still frames are generated from the same geometry the live component uses, not
screenshotted: with no turn, gaze or blink the eye transform collapses to identity, so a
frame is just its two eye rings plus the mouth derived from them. Every file is
self-contained, so `<img src="svg/states/thinking.svg">` works with no other assets.

The archive is written by a small store-only ZIP writer (`src/export/zip.ts`) rather than a
zip dependency — it is about a hundred lines and keeps the project at zero runtime deps.

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
look forward, the distance-field fitting solver, the SVG importer and sanitizer, the
component exporter, three-axis head orientation, the comet and thinking-dots effects, and
the parametric starting shapes.
