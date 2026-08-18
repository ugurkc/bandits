import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import configRaw from '../../public/admin/config.yml?raw'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

type Field = {
  name: string
  widget?: string
  fields?: Field[]
}

type Collection = {
  name: string
  folder?: string
  files?: { name: string; file: string; fields: Field[] }[]
  fields?: Field[]
}

type AdminConfig = {
  backend: { name: string; repo: string; branch: string }
  public_folder?: string
  output?: { yaml?: { quote?: string } }
  slug?: { encoding?: string; clean_accents?: boolean }
  collections: Collection[]
}

const config = parse(configRaw) as AdminConfig

const collections = config.collections

const findCollection = (name: string) => {
  const collection = collections.find((c) => c.name === name)
  expect(collection, `collection "${name}" missing`).toBeDefined()
  return collection as Collection
}

describe('admin config', () => {
  it('targets this repo on main', () => {
    expect(config.backend).toEqual({
      name: 'github',
      repo: 'ugurkc/bandit',
      branch: 'main',
      // token-only: the OAuth button needs an auth gateway we don't run
      auth_methods: ['token'],
    })
  })

  it('every collection path exists', () => {
    for (const collection of collections) {
      if (collection.folder) {
        const dir = resolve(repoRoot, collection.folder)
        expect(
          existsSync(dir) && statSync(dir).isDirectory(),
          `${collection.folder} is not a directory`,
        ).toBe(true)
      }
      for (const file of collection.files ?? []) {
        const path = resolve(repoRoot, file.file)
        expect(
          existsSync(path) && statSync(path).isFile(),
          `${file.file} is not a file`,
        ).toBe(true)
      }
    }
  })

  it('meta fields match the meta frontmatter schema', () => {
    const meta = findCollection('meta')
    const file = meta.files?.find((f) => f.name === 'meta')
    expect(file, 'meta file entry missing').toBeDefined()
    expect(file?.fields.map((f) => f.name)).toEqual(['eyebrow', 'title', 'body'])
  })

  it('quotes YAML string output', () => {
    // Regression guard: Sveltia's YAML writer defaults to unquoted strings,
    // and js-yaml reads an unquoted value like 2026-08-03 back as a Date
    // object per the YAML 1.1 timestamp rule, breaking string-typed
    // frontmatter consumers.
    expect(config.output?.yaml?.quote).toBe('double')
  })

  it('slugs are ascii with accents cleaned', () => {
    // ğ→g, ü→u transliteration so Turkish-character titles yield readable
    // ASCII URLs instead of percent-encoded unicode slugs.
    expect(config.slug?.encoding).toBe('ascii')
    expect(config.slug?.clean_accents).toBe(true)
  })

  it('media public_folder accounts for the project-page base path', () => {
    // This site deploys under ugurkc.github.io/bandit/, so a bare
    // /uploads public path would 404 — media URLs must be /bandit/…
    expect(config.public_folder?.startsWith('/bandit/')).toBe(true)
  })

  it('copies the CMS bundle from the pinned dependency at build time', () => {
    // The bundle is generated, not committed: dev/build copy it out of
    // node_modules so it can never drift from the installed version.
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    const copy = 'cp node_modules/@sveltia/cms/dist/sveltia-cms.js public/admin/'
    expect(pkg.scripts.prebuild, 'build must refresh the admin bundle').toBe(copy)
    expect(pkg.scripts.predev, 'dev must refresh the admin bundle').toBe(copy)
    // exact pin (no ^ or ~): the lockfile hash is the integrity guarantee
    expect(pkg.devDependencies['@sveltia/cms']).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
