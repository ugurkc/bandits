/**
 * Identity key for "the world the reader is currently pitching against" —
 * the scenario plus the exact pitch text. PitchPhase's async score() guard
 * compares one of these captured at request time against one kept in sync
 * on every render, to discard a result that resolves after the reader has
 * since cycled the scenario or edited a box.
 *
 * A single shared function, not two independently-written `.join(' ')`
 * calls: on 2026-08-19 those diverged (one used `.join('\0')`, a corrupted
 * byte) and the two keys could then never be equal, so the guard discarded
 * every scoring result forever — the pitch phase silently stopped working
 * with no error, console message, or failing test, because no test could
 * see it (component files aren't unit-tested here; see vite.config.ts's
 * `.test.ts`-only include). One function makes that specific divergence
 * structurally impossible.
 */
export function pitchRequestKey(scenarioId: string, pitches: readonly string[]): string {
  return `${scenarioId} ${pitches.join(' ')}`
}
