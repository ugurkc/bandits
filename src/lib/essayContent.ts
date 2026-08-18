import metaRaw from '../content/meta.md?raw'

export interface EssayMeta {
  eyebrow: string
  title: string
  /**
   * One or more paragraphs, split on a blank line. Act 0's intro renders
   * each as its own <p> and slots its images after specific paragraphs
   * (see Act0Intro), so a blank line in meta.md is how a CMS editor (or
   * this file, by hand) requests a break.
   */
  subtitle: string[]
}

/** Split on a blank line (optionally whitespace-only); trims and drops empties. */
export function splitParagraphs(body: string): string[] {
  return body
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
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

export function loadMeta(): EssayMeta {
  const { attrs, body } = parseFrontmatter(metaRaw)
  return { eyebrow: attrs.eyebrow ?? '', title: attrs.title ?? '', subtitle: splitParagraphs(body) }
}
