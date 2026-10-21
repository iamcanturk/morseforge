/**
 * Helpers for writing a message table, kept apart from the tables so that a
 * React island can import the types without importing any English.
 */

import type { Message } from './message'

/** A namespace's table with every key prefixed: `{ hint }` in `lesson` → `lesson.hint`. */
export type Prefixed<N extends string, T> = {
  readonly [K in keyof T & string as `${N}.${K}`]: T[K]
}

/** Prefix a table's keys with its namespace at runtime, matching `Prefixed`. */
export function namespace<const N extends string, const T extends Record<string, Message>>(
  name: N,
  table: T,
): Prefixed<N, T> {
  const out: Record<string, Message> = {}
  for (const [key, value] of Object.entries(table)) out[`${name}.${key}`] = value
  return out as Prefixed<N, T>
}

/**
 * Marks an entry as not translated yet. It renders the English, and the
 * coverage report counts it, so a half-done language can ship honestly and a
 * reviewer can see exactly what is left. Leaving the key out instead is a type
 * error: every language lists every key.
 */
export const UNTRANSLATED: unique symbol = Symbol('untranslated')
export type Untranslated = typeof UNTRANSLATED
