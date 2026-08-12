/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/bandit/',
  build: {
    // transformers.web is the semantic engine's own dynamically-imported
    // chunk (lazy, never blocks initial load) — expected to exceed the
    // default 500kB warning on its own.
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
