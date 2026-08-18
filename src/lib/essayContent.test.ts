import { describe, expect, it } from 'vitest'
import { loadMeta, parseFrontmatter, splitParagraphs } from './essayContent'

describe('essay content', () => {
  it('meta has eyebrow, title, and at least one non-empty subtitle paragraph', () => {
    const meta = loadMeta()
    expect(meta.eyebrow).toBeTruthy()
    expect(meta.title).toBeTruthy()
    expect(meta.subtitle.length).toBeGreaterThan(0)
    expect(meta.subtitle.join(' ').trim().length).toBeGreaterThan(40)
  })

  it('meta subtitle paragraphs are each non-empty (no stray blank-line runs)', () => {
    // splitParagraphs already drops empties, so this mainly guards against a
    // future change reintroducing whitespace-only "paragraphs".
    for (const p of loadMeta().subtitle) expect(p.trim().length).toBeGreaterThan(0)
  })

  // meta.md's body is the essay's CMS-editable prose (a markdown widget in
  // the admin), but it renders through InlineText, which supports ONLY
  // **bold**/*italic* — headings, links, and raw HTML would ship as literal
  // visible text on the landing act. These guards moved here from the
  // deleted sections collection, which used to own the essay-prose role.
  it('meta paragraphs contain no raw HTML tags', () => {
    const rawHtml = /<(?![a-z][a-z0-9+.-]*:\/\/|[^\s@<>]+@)[a-zA-Z!/][^>]*>/
    for (const p of loadMeta().subtitle) expect(p).not.toMatch(rawHtml)
  })

  it('meta paragraphs contain no ATX headings', () => {
    for (const p of loadMeta().subtitle) expect(p).not.toMatch(/^#{1,6} /m)
  })

  it('meta paragraphs contain no markdown links (InlineText renders them literally)', () => {
    for (const p of loadMeta().subtitle) expect(p).not.toMatch(/\[[^\]]*\]\([^)]*\)/)
  })
})

describe('splitParagraphs', () => {
  it('keeps a single-paragraph body as one element', () => {
    expect(splitParagraphs('One paragraph, no blank line.')).toEqual(['One paragraph, no blank line.'])
  })

  it('splits on a blank line into two paragraphs', () => {
    expect(splitParagraphs('First.\n\nSecond.')).toEqual(['First.', 'Second.'])
  })

  it('splits on a whitespace-only blank line (CMS editors sometimes leave trailing spaces)', () => {
    expect(splitParagraphs('First.\n  \nSecond.')).toEqual(['First.', 'Second.'])
  })

  it('trims each paragraph and drops empty ones from runs of blank lines', () => {
    expect(splitParagraphs('  First.  \n\n\n\n  Second.  ')).toEqual(['First.', 'Second.'])
  })

  it('empty input yields no paragraphs', () => {
    expect(splitParagraphs('')).toEqual([])
    expect(splitParagraphs('   ')).toEqual([])
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
