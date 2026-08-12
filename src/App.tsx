import { loadMeta, loadSections } from './lib/essayContent'

function App() {
  const meta = loadMeta()
  const sections = loadSections()

  return (
    <main>
      <p>{meta.eyebrow}</p>
      <h1>{meta.title}</h1>
      <p>{meta.subtitle}</p>
      {sections.map((s) => (
        <section key={s.order}>
          {s.heading && <h2>{s.heading}</h2>}
          <p>{s.body}</p>
        </section>
      ))}
    </main>
  )
}

export default App
