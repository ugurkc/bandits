/**
 * Minimal, dependency-free inline formatting for essay prose: **bold** and
 * *italic* spans only — no links, no nested emphasis, no block-level
 * syntax. The content pipeline otherwise renders plain text (see
 * essayContent.ts's guards against raw HTML and ATX headings), so this is
 * intentionally small rather than pulling in a markdown parser dependency.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }

// Bold matched first so "**x**" isn't seen as an empty italic span followed
// by stray asterisks; both spans require non-empty, non-'*' content so an
// unmatched lone "*" (e.g. a typo) is left as literal text rather than
// swallowing the rest of the paragraph.
const INLINE_RE = /\*\*([^*]+)\*\*|\*([^*]+)\*/g

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let lastIndex = 0
  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index
    if (index > lastIndex) nodes.push({ type: 'text', text: text.slice(lastIndex, index) })
    if (match[1] !== undefined) nodes.push({ type: 'bold', text: match[1] })
    else nodes.push({ type: 'italic', text: match[2] })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) nodes.push({ type: 'text', text: text.slice(lastIndex) })
  return nodes
}
