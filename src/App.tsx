import { ActsShell } from './components/ActsShell'

/**
 * The whole essay is the acts shell: five acts navigated left/right, all
 * cross-act state owned by the shell. See src/acts.ts for the act list.
 */
function App() {
  return <ActsShell />
}

export default App
