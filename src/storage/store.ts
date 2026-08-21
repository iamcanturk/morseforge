/**
 * Persistence primitives (PROJECT.md §21, §22, §42).
 *
 * There is no backend, so localStorage *is* the product's database. That raises
 * the stakes on three failure modes that a server-backed app would shrug off:
 *
 * 1. **Corrupt data must not white-screen the app.** Anything read back is
 *    validated and falls back to a default rather than being trusted. A user
 *    who hand-edits their export, or a half-written record from a killed tab,
 *    should cost them that record — not the whole app.
 * 2. **The storage may not exist.** Astro prerenders these pages at build time
 *    (no `window`), and Safari in private mode throws on `setItem`. Both are
 *    normal, not exceptional.
 * 3. **The schema will change.** Every record carries a version so a future
 *    release can migrate rather than silently discard progress.
 *
 * Validators are hand-written rather than pulled from a schema library: this is
 * a static site with a performance budget, and the whole validation surface
 * here is smaller than the library would be.
 */

/** The subset of the Storage API we use. Injectable so tests need no DOM. */
export interface StorageDriver {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** Narrows an unknown parsed value to T, or returns null if it is not one. */
export type Validator<T> = (value: unknown) => T | null

/** Upgrades a record from an older schema version. Return null to discard it. */
export type Migration<T> = (value: unknown, fromVersion: number) => T | null

export interface StoreOptions<T> {
  /** localStorage key. Namespaced `morseforge_*` per PROJECT.md §21. */
  key: string
  /** Current schema version. Bump when the shape changes. */
  version: number
  validate: Validator<T>
  /** Used when nothing is stored, or when what is stored cannot be salvaged. */
  createDefault: () => T
  migrate?: Migration<T>
}

interface Envelope {
  version: number
  data: unknown
}

/**
 * An in-memory driver, used when there is no real storage.
 *
 * Returning this rather than null means every call site can stay unconditional:
 * during prerender the app writes into a throwaway map, and in private mode the
 * session still works, it just does not survive a reload. Both beat crashing.
 */
export function createMemoryDriver(): StorageDriver {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  }
}

/** The real localStorage, or an in-memory stand-in when it is unavailable. */
export function defaultDriver(): StorageDriver {
  // Gate on `window`, not on `localStorage`. Astro prerenders these pages in
  // Node, and recent Node versions expose a `localStorage` global of their own
  // that is backed by a file — touching it during a build both warns and
  // persists build-time junk somewhere it does not belong.
  if (typeof window === 'undefined') return createMemoryDriver()

  try {
    if (typeof localStorage === 'undefined') return createMemoryDriver()
    // Safari in private mode exposes localStorage but throws on write, so
    // feature-detection has to actually write something.
    const probe = '__morseforge_probe__'
    localStorage.setItem(probe, '1')
    localStorage.removeItem(probe)
    return localStorage
  } catch {
    return createMemoryDriver()
  }
}

export type StoreListener<T> = (value: T) => void

/**
 * A single versioned, validated record in storage.
 *
 * Reads are cached: the practice screens read progress on every keystroke, and
 * a JSON.parse per keystroke is wasted work at 35 WPM.
 */
export class Store<T> {
  readonly key: string
  readonly version: number

  #driver: StorageDriver
  #validate: Validator<T>
  #createDefault: () => T
  #migrate: Migration<T> | undefined
  #cache: T | null = null
  #listeners = new Set<StoreListener<T>>()

  constructor(options: StoreOptions<T>, driver: StorageDriver = defaultDriver()) {
    this.key = options.key
    this.version = options.version
    this.#driver = driver
    this.#validate = options.validate
    this.#createDefault = options.createDefault
    this.#migrate = options.migrate
  }

  /** Read the record, falling back to a fresh default if it cannot be trusted. */
  read(): T {
    if (this.#cache !== null) return this.#cache
    this.#cache = this.#readFromDriver() ?? this.#createDefault()
    return this.#cache
  }

  #readFromDriver(): T | null {
    let raw: string | null
    try {
      raw = this.#driver.getItem(this.key)
    } catch {
      return null
    }
    if (raw === null) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return null // truncated or hand-mangled JSON
    }

    if (!isRecord(parsed) || typeof parsed['version'] !== 'number') return null
    const envelope = parsed as unknown as Envelope

    if (envelope.version === this.version) return this.#validate(envelope.data)

    // A record from a *newer* version means the user opened an older build,
    // probably from a stale service worker. Leave it alone rather than
    // downgrading it and destroying progress the newer build understands.
    if (envelope.version > this.version) return null

    return this.#migrate?.(envelope.data, envelope.version) ?? null
  }

  /** Replace the record. Returns false if it could not be persisted. */
  write(value: T): boolean {
    this.#cache = value
    this.#notify(value)

    const envelope: Envelope = { version: this.version, data: value }
    try {
      this.#driver.setItem(this.key, JSON.stringify(envelope))
      return true
    } catch {
      // Quota exceeded, or private mode. The in-memory cache still holds the
      // value, so the session continues; it just will not survive a reload.
      return false
    }
  }

  /** Read, transform, write. */
  update(updater: (current: T) => T): T {
    const next = updater(this.read())
    this.write(next)
    return next
  }

  /** Wipe the record and return to defaults (PROJECT.md §22 Reset). */
  clear(): void {
    try {
      this.#driver.removeItem(this.key)
    } catch {
      // Nothing to do — the cache reset below is what matters.
    }
    this.#cache = null
    this.#notify(this.read())
  }

  /** Drop the cache so the next read hits storage. */
  invalidate(): void {
    this.#cache = null
  }

  /** Subscribe to writes. Returns an unsubscribe function. */
  subscribe(listener: StoreListener<T>): () => void {
    this.#listeners.add(listener)
    return () => void this.#listeners.delete(listener)
  }

  #notify(value: T): void {
    for (const listener of this.#listeners) listener(value)
  }
}

/* -------------------------------------------------------------------------- */
/* Validation helpers                                                          */
/* -------------------------------------------------------------------------- */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A finite number within bounds, or the fallback. Rejects NaN and Infinity. */
export function num(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

/** A non-negative integer, or the fallback. */
export function count(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fallback
  return value
}

export function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/** One of a fixed set of strings, or the fallback. */
export function oneOf<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === 'string' && allowed.includes(value) ? (value as T[number]) : fallback
}
