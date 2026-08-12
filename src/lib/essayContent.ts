import metaRaw from '../content/meta.md?raw'

export interface EssaySection {
  order: number
  id?: string
  label?: string
  heading?: string
  body: string
}

export interface EssayMeta {
  eyebrow: string
  title: string
  subtitle: string
}

export function parseFrontmatter(raw: string): { attrs: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { attrs: {}, body: raw }
  const attrs: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    let v = kv[2].trim()
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) {
      const q = v[0]
      v = v.slice(1, -1)
      v = q === '"' ? v.replace(/\\(["\\])/g, '$1') : v.replace(/''/g, "'")
    }
    attrs[kv[1]] = v
  }
  return { attrs, body: m[2].trim() }
}

const sectionFiles = import.meta.glob('../content/sections/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export function parseSection(raw: string): EssaySection {
  const { attrs, body } = parseFrontmatter(raw)
  return {
    order: attrs.order?.trim() ? Number(attrs.order) : NaN,
    id: attrs.id || undefined,
    label: attrs.label || undefined,
    heading: attrs.heading || undefined,
    body,
  }
}

export function loadSections(): EssaySection[] {
  return Object.values(sectionFiles)
    .map(parseSection)
    .sort((a, b) => a.order - b.order)
}

export function loadMeta(): EssayMeta {
  const { attrs, body } = parseFrontmatter(metaRaw)
  return { eyebrow: attrs.eyebrow ?? '', title: attrs.title ?? '', subtitle: body }
}
