import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createLastmod,
  frontmatterDates,
  gitDate,
  lastmodVerdict,
  parsePorcelain,
  pageFileFor,
  sourcesFor,
} from '../../scripts/lastmod.mjs'
import { SITEMAP_EXCLUDED, inSitemap } from './sitemap'
import { PAGES } from '../config/pages'

let root: string

const touch = (file: string, body = '') => {
  mkdirSync(join(root, file, '..'), { recursive: true })
  writeFileSync(join(root, file), body)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'lastmod-'))
  touch('src/pages/index.astro')
  touch('src/pages/tree.astro')
  touch('src/pages/games/morse-runner.astro')
  touch('src/pages/words/index.astro')
  touch('src/pages/words/[slug].astro')
  touch('src/pages/blog/index.astro')
  touch('src/pages/blog/[...slug].astro')
  touch('src/data/words.ts')
  touch('src/data/tree.ts')
  touch('src/content/blog/old.md', '---\ntitle: Old\npublished: 2026-08-22\n---\nBody')
  touch(
    'src/content/blog/new.md',
    "---\ntitle: New\npublished: 2026-08-23\nupdated: '2026-10-21'\n---\nBody",
  )
  touch('src/content/blog/draft.md', '---\npublished: 2027-01-01\ndraft: true\n---\n')
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

/** A fake `git log`: each file has a fixed date, the newest of a set wins. */
const DATES: Record<string, string> = {
  'src/pages/index.astro': '2026-08-21T22:11:47+03:00',
  'src/pages/tree.astro': '2026-08-01T10:00:00Z',
  'src/data/tree.ts': '2026-09-01T10:00:00Z',
  'src/pages/words/[slug].astro': '2026-08-10T00:00:00Z',
  'src/data/words.ts': '2026-08-20T00:00:00Z',
  'src/pages/blog/index.astro': '2026-08-01T00:00:00Z',
}
const fakeGit = (files: string[]) =>
  files
    .map((file) => DATES[file])
    .filter((date): date is string => Boolean(date))
    .map((date) => new Date(date).toISOString())
    .sort()
    .at(-1)

describe('frontmatterDates', () => {
  it('reads published, updated and draft', () => {
    expect(frontmatterDates('---\npublished: 2026-08-23\nupdated: 2026-10-21\n---\n')).toEqual({
      published: '2026-08-23T00:00:00.000Z',
      updated: '2026-10-21T00:00:00.000Z',
      draft: false,
    })
    expect(frontmatterDates('---\npublished: "2026-08-23"\ndraft: true\n---\n')).toEqual({
      published: '2026-08-23T00:00:00.000Z',
      updated: undefined,
      draft: true,
    })
  })

  it('ignores dates outside the frontmatter', () => {
    expect(frontmatterDates('No frontmatter.\npublished: 2026-01-01\n').published).toBeUndefined()
  })
})

describe('pageFileFor and sourcesFor', () => {
  it('finds static, nested and dynamic page files', () => {
    expect(pageFileFor('/', root)).toBe('src/pages/index.astro')
    expect(pageFileFor('/tree/', root)).toBe('src/pages/tree.astro')
    expect(pageFileFor('/games/morse-runner/', root)).toBe('src/pages/games/morse-runner.astro')
    expect(pageFileFor('/words/', root)).toBe('src/pages/words/index.astro')
    expect(pageFileFor('/words/sos/', root)).toBe('src/pages/words/[slug].astro')
    expect(pageFileFor('/blog/x/', root)).toBe('src/pages/blog/[...slug].astro')
    expect(pageFileFor('/missing/', root)).toBeUndefined()
  })

  it('adds the data a page renders, and only files that exist', () => {
    expect(sourcesFor('/tree/', root)).toEqual(['src/data/tree.ts', 'src/pages/tree.astro'])
    expect(sourcesFor('/words/sos/', root)).toEqual([
      'src/data/words.ts',
      'src/pages/words/[slug].astro',
    ])
    // landing.ts is declared for "/" but does not exist in the fixture.
    expect(sourcesFor('/', root)).toEqual(['src/pages/index.astro'])
  })
})

