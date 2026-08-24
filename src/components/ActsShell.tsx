import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACTS, actIndexFromHash } from '../acts'
import { buildExampleCampaigns } from '../lib/exampleCampaigns'
import { prefetchSemantic } from '../lib/similarity/semantic'
import { useCampaignQuarter } from '../state/useCampaignQuarter'
import { useSimulation } from '../state/useSimulation'
import { useTheme } from '../state/useTheme'
import { useTrialWeeks } from '../state/useTrialWeeks'
import { Act0Intro } from './Act0Intro'
import { Act1TrialError } from './Act1TrialError'
import type { Act1Mode } from './Act1TrialError'
import { Act2Regret } from './Act2Regret'
import { Act3Rationing } from './Act3Rationing'
import { Act4Lab } from './Act4Lab'
import type { PitchOutcome } from './PitchPhase'
import { ThemeToggle } from './ThemeToggle'
import './acts.css'

/**
 * useTrialWeeks/useCampaignQuarter must be called unconditionally (rules of
 * hooks), but they only mean anything once rates exist — this stable
 * placeholder keeps the pilot harmless before a pitch is scored, and its
 * rewind-on-rates-change logic swaps it out for the real rates the moment
 * scoring happens. (The quarter never sees it: Act III self-seeds with
 * example campaigns instead.)
 */
const NO_OUTCOME_RATES = [0.05, 0.05, 0.05]

/**
 * The acts shell: owns the act index (hash-synced, so acts deep-link and the
 * browser's back/forward move between them), the horizontal navigation bar,
 * and ALL cross-act state — the pitch outcome, both simulations, the pilot
 * and the quarter. State lives here precisely so moving left and right
 * between acts never resets anyone's progress: the act components are pure
 * views over this state and can unmount freely.
 */
