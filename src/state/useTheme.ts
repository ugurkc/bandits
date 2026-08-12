import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Storage blocked (private mode, cookies-off) — fall back to the OS preference.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Theme is applied to <html data-theme> by an inline script in index.html
 * before first paint (avoids a flash of the wrong theme); this hook keeps
 * that attribute and localStorage in sync with the current value afterward.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // Storage blocked — the theme still applies for this session.
    }
  }, [theme])

  return [theme, setTheme] as const
}
