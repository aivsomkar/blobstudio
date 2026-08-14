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
npm test         # geometry, solver, importer, persistence
npm run check    # engine freshness + lint + tests + build, same as CI
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
src/state/project.ts        what persists between visits, and the .blobstudio.json file
src/export/generate.ts      assemble the downloadable .tsx
src/export/snapshot.ts      Photo Mode — the live frame, serialized
src/shapes/builtin.ts       nine parametric starting shapes
src/ui/                     dropzone, shape, head, fit, colour, expressions, your states,
                            photo, export, project
scripts/gen-engine.cjs         regenerates the engine from the GrokBot lab
scripts/engine-effects.part.tsx  confetti, comets, glyphs
scripts/engine-life.part.tsx     micro-saccades
scripts/engine-sequence.part.tsx custom-state playback
```

`npm run gen:engine:check` regenerates into memory and compares against the committed
engine without writing. It runs first in `npm run check` and in CI, because a stale engine
is otherwise silent: the preview and the export both come from it, so they agree with each
other while disagreeing with the lab they claim to be generated from.

## What is kept

Your shape, fit, gaze, colours and toggles autosave to this browser as you work, so a
reload lands you back where you were. The distance field is not stored — it is a megabyte
of derived data, and the solver rebuilds it inside a frame. An upload keeps its original
file text rather than the sanitized result, so restoring replays the whole import path and
markup that has been sitting in localStorage gets re-sanitized rather than trusted because
it was clean once. Reads are defensive per field: a corrupted gaze costs you a gaze, not the
artwork you spent ten minutes fitting.

One consequence worth naming: the **Effects**, **Glyphs** and **Life** toggles persist too.
They used to reset on every reload, so a stray click healed itself; now it follows you. Since
17 of the 40 states draw something extra — and body motion at zero suppresses effects as well,
because a burst thrown from a still body reads as debris — the stage says when a switch is
hiding something, and offers to undo it.

**Download project** writes the same object as `<name>.blobstudio.json`. That is the backup —
clearing site data takes the stored copy with it — and the way a mascot moves between
machines. An SVG too large for the storage quota is dropped from the autosave rather than
failing it, and the panel says so.

## Your own states

The 40 built-in states pick from a pool at random on a cadence, which is what makes a mood
look unscripted. It is exactly wrong for a scripted beat — "look up, pause, nod" — where the
order *is* the content, and it is the only thing on offer if your app needs a `syncing` state
the lab never authored.

**Your states** is the other tool: ordered steps, each with its own hold, morph time and
transition feel (`smooth`, `spring`, `snappy`), played `loop`, `once` or `pingPong`, with its
own blink cadence and optionally another state's body motion borrowed by name.

They travel with the export. Each becomes an entry in `SEQUENCES`, keyed by a slug of its
name, and the recipient plays one by name:

```tsx
<RoboAvatar sequenceName="greeting" size={160} />
```

Steps reference an expression by index, because that is the only identity the expressions
have — the 25 outlines are generated into the engine as an ordered table, not authored in the
studio. A step pointing past the end of that table is dropped on load rather than wrapped to
a face nobody chose.

Ping-pong turns around at the ends without repeating them, so a three-step state reads
0,1,2,1,0 — repeating an endpoint holds it for double time and reads as a stumble.

## Eye life

Between expression changes the eyes used to be perfectly motionless, which is uncanny in a
way that is hard to name and easy to feel. **Life** adds micro-saccades: small ballistic
jumps a few times a second — fast in, slow out — with a little drift while held.

Three properties it has to have, and does:

- **Eyes only.** `gaze` moves the whole face, because a deliberate look turns the head with
  it. A saccade is the eyes alone moving inside a face that stays put.
- **Desynchronised.** Seeded per component instance, not per expression, because the state
  grid puts forty mascots on screen and forty eyes twitching on the same frame reads as the
  page stuttering.
- **Paid for in the fit.** The solver widens every eye point's required clearance by the
  saccade radius, so the clipping report stays true. This costs face size on tight
  silhouettes — that is the honest price of live eyes, and turning **Life** off refits
  larger.

Scaled by `motion`, so `motion={0}` and a reduced-motion preference still hold perfectly
still.

## Photo Mode

The library export renders stills from geometry, which is right for a catalogue: with no
turn, gaze or blink an expression collapses to two eye rings and a mouth. It is the wrong
tool for "grab this exact instant", because everything worth catching mid-animation — a
comet halfway round its ring, a landing squash, confetti in flight — lives in attributes the
frame loop writes imperatively.

So **Photo** serializes the live `<svg>` out of the DOM instead, at 256/512/1024 as SVG or
PNG, over a transparent, solid, linear or radial background. **Hold the frame** freezes the
stage so you can catch a specific instant rather than gambling on the click.

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

## Turning the head

`turn` rotates the head in degrees. The eyes and mouth travel around the implied sphere,
foreshortening as they approach the limb and disappearing once they pass it, which is what
makes a spin read as a face on a ball rather than a face sliding sideways. `spin()` on the
imperative handle runs a full revolution.

`eyeScale` takes a number for both eyes, or `{ left: [w, h], right: [w, h] }` to size each on
its own. Which path is the left eye is decided by where it sits, not by which was authored
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
