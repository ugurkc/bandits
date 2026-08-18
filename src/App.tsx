import { Fragment } from 'react'
import { loadMeta, loadSections } from './lib/essayContent'
import { InlineText } from './components/InlineText'
import { Playground } from './components/Playground'
import { ThemeToggle } from './components/ThemeToggle'
import { useTheme } from './state/useTheme'

// Static per build (?raw imports): parse once at module load, not per render.
const meta = loadMeta()
const sections = loadSections()

// The slot machine photo slots in right after the first intro paragraph,
// and the Ol' Reliable meme right after the "only one weapon in our
// war-chest worth using" paragraph (subtitle indices, 0-based).
const SLOT_MACHINE_AFTER_PARAGRAPH = 0
const OL_RELIABLE_AFTER_PARAGRAPH = 2

function App() {
  const [theme, setTheme] = useTheme()

  return (
    <main className="page">
      <header className="essay-header">
        <ThemeToggle
          theme={theme}
          onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        />
        <p className="essay-eyebrow">{meta.eyebrow}</p>
        <h1 className="essay-title">{meta.title}</h1>
        <p className="essay-term-note">
          Slot machines are also known pejoratively as "one-armed bandits", alluding to the
          large mechanical levers affixed to the sides of early mechanical machines, and to the
          games' ability to empty players' pockets and wallets as thieves would.
        </p>
        {meta.subtitle.map((p, i) => (
          <Fragment key={i}>
            <p className="essay-subtitle">
              <InlineText text={p} />
            </p>
            {i === SLOT_MACHINE_AFTER_PARAGRAPH && (
              <figure className="essay-term-figure">
                <img
                  className="essay-term-image"
                  src={`${import.meta.env.BASE_URL}images/slot-machine.png`}
                  alt="A row of classic slot machines with their levers and spinning reels."
                  loading="lazy"
                  width={612}
                  height={402}
                />
              </figure>
            )}
            {i === OL_RELIABLE_AFTER_PARAGRAPH && (
              <figure className="essay-intro-figure">
                <img
                  className="essay-intro-image"
                  src={`${import.meta.env.BASE_URL}images/ol-reliable.png`}
                  alt='SpongeBob SquarePants opens a briefcase labeled "Ol’ Reliable" to reveal a note inside reading "TRYING A F TON" — the go-to move for figuring out what actually works.'
                  loading="lazy"
                  width={978}
                  height={1470}
                />
              </figure>
            )}
          </Fragment>
        ))}
      </header>

      <section className="playground-section" aria-label="Bandit simulator">
        <Playground />
      </section>

      <div className="essay-prose">
        {sections.map((s) => (
          <section key={s.order} id={s.id}>
            {s.heading && <h2>{s.heading}</h2>}
            <p>
              <InlineText text={s.body} />
            </p>
          </section>
        ))}
      </div>
    </main>
  )
}

export default App
