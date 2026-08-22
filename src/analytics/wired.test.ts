import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'

/**
 * Every declared event must actually be sent from somewhere.
 *
 * `EventName` is a closed union so that adding an event is a deliberate act.
 * That guarantee runs one way only: it stops a typo becoming a new event, and
 * does nothing about an event that is declared and never fired. Seven of them
 * were in exactly that state — present in the type, absent from the product,
 * and invisible on the panel that was supposed to show them.
 *
 * Nothing else catches this. TypeScript is happy, every test passes, and the
 * only symptom is a number that stays at zero forever, which looks exactly
 * like nobody using the feature.
 */

const SRC = new URL('..', import.meta.url).pathname

function sources(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) sources(full, files)
    else if (['.ts', '.tsx', '.astro'].includes(extname(entry.name))) files.push(full)
  }
  return files
}

/** The union, read from the file rather than imported — types do not exist at runtime. */
function declaredEvents(): string[] {
  const source = readFileSync(join(SRC, 'analytics/track.ts'), 'utf8')
  const union = /export type EventName =([\s\S]*?)\n\n/.exec(source)?.[1]
  if (union === undefined) {
    throw new Error('EventName union not found in track.ts — has it been renamed?')
  }
  return [...union.matchAll(/'([a-z_]+)'/g)].flatMap((match) => match[1] ?? [])
}

describe('every declared event is sent', () => {
  const events = declaredEvents()

  it('finds the union', () => {
    expect(events.length).toBeGreaterThan(5)
  })

  it.each(declaredEvents())('%s is fired somewhere', (event) => {
    const files = sources(SRC).filter((file) => !file.endsWith('analytics/track.ts'))

    const fired = files.some((file) => {
      const source = readFileSync(file, 'utf8')
      // Either through `track()`, or — for `install`, which is sent from an
      // inline script in the layout to keep content pages framework-free — as
      // a literal beacon URL.
      return source.includes(`'${event}'`) || source.includes(`n=${event}`)
    })

    expect(fired, `${event} is declared in EventName but never sent`).toBe(true)
  })
})
