import { existsSync, readFileSync } from 'node:fs'
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
 * Intrinsic pixel size from an image's own header bytes. Hand-rolled over
 * PNG's IHDR and JPEG's SOF markers because the repo takes no new npm
 * dependencies — and because the alternative (trusting the numbers written
 * in the HTML) is exactly the tautology this file used to contain.
 */
function imageSize(buf: Buffer): { width: number; height: number; format: 'png' | 'jpeg' } {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++
        continue
      }
      const marker = buf[i + 1]
      // SOF0-SOF15 carry the frame dimensions; DHT/DAC/DRI/SOS do not.
      const isSOF =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSOF) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), format: 'jpeg' }
      }
      i += 2 + buf.readUInt16BE(i + 2)
    }
  }
  throw new Error('unrecognised image format (expected PNG or JPEG)')
}

/**
 * The link-preview embed shown when this URL is shared (LinkedIn, Slack,
 * WhatsApp, X): the og: and twitter: meta tags in index.html, read by link
 * crawlers, not by page visitors. Nothing on the rendered page reveals a
 * break here, so these are the only guards that can.
 *
 * Vite copies index.html through to dist/ verbatim (verified byte-identical
 * against the deployed page), so validating the source validates what ships.
 */
describe('link-preview embed (index.html meta tags)', () => {
  it('og:title carries the pitch; twitter:title matches it; the tab title stays short', () => {
    // Deliberate divergence: the browser tab shows the terse <title>, but
    // LinkedIn feed cards display ONLY title + domain (og:description is
    // ignored there), so og:title is the one line of text the share gets.
    expect(htmlRaw).toMatch(/<title>Bandits<\/title>/)
    const og = metaContent(htmlRaw, 'property', 'og:title')
    expect(og, 'og:title missing').toBeTruthy()
    expect(og).toMatch(/^Bandits/)
    // Longer than the bare site name (it must say something), shorter than
    // where LinkedIn truncates titles in the feed (~100 chars).
    expect(og!.length).toBeGreaterThan('Bandits'.length)
    expect(og!.length).toBeLessThan(100)
    expect(metaContent(htmlRaw, 'name', 'twitter:title')).toBe(og)
  })

  it('og:image is an absolute URL for a file that actually exists in public/', () => {
    const ogImage = metaContent(htmlRaw, 'property', 'og:image')
    expect(ogImage, 'og:image missing').toBeTruthy()
    expect(ogImage).toMatch(/^https:\/\/ugurkc\.github\.io\/bandits\//)
    const relPath = ogImage!.replace('https://ugurkc.github.io/bandits/', '')
    expect(existsSync(resolve(repoRoot, 'public', relPath))).toBe(true)
  })

  it('twitter:image matches og:image (one image, not two to keep in sync)', () => {
    const og = metaContent(htmlRaw, 'property', 'og:image')
    const tw = metaContent(htmlRaw, 'name', 'twitter:image')
    // Both must EXIST before comparing: `undefined === undefined` used to let
    // this pass with both tags deleted.
    expect(og, 'og:image missing').toBeTruthy()
    expect(tw, 'twitter:image missing').toBeTruthy()
    expect(tw).toBe(og)
  })

  it('uses summary_large_image so the card renders full-width, not a thumbnail', () => {
    expect(metaContent(htmlRaw, 'name', 'twitter:card')).toBe('summary_large_image')
  })

  it('og:url matches the deployed base path', () => {
    expect(metaContent(htmlRaw, 'property', 'og:url')).toBe('https://ugurkc.github.io/bandits/')
  })

  it('og:image:width/height match the image file itself, not just each other', () => {
    // Reads the real header. The previous version compared the HTML string
    // '612' against the literal '612' and never opened the file, so
    // re-cropping the image left the tags lying to every crawler with the
    // suite still green.
    const ogImage = metaContent(htmlRaw, 'property', 'og:image')!
    const relPath = ogImage.replace('https://ugurkc.github.io/bandits/', '')
    const { width, height } = imageSize(readFileSync(resolve(repoRoot, 'public', relPath)))
    expect(metaContent(htmlRaw, 'property', 'og:image:width')).toBe(String(width))
    expect(metaContent(htmlRaw, 'property', 'og:image:height')).toBe(String(height))
  })

  it('og:image is large enough that LinkedIn renders a card rather than a thumbnail', () => {
    // LinkedIn only promotes to the full-width hero layout around >=1200px
    // wide; below that the share renders as a small left-hand thumbnail.
    // Facebook/WhatsApp want >=600px. This is a WARNING-level guard expressed
    // as a floor at the Facebook threshold so it can't silently regress
    // further while the card image is being replaced.
    const ogImage = metaContent(htmlRaw, 'property', 'og:image')!
    const relPath = ogImage.replace('https://ugurkc.github.io/bandits/', '')
    const { width } = imageSize(readFileSync(resolve(repoRoot, 'public', relPath)))
    expect(width).toBeGreaterThanOrEqual(600)
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

  it('og:image:alt is present so the card is described to assistive tech', () => {
    const alt = metaContent(htmlRaw, 'property', 'og:image:alt')
    expect(alt, 'og:image:alt missing').toBeTruthy()
    expect(alt!.length).toBeGreaterThan(10)
  })
})
