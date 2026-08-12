import { describe, expect, it } from 'vitest'
import { loadMeta, loadSections, parseFrontmatter, parseSection } from './essayContent'

describe('essay content', () => {
  const sections = loadSections()

  it('loads at least one section, sorted by order', () => {
    expect(sections.length).toBeGreaterThan(0)
    const orders = sections.map((s) => s.order)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
  })

  it('orders are unique finite numbers', () => {
    const orders = sections.map((s) => s.order)
    expect(new Set(orders).size).toBe(orders.length)
    for (const o of orders) expect(Number.isFinite(o)).toBe(true)
  })

  it('ids are unique and url-safe', () => {
    const ids = sections.map((s) => s.id).filter(Boolean) as string[]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/)
  })

  it('every section with a sidebar label has an anchor id', () => {
    for (const s of sections) {
      if (s.label) expect(s.id, `section order ${s.order} has label but no id`).toBeTruthy()
    }
  })

  it('bodies are non-empty prose', () => {
    for (const s of sections) expect(s.body.trim().length, `order ${s.order}`).toBeGreaterThan(40)
  })

  it('meta has eyebrow, title, and subtitle body', () => {
    const meta = loadMeta()
    expect(meta.eyebrow).toBeTruthy()
    expect(meta.title).toBeTruthy()
    expect(meta.subtitle.trim().length).toBeGreaterThan(40)
  })

  it('meta subtitle is a single paragraph', () => {
    // a blank line (e.g. added by a CMS editor) would render multiple p.subtitle elements
    expect(loadMeta().subtitle).not.toMatch(/\n[ \t]*\n/)
  })

  it('bodies contain no raw HTML tags', () => {
    // react-markdown escapes raw HTML — a tag in a body renders as visible
    // literal text rather than markup. Commonmark autolinks (<https://…>,
    // <me@example.com>) are valid markdown and stay allowed.
    const rawHtml = /<(?![a-z][a-z0-9+.-]*:\/\/|[^\s@<>]+@)[a-zA-Z!/][^>]*>/
    for (const s of sections) expect(s.body, `order ${s.order}`).not.toMatch(rawHtml)
  })

  it('bodies contain no ATX headings', () => {
    // headings live in frontmatter only
    for (const s of sections) expect(s.body, `order ${s.order}`).not.toMatch(/^#{1,6} /m)
  })
})

describe('parseFrontmatter (CMS-written files)', () => {
  const cases: Array<{ name: string; raw: string; want: Record<string, string> }> = [
    {
      name: 'fully double-quoted values',
      raw: '---\nheading: "Try it: build your own player lifecycle"\n---\nbody',
      want: { heading: 'Try it: build your own player lifecycle' },
    },
    {
      name: 'escaped internal double quotes are unescaped',
      raw: '---\nheading: "The \\"sticky\\" state"\n---\nbody',
      want: { heading: 'The "sticky" state' },
    },
    {
      name: "single-quoted value with '' escape",
      raw: "---\nlabel: 'it''s a label'\n---\nbody",
      want: { label: "it's a label" },
    },
    {
      name: 'unquoted scalar ending in a quote char is kept intact',
      raw: '---\nheading: they said "go"\n---\nbody',
      want: { heading: 'they said "go"' },
    },
    {
      name: 'trailing space after closing quote',
      raw: '---\nheading: "States" \n---\nbody',
      want: { heading: 'States' },
    },
    {
      name: 'CRLF frontmatter',
      raw: '---\r\nheading: "Steady state: modeling win-back"\r\norder: 6\r\n---\r\nbody line',
      want: { heading: 'Steady state: modeling win-back', order: '6' },
    },
    {
      name: 'quoted numeric scalar stays a string attr',
      raw: '---\norder: "2"\n---\nbody',
      want: { order: '2' },
    },
    {
      name: 'explicit empty string value',
      raw: '---\nid: ""\n---\nbody',
      want: { id: '' },
    },
  ]

  for (const c of cases) {
    it(c.name, () => {
      const { attrs } = parseFrontmatter(c.raw)
      for (const [k, v] of Object.entries(c.want)) expect(attrs[k], k).toBe(v)
    })
  }
})

describe('parseSection (CMS-written files)', () => {
  it('quoted numeric order parses to a number', () => {
    expect(parseSection('---\norder: "2"\n---\nbody').order).toBe(2)
  })

  it('empty order yields NaN, not 0', () => {
    // Number('') is 0, which would silently sort an emptied order to the top
    expect(Number.isNaN(parseSection('---\norder:\nid: x\n---\nSome body').order)).toBe(true)
  })

  it('empty id maps to undefined', () => {
    expect(parseSection('---\norder: 1\nid: ""\n---\nbody').id).toBeUndefined()
  })
})