export function ActsShell() {
  const [theme, setTheme] = useTheme()

  // --- Act navigation (hash-synced) --------------------------------------
  // One atomic state for index + slide direction, so a nav can't render with
  // a stale direction. Direction drives the panel's enter animation only.
  const [nav, setNav] = useState(() => ({
    act: actIndexFromHash(window.location.hash),
    dir: null as 'left' | 'right' | null,
  }))
  const act = nav.act

  const goToAct = useCallback((i: number) => {
    setNav((prev) => (i === prev.act ? prev : { act: i, dir: i > prev.act ? 'right' : 'left' }))
  }, [])

  // Browser back/forward (and hand-edited hashes) drive the same navigation.
  useEffect(() => {
    const onHashChange = () => goToAct(actIndexFromHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [goToAct])

  // State → hash. The comparison is by ACT IDENTITY, not string identity:
  // the bare URL ('') and any foreign hash already map to act 0, so landing
  // on — or Back-navigating to — such an entry never pushes a spurious
  // '#act-0' on top of it (which would truncate the forward stack and eat a
  // Back press). It also makes the effect idempotent under StrictMode's
  // double-invoke. Assigning location.hash pushes a history entry — that's
  // what makes back/forward walk the acts.
  useEffect(() => {
    if (actIndexFromHash(window.location.hash) === act) return
    window.location.hash = `#${ACTS[act].hash}`
  }, [act])

  // Warm the ~23MB semantic scoring model from the moment the site loads —
  // the whole time a reader spends in Act 0's prose is download headroom the
  // pitch phase used to get for free when it mounted at page load.
  // Idempotent; the lexical fallback still covers a cold cache.
  //
  // Skipped on metered or slow connections: this is a SPECULATIVE fetch for a
  // feature the reader may never reach (Act I's own "skip to the lab" button
  // exists precisely to bypass it), and 23MB of speculation on a phone plan
  // is not a trade worth making silently. PitchPhase asks again, unguarded,
  // once the reader actually arrives where the model is needed.
  useEffect(() => {
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    if (conn?.saveData) return
    if (conn?.effectiveType && /2g$/.test(conn.effectiveType)) return
    prefetchSemantic()
  }, [])

  // --- Announcements + focus at the act seam -----------------------------
  // One always-mounted polite live region for the whole shell (act changes
  // AND the act-internal seams announce through it), so a view swap can
  // never tear the region out from under its own announcement.
  const [announcement, setAnnouncement] = useState('')
  const announce = useCallback((message: string) => setAnnouncement(message), [])

  const panelRef = useRef<HTMLDivElement>(null)
  const prevActRef = useRef(act)
  useEffect(() => {
    if (prevActRef.current === act) return
    prevActRef.current = act
    // A navigation from a scrolled position would otherwise land the reader
    // mid-page in the incoming act (focus() alone doesn't scroll — the
    // panel is taller than the viewport and already partially visible).
    window.scrollTo({ top: 0 })
    panelRef.current?.focus({ preventScroll: true })
    announce(`${ACTS[act].num}: ${ACTS[act].title}`)
  }, [act, announce])

  // --- Cross-act state ---------------------------------------------------
  // Act II's race simulation (pitch-derived rates once scored); its seed
  // also anchors Act I's pilot and Act III's quarter.
  const sim = useSimulation()
  // Act IV's free-play lab — its own independent simulation, so tuning the
  // lab never disturbs the pitch-derived race and vice versa.
  const labSim = useSimulation()

  const [act1Mode, setAct1Mode] = useState<Act1Mode>('pitch')
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [pitchOutcome, setPitchOutcome] = useState<PitchOutcome | null>(null)
  // In-progress pitch text lives HERE, not in PitchPhase — act navigation
  // unmounts the act panels, and typed-but-unscored prose is exactly the
  // kind of progress the shell exists to protect.
  const [draftPitches, setDraftPitches] = useState<string[]>(['', '', ''])

  const trial = useTrialWeeks(pitchOutcome?.rates ?? NO_OUTCOME_RATES, sim.config.seed)

  // Act III self-seeds when the reader hasn't pitched: a scenario's example
  // pitches, scored through the same pipeline (see the module doc). The
  // example scenario tracks Act I's "try another scenario" cycling ONLY
  // while the quarter is untouched — a half-played quarter's rates identity
  // must not change under it (the (rates, seed) rewind contract would wipe
  // its played weeks) just because the reader browsed briefs in Act I.
  const [exampleIndex, setExampleIndex] = useState(0)
  const example = useMemo(
    () => buildExampleCampaigns(exampleIndex, sim.config.seed),
    [exampleIndex, sim.config.seed],
  )
  const usingExample = pitchOutcome === null
  const campaignRates = pitchOutcome?.rates ?? example.rates
  const campaignLabels = pitchOutcome?.labels ?? example.labels
  const quarter = useCampaignQuarter(campaignRates, sim.config.seed, act === 3)

  const quarterUntouched = quarter.weeks.length === 0
  useEffect(() => {
    // Never re-pin while the reader is looking at Act III. "Restart the
    // quarter" empties `weeks`, which makes `quarterUntouched` true again —
    // so if they had cycled the brief in Act I at any point, a restart would
    // silently deal them three different campaigns at different hidden rates
    // while the announcement only said "back to week 1". A restart has to be
    // a rematch of the same game.
    if (act === 3) return
    if (quarterUntouched && exampleIndex !== scenarioIndex) setExampleIndex(scenarioIndex)
  }, [act, quarterUntouched, exampleIndex, scenarioIndex])

  // A simulation playing in a hidden act would keep its rAF loop re-rendering
  // the whole shell every frame and silently finish its race offscreen —
  // pause it at the seam (the reader resumes with one click on return).
  useEffect(() => {
    if (act !== 2 && sim.playing) sim.playPause()
    if (act !== 4 && labSim.playing) labSim.playPause()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on act change only
  }, [act])

  const handleScored = useCallback(
    (outcome: PitchOutcome) => {
      setPitchOutcome(outcome)
      sim.applyPitchRates(outcome.rates)
      // Drift would random-walk the race's rates away from the pitch-derived
      // values while the reveal still presents fixed "% match" figures as
      // their source — the toggle is hidden in pitch mode (Controls), and
      // any previously-enabled drift is switched off here for the same
      // reason.
      sim.setDrift(false)
      setAct1Mode('trial')
    },
    [sim],
  )

  const backToPitches = useCallback(() => {
    sim.reset()
    trial.reset()
    setAct1Mode('pitch')
  }, [sim, trial])

  return (
    <div className="page">
      <ThemeToggle
        theme={theme}
        onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      />

      <nav className="an-bar" aria-label="Acts">
        <button
          type="button"
          className="an-arrow"
          onClick={() => goToAct(act - 1)}
          disabled={act === 0}
          aria-label="Previous act"
        >
          ←
        </button>
        <ol className="an-tabs">
          {ACTS.map((a, i) => (
            <li key={a.hash} className="an-tabs-item">
              <button
                type="button"
                className={`an-tab${i === act ? ' an-tab--active' : ''}`}
                aria-current={i === act ? 'page' : undefined}
                onClick={() => goToAct(i)}
              >
                <span className="an-tab-num">{a.num}</span>
                <span className="an-tab-title">{a.title}</span>
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="an-arrow"
          onClick={() => goToAct(act + 1)}
          disabled={act === ACTS.length - 1}
          aria-label="Next act"
        >
          →
        </button>
      </nav>

      <main>
        {/* Keyed by act: a navigation remounts the panel, which re-triggers
            the direction-aware enter animation. Focus lands here (not on the
            first control) so screen-reader reading order starts at the top
            of the incoming act. */}
        <div
          key={act}
          ref={panelRef}
          tabIndex={-1}
          className={`an-panel${nav.dir ? ` an-panel--${nav.dir}` : ''}`}
        >
          {/* Acts I–IV had no h1 and no h2 — their headings started at h3, so
              a screen-reader user navigating by heading landed in an act with
              no top-level heading to orient from. Act 0 ships its own visible
              h1 (the essay title), so this only covers the rest. The text is
              the act metadata already shown in the nav, not new copy. */}
          {act !== 0 && (
            <h1 className="sr-only">{`${ACTS[act].num}: ${ACTS[act].title}`}</h1>
          )}
          {act === 0 && <Act0Intro onBegin={() => goToAct(1)} />}
          {act === 1 && (
            <section className="playground-section" aria-label="Act I: Trial and Error">
              <Act1TrialError
                sim={sim}
                mode={act1Mode}
                scenarioIndex={scenarioIndex}
                pitchOutcome={pitchOutcome}
                trial={trial}
                pitches={draftPitches}
                onPitchesChange={setDraftPitches}
                onScored={handleScored}
                onNextScenario={() => {
                  // A new scenario means a new hidden truth — pitches written
                  // against the old brief would be scored against the wrong
                  // world, so the boxes clear along with the cycle.
                  setScenarioIndex((i) => i + 1)
                  setDraftPitches(['', '', ''])
                }}
                onBackToPitches={backToPitches}
                onGoToRegret={() => goToAct(2)}
                onSkipToLab={() => goToAct(4)}
                announce={announce}
              />
            </section>
          )}
          {act === 2 && (
            <section className="playground-section" aria-label="Act II: Regret">
              <Act2Regret
                sim={sim}
                pitchOutcome={pitchOutcome}
                onBackToPitches={() => {
                  backToPitches()
                  goToAct(1)
                }}
                onGoToRationing={() => goToAct(3)}
              />
            </section>
          )}
          {act === 3 && (
            <section className="playground-section" aria-label="Act III: Rationing">
              <Act3Rationing
                quarter={quarter}
                campaignLabels={campaignLabels}
                campaignRates={campaignRates}
                seed={sim.config.seed}
                epsilon={sim.config.epsilon}
                usingExample={usingExample}
                exampleScenarioTitle={example.scenarioTitle}
                onGoToAct1={() => goToAct(1)}
                onGoToAct4={() => goToAct(4)}
                announce={announce}
              />
            </section>
          )}
          {act === 4 && (
            <section className="playground-section" aria-label="Act IV: Learning from the Best">
              <Act4Lab sim={labSim} />
            </section>
          )}
        </div>
      </main>

      {/* Always mounted, so act/view swaps can't tear the live region out
          from under the announcement it's supposed to make. */}
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </div>
  )
}
