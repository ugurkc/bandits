import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import htmlRaw from '../../index.html?raw'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function metaContent(html: string, attr: 'property' | 'name', key: string): string | undefined {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`)
  return html.match(re)?.[1]
}

/**
 * The link-preview embed shown when this URL is shared (LinkedIn, Slack,
 * Facebook, X): the og: and twitter: meta tags in index.html, read by link
 * crawlers, not by page visitors. These guards catch drift a page-visible
 * check never would — a renamed image file or a stale absolute URL would
 * silently break every future share.
 */
describe('link-preview embed (index.html meta tags)', () => {
  it('og:title and twitter:title match the page title', () => {
    expect(htmlRaw).toMatch(/<title>Bandits<\/title>/)
    expect(metaContent(htmlRaw, 'property', 'og:title')).toBe('Bandits')
    expect(metaContent(htmlRaw, 'name', 'twitter:title')).toBe('Bandits')
  })

  it('og:image is an absolute URL for a file that actually exists in public/', () => {
    const ogImage = metaContent(htmlRaw, 'property', 'og:image')
    expect(ogImage).toMatch(/^https:\/\/ugurkc\.github\.io\/bandits\//)
    const relPath = ogImage!.replace('https://ugurkc.github.io/bandits/', '')
    expect(existsSync(resolve(repoRoot, 'public', relPath))).toBe(true)
  })

  it('twitter:image matches og:image (one image, not two to keep in sync)', () => {
    expect(metaContent(htmlRaw, 'name', 'twitter:image')).toBe(metaContent(htmlRaw, 'property', 'og:image'))
  })

  it('uses summary_large_image so the card renders full-width, not a thumbnail', () => {
    expect(metaContent(htmlRaw, 'name', 'twitter:card')).toBe('summary_large_image')
  })

  it('og:url matches the deployed base path', () => {
    expect(metaContent(htmlRaw, 'property', 'og:url')).toBe('https://ugurkc.github.io/bandits/')
  })

  it('og:image:width/height match the actual file dimensions', () => {
    // slot-machine.png is 612x402 (see Act0Intro.tsx's img width/height) —
    // a mismatch here makes some crawlers reject or badly crop the image.
    expect(metaContent(htmlRaw, 'property', 'og:image:width')).toBe('612')
    expect(metaContent(htmlRaw, 'property', 'og:image:height')).toBe('402')
  })

  it('og:description and twitter:description are non-empty and under 200 chars', () => {
    // ~200 chars is roughly where LinkedIn/X truncate; well past that the
    // summary reads as cut off mid-sentence in the card.
    for (const desc of [
      metaContent(htmlRaw, 'property', 'og:description'),
      metaContent(htmlRaw, 'name', 'twitter:description'),
    ]) {
      expect(desc, 'description missing').toBeTruthy()
      expect(desc!.length).toBeGreaterThan(20)
      expect(desc!.length).toBeLessThan(200)
    }
  })
})