describe('createLastmod', () => {
  const lastmod = () => createLastmod({ root, git: fakeGit, status: () => 'clean' })

  it('takes the newest commit across the page and its data, in UTC', () => {
    expect(lastmod()('/tree/')).toBe('2026-09-01T10:00:00.000Z')
    expect(lastmod()('/')).toBe('2026-08-21T19:11:47.000Z')
    expect(lastmod()('/words/sos/')).toBe('2026-08-20T00:00:00.000Z')
  })

  it('dates a post by its frontmatter: updated, else published', () => {
    expect(lastmod()('/blog/new/')).toBe('2026-10-21T00:00:00.000Z')
    expect(lastmod()('/blog/old/')).toBe('2026-08-22T00:00:00.000Z')
  })

  it('dates the notes index by its newest published note, ignoring drafts', () => {
    expect(lastmod()('/blog/')).toBe('2026-10-21T00:00:00.000Z')
  })

  it('gives no date rather than a made-up one when nothing is dated', () => {
    expect(lastmod()('/missing/')).toBeUndefined()
  })

  it('is deterministic: two resolvers over the same tree agree', () => {
    const paths = ['/', '/tree/', '/words/', '/words/sos/', '/blog/', '/blog/new/']
    expect(paths.map(lastmod())).toEqual(paths.map(lastmod()))
  })

  it('runs one git command per distinct source set', () => {
    let calls = 0
    const counted = createLastmod({
      root,
      status: () => 'clean',
      git: (files: string[]) => {
        calls++
        return fakeGit(files)
      },
    })
    counted('/words/sos/')
    counted('/words/help/')
    counted('/words/sos/')
    expect(calls).toBe(1)
  })
})

describe('uncommitted sources', () => {
  // The owner reviews a build of an uncommitted tree; the last commit date
  // would describe the old content, so those routes get no date at all.
  const dirtyTree = () =>
    createLastmod({
      root,
      git: fakeGit,
      status: (files: string[]) =>
        files.includes('src/data/tree.ts') ? 'dirty' : files.length > 0 ? 'clean' : 'none',
    })

  it('gives a route with a modified or untracked source no lastmod', () => {
    expect(dirtyTree()('/tree/')).toBeUndefined()
    expect(dirtyTree().status('/tree/')).toBe('dirty')
  })

  it('still dates clean routes and posts', () => {
    expect(dirtyTree()('/words/sos/')).toBe('2026-08-20T00:00:00.000Z')
    expect(dirtyTree()('/blog/new/')).toBe('2026-10-21T00:00:00.000Z')
    expect(dirtyTree().status('/missing/')).toBe('none')
  })

  it('reports git trouble as unknown, never as clean', () => {
    const resolver = createLastmod({ root, git: fakeGit })
    expect(resolver.status('/tree/')).toBe('unknown')
    expect(resolver('/tree/')).toBeUndefined()
  })
})

describe('parsePorcelain', () => {
  it('lists modified, staged, untracked and renamed paths', () => {
    const out = [
      ' M src/pages/tree.astro',
      'M  src/data/words.ts',
      '?? src/pages/message.astro',
      'R  src/old.ts -> src/new.ts',
      '?? "src/pages/words/[slug].md.ts"',
      '',
    ].join('\n')
    expect(parsePorcelain(out)).toEqual([
      'src/pages/tree.astro',
      'src/data/words.ts',
      'src/pages/message.astro',
      'src/new.ts',
      'src/pages/words/[slug].md.ts',
    ])
    expect(parsePorcelain('')).toEqual([])
  })
})

describe('lastmodVerdict', () => {
  it('passes any URL that has a lastmod', () => {
    for (const status of ['clean', 'dirty', 'unknown', 'none']) {
      expect(lastmodVerdict({ lastmod: '2026-10-21T00:00:00.000Z', status })).toBe('ok')
    }
  })

  it('fails a missing lastmod only when every source is committed as is', () => {
    expect(lastmodVerdict({ lastmod: null, status: 'clean' })).toBe('fail')
    expect(lastmodVerdict({ lastmod: null, status: 'none' })).toBe('fail')
  })

  it('warns for untracked or modified sources, and when git cannot tell', () => {
    expect(lastmodVerdict({ lastmod: null, status: 'dirty' })).toBe('warn')
    expect(lastmodVerdict({ lastmod: undefined, status: 'unknown' })).toBe('warn')
  })
})

describe('gitDate', () => {
  it('returns undefined outside a repository instead of throwing', () => {
    expect(gitDate(['src/pages/index.astro'], root)).toBeUndefined()
    expect(gitDate([], root)).toBeUndefined()
  })
})

describe('inSitemap', () => {
  it('drops every page the registry does not index, and the author tools', () => {
    for (const page of PAGES.filter((entry) => !entry.indexable)) {
      expect(inSitemap(`https://morse.iamcanturk.dev${page.path}`)).toBe(false)
    }
    for (const path of ['/panel/', '/studio/', '/stats/', '/settings/', '/404/']) {
      expect(SITEMAP_EXCLUDED.has(path)).toBe(true)
      expect(inSitemap(path)).toBe(false)
      expect(inSitemap(path.slice(0, -1))).toBe(false)
    }
  })

  it('keeps indexable pages and dynamic routes', () => {
    for (const page of PAGES.filter((entry) => entry.indexable)) {
      expect(inSitemap(`https://morse.iamcanturk.dev${page.path}`)).toBe(true)
    }
    expect(inSitemap('https://morse.iamcanturk.dev/words/sos/')).toBe(true)
    expect(inSitemap('https://morse.iamcanturk.dev/blog/what-farnsworth-timing-is/')).toBe(true)
  })
})
