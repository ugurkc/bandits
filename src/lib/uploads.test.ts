import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// public/ is copied to dist/ byte-for-byte and nothing else validates it, so an
// uploaded .svg (Figma exports and icon-site downloads routinely embed <script>)
// executes on this origin when visited directly — the origin holding the CMS
// access token.
const uploadsDir = fileURLToPath(new URL('../../public/uploads', import.meta.url))
const EXECUTABLE = /\.(svgz?|html?|xhtml|xml)$/i

describe('uploads', () => {
  it('holds no files that execute script when visited directly', () => {
    if (!existsSync(uploadsDir)) return
    const risky = readdirSync(uploadsDir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => EXECUTABLE.test(name))
    expect(risky, 'convert these to PNG/JPG before uploading').toEqual([])
  })
})
