import { describe, expect, it } from 'vitest'
import { advancePlayhead, estimateOf, shareOf, SPEEDS } from './useSimulation'

/** A frame delta at a 60Hz refresh rate, in ms. */
const DT_60HZ = 1000 / 60

describe('advancePlayhead', () => {
  it('advances by speed rounds per second of elapsed wall time', () => {
    expect(advancePlayhead(0, 120, DT_60HZ, 5000)).toBeCloseTo(2)
    expect(advancePlayhead(10, 3000, DT_60HZ, 5000)).toBeCloseTo(60)
  })

  it('is refresh-rate independent: a 120Hz frame advances half as much', () => {
    expect(advancePlayhead(0, 120, 1000 / 120, 5000)).toBeCloseTo(1)
  })

  it('accumulates fractional rounds at slow speeds', () => {
    let pos = 0
    for (let frame = 0; frame < 60; frame++) pos = advancePlayhead(pos, 30, DT_60HZ, 5000)
    expect(pos).toBeCloseTo(30)
    // A single 60Hz frame at 30 rounds/sec moves half a round — the floor
    // (the displayed t) should only tick every other frame.
    expect(Math.floor(advancePlayhead(0, 30, DT_60HZ, 5000))).toBe(0)
  })

  it('clamps the frame delta to 100ms so a background-tab resume cannot jump', () => {
    expect(advancePlayhead(0, 3000, 5000, 20000)).toBeCloseTo(300)
    expect(advancePlayhead(0, 3000, 100, 20000)).toBeCloseTo(300)
  })

  it('clamps at the horizon', () => {
    expect(advancePlayhead(4999.9, 3000, DT_60HZ, 5000)).toBe(5000)
    expect(advancePlayhead(5000, 120, DT_60HZ, 5000)).toBe(5000)
  })

  it('reaches the horizon exactly for every speed', () => {
    for (const speed of SPEEDS) {
      let pos = 90
      for (let i = 0; i < 1000 && pos < 100; i++) pos = advancePlayhead(pos, speed, DT_60HZ, 100)
      expect(pos).toBe(100)
    }
  })
})

describe('shareOf', () => {
  it('is pulls over rounds played', () => {
    expect(shareOf(25, 100)).toBe(0.25)
    expect(shareOf(100, 100)).toBe(1)
  })

  it('is safe at t=0', () => {
    expect(shareOf(0, 0)).toBe(0)
  })
})

describe('estimateOf', () => {
  it('is successes over pulls', () => {
    expect(estimateOf(3, 10)).toBeCloseTo(0.3)
    expect(estimateOf(0, 10)).toBe(0)
  })

  it('is null before the first pull', () => {
    expect(estimateOf(0, 0)).toBeNull()
  })
})
