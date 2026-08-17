import { loadMeta, loadSections } from './lib/essayContent'
import { Playground } from './components/Playground'
import { ThemeToggle } from './components/ThemeToggle'
import { useTheme } from './state/useTheme'

// Static per build (?raw imports): parse once at module load, not per render.
const meta = loadMeta()
const sections = loadSections()

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
        <p className="essay-subtitle">{meta.subtitle[0]}</p>
        {meta.subtitle.length > 1 && (
          <>
            <figure className="essay-intro-figure">
              <img
                className="essay-intro-image"
                src="/images/ol-reliable.png"
                alt='SpongeBob SquarePants opens a briefcase labeled "Ol’ Reliable" to reveal a note inside reading "TRYING A F TON" — the go-to move for figuring out what actually works.'
                loading="lazy"
              />
            </figure>
            {meta.subtitle.slice(1).map((p, i) => (
              <p className="essay-subtitle" key={i}>
                {p}
              </p>
            ))}
          </>
        )}
      </header>

      <section className="playground-section" aria-label="Bandit simulator">
        <Playground />
      </section>

      <div className="essay-prose">
        {sections.map((s) => (
          <section key={s.order} id={s.id}>
            {s.heading && <h2>{s.heading}</h2>}
            <p>{s.body}</p>
          </section>
        ))}
      </div>
    </main>
  )
}

export default App
