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
 *
 * `backing` lets two drivers share one map, which is how tests stand in for
 * two tabs over the same localStorage.
 */
export function createMemoryDriver(backing: Map<string, string> = new Map()): StorageDriver {
  return {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => void backing.set(key, value),
    removeItem: (key) => void backing.delete(key),
  }
}

let sharedDriver: StorageDriver | null = null
/** The real localStorage, once detection has found a working one. */
let realStorage: StorageDriver | null = null

/**
 * The real localStorage, or an in-memory stand-in when it is unavailable.
 *
 * Decided once per page and then reused. The stand-in in particular has to be
 * the same object every time: two screens each given their own empty map would
 * never see each other's writes, which is the very bug shared stores exist to
 * prevent.
 */
export function defaultDriver(): StorageDriver {
  sharedDriver ??= detectDriver()
  return sharedDriver
}

function detectDriver(): StorageDriver {
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
    realStorage = localStorage
    return localStorage
  } catch {
    return createMemoryDriver()
  }
}

/**
 * Where another tab's writes are announced: `window`, when the driver is the
 * real localStorage. The browser fires `storage` there, in every *other* tab
 * of the origin, after a write. A memory driver has no other tabs.
 */
function defaultChanges(driver: StorageDriver): EventTarget | null {
  return realStorage !== null && driver === realStorage && typeof window !== 'undefined'
    ? window
    : null
}

/** The fields of a `StorageEvent` this module reads. */
interface StorageChange {
  /** The key that changed, or null when the whole storage was cleared. */
  key?: string | null
  /** The storage that changed. Absent on a hand-built event in a test. */
  storageArea?: unknown
}

export type StoreListener<T> = (value: T) => void

/**
 * A single versioned, validated record in storage.
 *
 * Reads are cached: the practice screens read progress on every keystroke, and
 * a JSON.parse per keystroke is wasted work at 35 WPM.
 *
 * The cache must never outlive the data behind it, though, because two tabs
 * share one localStorage. A cache that only this tab updated let a practice
 * tab write its stale record over the 500 XP, the streak day and the daily
 * result another tab had just saved. So:
 *
 * - every read compares the raw stored string with the one the cache was built
 *   from, and re-parses only when it differs. The comparison is one `getItem`;
 *   the JSON.parse happens only after another tab has written;
 * - `update()` therefore always applies its change to the newest stored record,
 *   never to a copy from before another tab's write;
 * - a `storage` event from another tab refreshes the cache and notifies the
 *   subscribers, so open screens show the other tab's progress too.
 */
export class Store<T> {
  readonly key: string
  readonly version: number

  #driver: StorageDriver
  #validate: Validator<T>
  #createDefault: () => T
  #migrate: Migration<T> | undefined
  #cache: T | null = null
  /**
   * The stored string the cache was read from, or last written. Null both for
   * "nothing stored" and before the first read; `#cache === null` tells the
   * two apart.
   */
  #raw: string | null = null
  /** Whether storage holds a record from a newer build. */
  #newerOnDisk = false
  #listeners = new Set<StoreListener<T>>()

