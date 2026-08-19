import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

/** The reader's own explicit choice, or null if they've never toggled. */
function storedTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage blocked (private mode, cookies-off) — treat as "no choice".
  }
  return null
}

function osTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Theme is applied to <html data-theme> by an inline script in index.html
 * before first paint (avoids a flash of the wrong theme); this hook keeps
 * that attribute in sync afterward.
 *
 * localStorage is written ONLY from an explicit toggle. Persisting on mount
 * would freeze whatever the OS happened to prefer at first visit into a
 * permanent override: a visitor who never touched the button, then switched
 * their OS to dark that evening, would watch every other site follow and
 * this one stay light forever. Until they choose, we follow the OS live.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => storedTheme() ?? osTheme())

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Track the OS for as long as the reader has expressed no preference. The
  // handler re-checks storage so a toggle mid-session stops the tracking
  // without needing to tear the listener down.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => {
      if (storedTheme() === null) setThemeState(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage blocked — the theme still applies for this session.
    }
  }, [])

  return [theme, setTheme] as const
}
