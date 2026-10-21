import { describe, expect, it, vi } from 'vitest'
import {
  Store,
  type StorageDriver,
  bool,
  count,
  createMemoryDriver,
  defaultDriver,
  num,
  oneOf,
  sharedStore,
  str,
} from './store'

interface Doc {
  name: string
  score: number
}

const validate = (value: unknown): Doc | null => {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (typeof raw['name'] !== 'string') return null
  return { name: raw['name'], score: num(raw['score'], 0) }
}

const options = {
  key: 'test_doc',
  version: 2,
  validate,
  createDefault: (): Doc => ({ name: 'default', score: 0 }),
}

function make(driver: StorageDriver = createMemoryDriver()) {
  return { store: new Store<Doc>(options, driver), driver }
}

describe('Store', () => {
  it('returns the default when nothing is stored', () => {
    expect(make().store.read()).toEqual({ name: 'default', score: 0 })
  })

  it('round-trips a value', () => {
    const { store, driver } = make()
    store.write({ name: 'can', score: 42 })
    expect(new Store<Doc>(options, driver).read()).toEqual({ name: 'can', score: 42 })
  })

  it('wraps stored data in a version envelope', () => {
    const { store, driver } = make()
    store.write({ name: 'can', score: 1 })
    expect(JSON.parse(driver.getItem('test_doc')!)).toEqual({
      version: 2,
      data: { name: 'can', score: 1 },
    })
  })

  it('falls back to the default rather than throwing on malformed JSON', () => {
    const driver = createMemoryDriver()
    driver.setItem('test_doc', '{"version":2,"data":{"name":')
    expect(new Store<Doc>(options, driver).read()).toEqual({ name: 'default', score: 0 })
  })

  it('falls back to the default when the shape is wrong', () => {
    const driver = createMemoryDriver()
    driver.setItem('test_doc', JSON.stringify({ version: 2, data: { name: 123 } }))
    expect(new Store<Doc>(options, driver).read()).toEqual({ name: 'default', score: 0 })
  })

  it('falls back when the envelope has no version', () => {
    const driver = createMemoryDriver()
    driver.setItem('test_doc', JSON.stringify({ name: 'can' }))
    expect(new Store<Doc>(options, driver).read()).toEqual({ name: 'default', score: 0 })
  })

  it('migrates a record from an older version', () => {
    const driver = createMemoryDriver()
    driver.setItem('test_doc', JSON.stringify({ version: 1, data: { fullName: 'can' } }))

    const store = new Store<Doc>(
      {
        ...options,
        migrate: (value, from) => {
          if (from !== 1) return null
          const raw = value as Record<string, unknown>
          return { name: String(raw['fullName']), score: 0 }
        },
      },
      driver,
    )

    expect(store.read()).toEqual({ name: 'can', score: 0 })
  })

  it('discards an old record when there is no migration for it', () => {
    const driver = createMemoryDriver()
    driver.setItem('test_doc', JSON.stringify({ version: 1, data: { fullName: 'can' } }))
    expect(new Store<Doc>(options, driver).read()).toEqual({ name: 'default', score: 0 })
  })

  it('leaves a newer record alone instead of downgrading it', () => {
    // A stale service worker can serve an older build. Reading a v3 record with
    // v2 rules and writing back would destroy data the newer build understands.
    const driver = createMemoryDriver()
    const future = JSON.stringify({ version: 3, data: { name: 'can', extra: true } })
    driver.setItem('test_doc', future)

    const store = new Store<Doc>(options, driver)
    expect(store.read()).toEqual({ name: 'default', score: 0 })
    expect(driver.getItem('test_doc')).toBe(future)
  })

  it('keeps working when the driver throws on write', () => {
    const driver: StorageDriver = {
      ...createMemoryDriver(),
      setItem: () => {
        throw new DOMException('QuotaExceededError')
      },
    }
    const store = new Store<Doc>(options, driver)

    expect(store.write({ name: 'can', score: 1 })).toBe(false)
    // The session continues from cache even though nothing was persisted.
    expect(store.read()).toEqual({ name: 'can', score: 1 })
  })

  it('keeps working when the driver throws on read', () => {
    const driver: StorageDriver = {
      ...createMemoryDriver(),
      getItem: () => {
        throw new DOMException('SecurityError')
      },
    }
    expect(new Store<Doc>(options, driver).read()).toEqual({ name: 'default', score: 0 })
  })

  it('updates through a function', () => {
    const { store } = make()
    store.write({ name: 'can', score: 1 })
    expect(store.update((doc) => ({ ...doc, score: doc.score + 10 }))).toEqual({
      name: 'can',
      score: 11,
    })
  })

  it('parses once, and again only when the stored string changes', () => {
    const driver = createMemoryDriver()
    driver.setItem('test_doc', JSON.stringify({ version: 2, data: { name: 'can', score: 1 } }))
    const parse = vi.spyOn(JSON, 'parse')
    const store = new Store<Doc>(options, driver)

    const first = store.read()
    expect(store.read()).toBe(first)
    expect(store.read()).toBe(first)
    expect(parse).toHaveBeenCalledTimes(1)

    driver.setItem('test_doc', JSON.stringify({ version: 2, data: { name: 'other', score: 2 } }))
    expect(store.read()).toEqual({ name: 'other', score: 2 })
    expect(parse).toHaveBeenCalledTimes(2)

    store.invalidate()
    store.read()
    expect(parse).toHaveBeenCalledTimes(3)
    parse.mockRestore()
  })

  it('clears back to the default', () => {
    const { store, driver } = make()
    store.write({ name: 'can', score: 5 })
    store.clear()
    expect(store.read()).toEqual({ name: 'default', score: 0 })
    expect(driver.getItem('test_doc')).toBeNull()
  })

  it('notifies subscribers on write and clear, and stops after unsubscribe', () => {
    const { store } = make()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.write({ name: 'a', score: 1 })
    expect(listener).toHaveBeenCalledWith({ name: 'a', score: 1 })

    store.clear()
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    store.write({ name: 'b', score: 2 })
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

describe('validation helpers', () => {
  it('rejects NaN and Infinity, which JSON.parse can produce via 1e999', () => {
    expect(num(Number.NaN, 7)).toBe(7)
    expect(num(JSON.parse('1e999'), 7)).toBe(7)
  })

  it('clamps numbers into range', () => {
    expect(num(500, 0, 0, 100)).toBe(100)
    expect(num(-5, 0, 0, 100)).toBe(0)
  })

  it('accepts only non-negative integers as counts', () => {
    expect(count(5)).toBe(5)
    expect(count(-1)).toBe(0)
    expect(count(1.5)).toBe(0)
    expect(count('3')).toBe(0)
  })

  it('falls back for the wrong primitive type', () => {
    expect(bool('yes', false)).toBe(false)
    expect(str(42, 'x')).toBe('x')
  })

  it('restricts strings to an allowed set', () => {
    const modes = ['light', 'dark'] as const
    expect(oneOf('dark', modes, 'light')).toBe('dark')
    expect(oneOf('neon', modes, 'light')).toBe('light')
  })
})

describe('validateOrDefault', () => {
  it('accepts data that passes the validator', () => {
    const { store } = make()
    expect(store.validateOrDefault({ name: 'can', score: 3 })).toEqual({ name: 'can', score: 3 })
  })

  it('falls back to the default for anything else', () => {
    // The §22 import path runs user-supplied files through this, so it has to
    // behave exactly like a normal read of corrupt data.
    const { store } = make()
    expect(store.validateOrDefault({ name: 123 })).toEqual({ name: 'default', score: 0 })
    expect(store.validateOrDefault(null)).toEqual({ name: 'default', score: 0 })
    expect(store.validateOrDefault('nonsense')).toEqual({ name: 'default', score: 0 })
  })

  it('does not write anything by itself', () => {
    const { store, driver } = make()
    store.validateOrDefault({ name: 'can', score: 1 })
    expect(driver.getItem('test_doc')).toBeNull()
  })
})

describe('sharedStore', () => {
  it('returns one instance per key per driver', () => {
    const driver = createMemoryDriver()
    const a = sharedStore(options, driver)
    expect(sharedStore(options, driver)).toBe(a)
    expect(sharedStore({ ...options, key: 'other_doc' }, driver)).not.toBe(a)
    expect(sharedStore(options, createMemoryDriver())).not.toBe(a)
  })

  it('shares the default driver too, so callers without one still agree', () => {
    expect(defaultDriver()).toBe(defaultDriver())
    const a = sharedStore({ ...options, key: 'shared_default_doc' })
    expect(sharedStore({ ...options, key: 'shared_default_doc' })).toBe(a)
  })

  it('notifies a subscriber of writes made by another caller', () => {
    const driver = createMemoryDriver()
    const seen: string[] = []
    sharedStore(options, driver).subscribe((doc) => seen.push(doc.name))
    sharedStore(options, driver).write({ name: 'from elsewhere', score: 1 })
    expect(seen).toEqual(['from elsewhere'])
  })
})

describe('writing over a newer record', () => {
  it('is refused, and a clear lifts the refusal', () => {
    const driver = createMemoryDriver()
    const future = JSON.stringify({ version: 3, data: { name: 'can', extra: true } })
    driver.setItem('test_doc', future)
    const store = new Store<Doc>(options, driver)

    expect(store.write({ name: 'old build', score: 1 })).toBe(false)
    expect(driver.getItem('test_doc')).toBe(future)
    // The session still runs from the cache.
    expect(store.read().name).toBe('old build')

    store.clear()
    expect(store.write({ name: 'fresh', score: 2 })).toBe(true)
    expect(driver.getItem('test_doc')).toContain('fresh')
  })
})

describe('count ceiling', () => {
  it('caps at the largest exact integer by default, or a given maximum', () => {
    expect(count(1e40)).toBe(Number.MAX_SAFE_INTEGER)
    expect(count(500, 0, 100)).toBe(100)
  })
})

describe('two tabs over one storage', () => {
  /** Two drivers over one map: each tab's own handle on the same localStorage. */
  function tabs() {
    const backing = new Map<string, string>()
    const changes = new EventTarget()
    const a = new Store<Doc>(options, createMemoryDriver(backing), changes)
    const b = new Store<Doc>(options, createMemoryDriver(backing))
    /** What the browser does in tab A after tab B writes. */
    const announce = (key: string | null = options.key) =>
      changes.dispatchEvent(Object.assign(new Event('storage'), { key }))
    return { a, b, announce }
  }

  it("applies an update to the other tab's newer record, not to a stale cache", () => {
    const { a, b } = tabs()
    a.write({ name: 'can', score: 0 })
    expect(a.read().score).toBe(0) // tab A has it cached

    b.update((doc) => ({ ...doc, score: doc.score + 500 }))
    a.update((doc) => ({ ...doc, score: doc.score + 100 }))

    expect(a.read().score).toBe(600)
    expect(b.read().score).toBe(600)
  })

  it("reads the other tab's write without being told", () => {
    const { a, b } = tabs()
    a.read()
    b.write({ name: 'from b', score: 7 })
    expect(a.read()).toEqual({ name: 'from b', score: 7 })
  })

  it('refreshes and notifies subscribers on a storage event for its key', () => {
    const { a, b, announce } = tabs()
    a.read()
    const seen: Doc[] = []
    a.subscribe((doc) => seen.push(doc))

    b.write({ name: 'from b', score: 3 })
    announce()
    expect(seen).toEqual([{ name: 'from b', score: 3 }])

    // Another key, or an event with nothing new behind it, is not news.
    announce('some_other_key')
    announce()
    expect(seen).toHaveLength(1)

    // A null key means the other tab cleared everything.
    b.clear()
    announce(null)
    expect(seen.at(-1)).toEqual({ name: 'default', score: 0 })
  })

  it('keeps an unsaved session when its own write failed and nothing else changed', () => {
    const backing = new Map<string, string>()
    const failing: StorageDriver = {
      ...createMemoryDriver(backing),
      setItem: () => {
        throw new DOMException('QuotaExceededError')
      },
    }
    const store = new Store<Doc>(options, failing)
    store.update((doc) => ({ ...doc, score: 1 }))
    store.update((doc) => ({ ...doc, score: doc.score + 1 }))
    expect(store.read().score).toBe(2)
  })

  it('refuses to write over a newer build that wrote from another tab after this one read', () => {
    const backing = new Map<string, string>()
    const tab = new Store<Doc>(options, createMemoryDriver(backing))
    tab.write({ name: 'old build', score: 1 })
    const future = JSON.stringify({ version: 3, data: { name: 'new build', extra: true } })
    backing.set(options.key, future)

    expect(tab.write({ name: 'old build', score: 2 })).toBe(false)
    expect(backing.get(options.key)).toBe(future)
  })

  it('reload drops what only the cache held, and says so', () => {
    const backing = new Map<string, string>()
    const store = new Store<Doc>(options, {
      ...createMemoryDriver(backing),
      setItem: () => {
        throw new DOMException('QuotaExceededError')
      },
    })
    const seen: Doc[] = []
    store.subscribe((doc) => seen.push(doc))
    store.write({ name: 'unsaved', score: 9 })
    expect(store.reload()).toEqual({ name: 'default', score: 0 })
    expect(seen.at(-1)).toEqual({ name: 'default', score: 0 })
  })
})