  constructor(
    options: StoreOptions<T>,
    driver: StorageDriver = defaultDriver(),
    /**
     * Where another tab's writes are announced. Defaults to `window` for the
     * real localStorage and to nothing for a memory driver. Injectable so a
     * test can play the other tab.
     */
    changes: EventTarget | null = defaultChanges(driver),
  ) {
    this.key = options.key
    this.version = options.version
    this.#driver = driver
    this.#validate = options.validate
    this.#createDefault = options.createDefault
    this.#migrate = options.migrate
    changes?.addEventListener('storage', (event) => this.#onStorage(event as StorageChange))
  }

  /** Read the record, falling back to a fresh default if it cannot be trusted. */
  read(): T {
    this.#sync()
    // `#sync` always leaves a cache behind.
    return this.#cache as T
  }

  /**
   * Bring the cache up to date with storage. Returns true when it changed.
   *
   * Keeps the cache when the stored string is the one it came from. That also
   * covers a write that failed: storage still holds the old string, so the
   * session goes on from the newer cache rather than losing it to a re-read.
   */
  #sync(): boolean {
    let raw: string | null
    try {
      raw = this.#driver.getItem(this.key)
    } catch {
      // Storage that cannot be read now cannot have changed in a way we see.
      if (this.#cache !== null) return false
      raw = null
    }
    if (this.#cache !== null && raw === this.#raw) return false

    this.#raw = raw
    this.#newerOnDisk = false
    this.#cache = this.#parse(raw) ?? this.#createDefault()
    return true
  }

  #parse(raw: string | null): T | null {
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
    if (envelope.version > this.version) {
      this.#newerOnDisk = true
      return null
    }

    return this.#migrate?.(envelope.data, envelope.version) ?? null
  }

  /**
   * Replace the record. Returns false if it could not be persisted.
   *
   * Refuses to persist over a record from a newer build. Reading one already
   * falls back to the default, and writing that default back would turn "this
   * old tab cannot read your data" into "this old tab erased it". The session
   * still runs from the cache; it just is not saved, which is the lesser loss.
   * Checked against storage as it is now, so a newer build that wrote from
   * another tab a moment ago is protected too.
   *
   * `write` replaces whatever is stored. To change the record, use `update`,
   * which applies the change to the newest stored version.
   */
  write(value: T): boolean {
    this.#sync()
    this.#cache = value
    this.#notify(value)

    if (this.#newerOnDisk) return false

    const raw = JSON.stringify({
      version: this.version,
      data: value,
    } satisfies Envelope)
    try {
      this.#driver.setItem(this.key, raw)
      this.#raw = raw
      return true
    } catch {
      // Quota exceeded, or private mode. The in-memory cache still holds the
      // value, so the session continues; it just will not survive a reload.
      return false
    }
  }

  /**
   * Read the newest stored record, transform it, write it.
   *
   * The read goes to storage first, so the change lands on top of anything
   * another tab wrote since this tab last looked, never on a stale copy.
   */
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
    // A reset is the user's explicit choice, so it may remove a newer record
    // too, and after it there is nothing newer left to protect.
    this.#cache = null
    this.#notify(this.read())
  }

  /**
   * Run arbitrary data through this store's own validator.
   *
   * Exists for the §22 import: a file the user hand-edited must go through
   * exactly the same checks as a normal read, rather than being trusted because
   * it arrived by a different door.
   */
  validateOrDefault(value: unknown): T {
    return this.#validate(value) ?? this.#createDefault()
  }

  /** Drop the cache so the next read hits storage. */
  invalidate(): void {
    this.#cache = null
  }

  /**
   * Re-read from storage, dropping anything only the cache held, and tell the
   * subscribers. For when the cache is known to be wrong: an import whose
   * write failed must not go on showing the data it failed to save.
   */
  reload(): T {
    this.#cache = null
    const value = this.read()
    this.#notify(value)
    return value
  }

  /** Subscribe to writes, here or in another tab. Returns an unsubscribe function. */
  subscribe(listener: StoreListener<T>): () => void {
    this.#listeners.add(listener)
    return () => void this.#listeners.delete(listener)
  }

  /** Another tab wrote. A null key means it cleared the whole storage. */
  #onStorage(event: StorageChange): void {
    if (event.key !== null && event.key !== undefined && event.key !== this.key) return
    if (event.storageArea !== undefined && event.storageArea !== this.#driver) return
    if (this.#sync()) this.#notify(this.#cache as T)
  }

  #notify(value: T): void {
    for (const listener of this.#listeners) listener(value)
  }
}
/* -------------------------------------------------------------------------- */
/* Shared instances                                                            */
/* -------------------------------------------------------------------------- */

/** Store instances per driver, then per key. */
const registry = new WeakMap<StorageDriver, Map<string, Store<unknown>>>()

/**
 * The one store for `options.key` over `driver`, created on first use.
 *
 * Every factory goes through this, so every screen on a page holds the same
 * instance and the same cache. Separate instances each kept their own cache,
 * and the last to write won: a practice screen unlocking a stage from its
 * mount-time copy erased the answers the session had just written, and a
 * second banking call paid the one-time first-signal XP again.
 *
 * Keyed by driver as well as key, so a test that passes its own memory driver
 * gets a fresh instance without touching anyone else's.
 */
export function sharedStore<T>(options: StoreOptions<T>, driver?: StorageDriver): Store<T> {
  const target = driver ?? defaultDriver()
  let stores = registry.get(target)
  if (!stores) {
    stores = new Map()
    registry.set(target, stores)
  }
  const existing = stores.get(options.key)
  // One record type per key is the whole premise of a storage key, so the
  // instance registered under it is a Store of that record.
  if (existing) return existing as Store<T>
  const created = new Store<T>(options, target)
  stores.set(options.key, created as Store<unknown>)
  return created
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

/**
 * A non-negative integer, or the fallback, never above `max`.
 *
 * The ceiling defaults to the largest integer a double holds exactly. Past it,
 * `n + 1 === n`, and arithmetic that counts up to a target (a level from XP,
 * say) can loop forever on a number someone typed into an export.
 */
export function count(value: unknown, fallback = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return fallback
  return Math.min(value, max)
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
