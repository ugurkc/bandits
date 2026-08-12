/** Max characters an arm label takes from a pitch before truncating. */
export const LABEL_MAX_CHARS = 26

/**
 * Derive an arm label from a free-text pitch: the first words, cut at a word
 * boundary within LABEL_MAX_CHARS, with an ellipsis when truncated. Falls
 * back to "Pitch N" for effectively-empty text.
 */
export function pitchLabel(pitch: string, index: number): string {
  const compact = pitch.trim().replace(/\s+/g, ' ')
  if (compact.length === 0) return `Pitch ${index + 1}`
  if (compact.length <= LABEL_MAX_CHARS) return compact
  const cut = compact.slice(0, LABEL_MAX_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 8 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
