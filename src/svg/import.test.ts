import { describe, expect, it } from 'vitest'
import { importSvg, SvgImportError } from './import'

/*
  This is the security boundary. Everything the importer returns is rendered inline via
  dangerouslySetInnerHTML, from a file a stranger chose, so "it looked fine when I tried it"
  is not a standard these tests are willing to meet.

  jsdom has no getBBox, so every fixture declares a viewBox and the importer takes its
  documented fallback path. That is a property of the test environment rather than of the
  importer; the sanitizer and the clip flattener are unaffected by which path measured them.
*/

const wrap = (body: string, attrs = 'viewBox="0 0 100 100"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`

const parse = (body: string, attrs?: string) => importSvg(wrap(body, attrs), 'Test')

describe('sanitizing', () => {
  it('drops script elements', () => {
    const result = parse('<script>alert(1)</script><circle cx="50" cy="50" r="40" fill="#000"/>')
    expect(result.body).not.toContain('script')
    expect(result.body).not.toContain('alert')
  })

  it('drops a script nested inside allowed elements', () => {
    const result = parse(
      '<g><defs><script>alert(1)</script></defs><circle cx="50" cy="50" r="40" fill="#000"/></g>'
    )
    expect(result.body).not.toContain('alert')
  })

  it('drops event handler attributes wherever they appear', () => {
    const result = parse(
      '<circle cx="50" cy="50" r="40" fill="#000" onload="alert(1)" onclick="alert(2)"/>'
    )
    expect(result.body).not.toContain('onload')
    expect(result.body).not.toContain('onclick')
    expect(result.body).not.toContain('alert')
  })

  it('drops event handlers regardless of attribute case', () => {
    const result = parse('<circle cx="50" cy="50" r="40" fill="#000" ONLOAD="alert(1)"/>')
    expect(result.body.toLowerCase()).not.toContain('onload')
  })

  it('drops foreignObject, image and style', () => {
    const result = parse(
      '<foreignObject width="10" height="10"></foreignObject>' +
        '<image href="https://example.com/x.png"/>' +
        '<style>* { fill: red }</style>' +
        '<circle cx="50" cy="50" r="40" fill="#000"/>'
    )
    expect(result.body).not.toContain('foreignObject')
    expect(result.body).not.toContain('<image')
    expect(result.body).not.toContain('<style')
  })

  it('strips external href but keeps same-document references', () => {
    const result = parse(
      '<defs><circle id="dot" cx="10" cy="10" r="5" fill="#000"/></defs>' +
        '<use href="#dot"/>' +
        '<use href="https://example.com/evil.svg#x"/>'
    )
    // The local reference survives, carrying its namespaced id.
    expect(result.body).toMatch(/href="#[a-z0-9]+-dot"/)
    expect(result.body).not.toContain('example.com')
  })

  it('neutralises external url() inside a style attribute', () => {
    const result = parse(
      '<circle cx="50" cy="50" r="40" style="fill:url(https://example.com/x#g)"/>'
    )
    expect(result.body).not.toContain('example.com')
  })

  it('leaves an in-document url() in a style attribute alone', () => {
    const result = parse(
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>' +
        '<circle cx="50" cy="50" r="40" style="fill:url(#g)"/>'
    )
    expect(result.body).toMatch(/url\(#[a-z0-9]+-g\)/)
  })

  it('reports what it removed', () => {
    const result = parse('<script>alert(1)</script><circle cx="50" cy="50" r="40" fill="#000"/>')
    expect(result.warnings.join(' ')).toContain('Removed for safety')
  })
})

describe('namespacing', () => {
  it('rewrites ids and the references that point at them', () => {
    const result = parse(
      '<defs><linearGradient id="grad"><stop offset="0" stop-color="#000"/></linearGradient></defs>' +
        '<circle cx="50" cy="50" r="40" fill="url(#grad)"/>'
    )
    expect(result.body).not.toMatch(/id="grad"/)
    expect(result.body).toMatch(/id="[a-z0-9]+-grad"/)
    const id = result.body.match(/id="([a-z0-9]+-grad)"/)![1]
    expect(result.body).toContain(`url(#${id})`)
  })

  it('gives two imports of the same file different prefixes', () => {
    const markup = '<defs><linearGradient id="grad"/></defs><circle cx="5" cy="5" r="4" fill="#000"/>'
    const first = parse(markup).body.match(/id="([a-z0-9]+)-grad"/)![1]
    const second = parse(markup).body.match(/id="([a-z0-9]+)-grad"/)![1]
    expect(first).not.toBe(second)
  })
})

describe('clip flattening', () => {
  it('emits geometry at top level with ancestor transforms composed on', () => {
    const result = parse(
      '<g transform="translate(10 0)"><g transform="scale(2)">' +
        '<rect x="0" y="0" width="10" height="10" fill="#000"/>' +
        '</g></g>'
    )
    expect(result.clip).toContain('<rect')
    expect(result.clip).not.toContain('<g')
    expect(result.clip).toContain('translate(10 0) scale(2)')
  })

  it('drops paint attributes, which mean nothing inside a clipPath', () => {
    const result = parse('<rect x="0" y="0" width="10" height="10" fill="#f00" stroke="#0f0"/>')
    expect(result.clip).not.toContain('fill')
    expect(result.clip).not.toContain('stroke')
  })

  it('skips unfilled shapes and says the artwork has no clip region', () => {
    const result = parse('<rect x="0" y="0" width="10" height="10" fill="none"/>')
    expect(result.clip).toBe('')
    expect(result.warnings.join(' ')).toContain('No filled shapes')
  })

  it('treats fill="none" on an ancestor as inherited', () => {
    const result = parse('<g fill="none"><rect x="0" y="0" width="10" height="10"/></g>')
    expect(result.clip).toBe('')
  })
})

describe('rejection', () => {
  it('rejects markup that is not SVG', () => {
    expect(() => importSvg('<html><body>hello</body></html>', 'Test')).toThrow(SvgImportError)
  })

  it('rejects XML that does not parse', () => {
    expect(() => importSvg('<svg><circle</svg>', 'Test')).toThrow(SvgImportError)
  })

  it('rejects an SVG with nothing measurable', () => {
    // No viewBox and no measurable content: neither the bbox nor the fallback can place it.
    expect(() => importSvg('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'Test')).toThrow(
      SvgImportError
    )
  })
})

describe('fitting', () => {
  it('produces a transform that maps the artwork into the face box', () => {
    const result = parse('<rect x="0" y="0" width="100" height="100" fill="#000"/>')
    expect(result.fit).toMatch(/^translate\([-\d. ]+\) scale\([\d.]+\)$/)
  })
})
