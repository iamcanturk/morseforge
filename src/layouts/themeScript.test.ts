import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

/**
 * The blocking theme script in BaseLayout, run as the browser would run it.
 *
 * It is an `is:inline` script, so there is no module to import: the test reads
 * it out of the layout and runs it in a sandbox with stub storage and a stub
 * `matchMedia`, the way `define:vars` hands it its constants.
 */
const layout = readFileSync(new URL('./BaseLayout.astro', import.meta.url), 'utf8')
const match = /define:vars=\{\{ themeKey:[^\n]*\n\s*>\n([\s\S]*?)<\/script>/.exec(layout)
if (!match) throw new Error('theme script not found in BaseLayout.astro')
const body = match[1]!

interface Outcome {
  theme: string | undefined
  themeChoice: string | undefined
  themeColor: string | null
}

function run(options: { stored?: string | null; storageThrows?: boolean; osLight: boolean }) {
  const dataset: Record<string, string> = {}
  let meta: string | null = null
  const storage = {
    getItem: (key: string) => {
      if (options.storageThrows) throw new Error('SecurityError')
      return key === 'mf-theme' ? (options.stored ?? null) : null
    },
  }
  const sandbox = {
    themeKey: 'mf-theme',
    settingsKey: 'mf-settings',
    themeColor: { dark: '#dark', light: '#light' },
    localStorage: storage,
    window: { matchMedia: () => ({ matches: options.osLight }) },
    document: {
      documentElement: { dataset },
      querySelector: () => ({
        setAttribute: (_name: string, value: string) => {
          meta = value
        },
      }),
    },
    JSON,
  }
  runInNewContext(body, sandbox)
  return {
    theme: dataset['theme'],
    themeChoice: dataset['themeChoice'],
    themeColor: meta,
  } satisfies Outcome
}

describe('the theme script', () => {
  it('follows the OS when storage is blocked', () => {
    expect(run({ storageThrows: true, osLight: true })).toEqual({
      theme: 'light',
      themeChoice: 'system',
      themeColor: '#light',
    })
    expect(run({ storageThrows: true, osLight: false }).theme).toBe('dark')
  })

  it('treats a junk stored value as system', () => {
    expect(run({ stored: 'blue', osLight: true })).toMatchObject({
      theme: 'light',
      themeChoice: 'system',
    })
    expect(run({ stored: '"light"', osLight: false })).toMatchObject({
      theme: 'dark',
      themeChoice: 'system',
    })
  })

  it('follows the OS when nothing is stored', () => {
    expect(run({ stored: null, osLight: true }).theme).toBe('light')
    expect(run({ stored: null, osLight: false }).theme).toBe('dark')
  })

  it('honours an explicit choice over the OS', () => {
    expect(run({ stored: 'dark', osLight: true })).toMatchObject({
      theme: 'dark',
      themeChoice: 'dark',
    })
    expect(run({ stored: 'light', osLight: false })).toMatchObject({
      theme: 'light',
      themeChoice: 'light',
    })
  })

  it('keeps an explicit system choice following the OS', () => {
    expect(run({ stored: 'system', osLight: true })).toMatchObject({
      theme: 'light',
      themeChoice: 'system',
    })
  })
})
