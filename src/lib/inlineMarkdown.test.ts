import { describe, expect, it } from 'vitest'
import { parseInline } from './inlineMarkdown'

describe('parseInline', () => {
  it('plain text with no formatting passes through as one text node', () => {
    expect(parseInline('just words')).toEqual([{ type: 'text', text: 'just words' }])
  })

  it('parses a bold span', () => {
    expect(parseInline('a **bold** word')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', text: 'bold' },
      { type: 'text', text: ' word' },
    ])
  })

  it('parses an italic span', () => {
    expect(parseInline('a *italic* word')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'italic', text: 'italic' },
      { type: 'text', text: ' word' },
    ])
  })

  it('parses bold and italic in the same string', () => {
    expect(parseInline('**bold** then *italic*')).toEqual([
      { type: 'bold', text: 'bold' },
      { type: 'text', text: ' then ' },
      { type: 'italic', text: 'italic' },
    ])
  })

  it('parses adjacent spans with no text between them', () => {
    expect(parseInline('**bold***italic*')).toEqual([
      { type: 'bold', text: 'bold' },
      { type: 'italic', text: 'italic' },
    ])
  })

  it('a span at the very start or end has no surrounding empty text node', () => {
    expect(parseInline('**bold** at start')).toEqual([
      { type: 'bold', text: 'bold' },
      { type: 'text', text: ' at start' },
    ])
    expect(parseInline('ends in *italic*')).toEqual([
      { type: 'text', text: 'ends in ' },
      { type: 'italic', text: 'italic' },
    ])
  })

  it('an unmatched lone asterisk stays literal text rather than swallowing the rest', () => {
    expect(parseInline('a * lone star')).toEqual([{ type: 'text', text: 'a * lone star' }])
  })

  it('empty string yields no nodes', () => {
    expect(parseInline('')).toEqual([])
  })

  it('does not treat curly quotes as formatting delimiters', () => {
    const text = 'why ‘exactly’ people do the things they do'
    expect(parseInline(text)).toEqual([{ type: 'text', text }])
  })
})
