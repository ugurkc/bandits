import { describe, expect, it } from 'vitest'
import { LABEL_MAX_CHARS, pitchLabel } from './labels'

describe('pitchLabel', () => {
  it('keeps short pitches verbatim', () => {
    expect(pitchLabel('Solo queue', 0)).toBe('Solo queue')
  })

  it('truncates long pitches at a word boundary with an ellipsis', () => {
    const label = pitchLabel(
      'A guided training mode with bot matches and post-game tips',
      0,
    )
    expect(label.endsWith('…')).toBe(true)
    expect(label.length).toBeLessThanOrEqual(LABEL_MAX_CHARS + 1)
    expect(label).toBe('A guided training mode…')
  })

  it('collapses whitespace', () => {
    expect(pitchLabel('  Solo   queue \n now ', 0)).toBe('Solo queue now')
  })

  it('falls back to a numbered label for empty text', () => {
    expect(pitchLabel('   ', 2)).toBe('Pitch 3')
  })
})
