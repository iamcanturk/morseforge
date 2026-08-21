import { describe, expect, it, vi } from 'vitest'
import {
  Store,
  type StorageDriver,
  bool,
  count,
  createMemoryDriver,
  num,
  oneOf,
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

  it('caches reads and re-reads after invalidate', () => {
    const driver = createMemoryDriver()
    const spy = vi.spyOn(driver, 'getItem')
    const store = new Store<Doc>(options, driver)

    store.read()
    store.read()
    store.read()
    expect(spy).toHaveBeenCalledTimes(1)

    store.invalidate()
    store.read()
    expect(spy).toHaveBeenCalledTimes(2)
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
