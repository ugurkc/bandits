import { describe, expect, it } from 'vitest'
import { pitchRequestKey } from './pitchRequestKey'

describe('pitchRequestKey', () => {
  it('is stable for the same scenario and pitches', () => {
    const a = pitchRequestKey('s1', ['one', 'two', 'three'])
    const b = pitchRequestKey('s1', ['one', 'two', 'three'])
    expect(a).toBe(b)
  })

  it('differs when the scenario changes', () => {
    const a = pitchRequestKey('s1', ['one', 'two', 'three'])
    const b = pitchRequestKey('s2', ['one', 'two', 'three'])
    expect(a).not.toBe(b)
  })

  it('differs when any pitch text changes', () => {
    const a = pitchRequestKey('s1', ['one', 'two', 'three'])
    const b = pitchRequestKey('s1', ['one', 'TWO', 'three'])
    expect(a).not.toBe(b)
  })

  it('never contains a NUL byte, whatever the input', () => {
    // Regression guard: this is exactly the class of bug that broke "Score
    // my pitches" in production — a corrupted join separator made two
    // independently-computed keys permanently unequal.
    const key = pitchRequestKey('extraction-shooter', [
      'Prove yourself.',
      'Queue in alone.',
      'A world worth exploring.',
    ])
    expect(key).not.toContain('\0')
  })
})
