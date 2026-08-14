import { defineConfig } from 'vitest/config'

/*
  jsdom, because the importer's whole job is DOM work — parse, sanitize, namespace. It has
  no getBBox, so measureFit falls through to its viewBox path; the fixtures declare one, and
  the tests assert on the warning that fall-through produces rather than pretending it
  didn't happen.

  The distance-field and solver tests need no DOM at all: they build a mask by hand and go
  in through fieldFromMask, skipping the rasterise step that would need a canvas.
*/
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
