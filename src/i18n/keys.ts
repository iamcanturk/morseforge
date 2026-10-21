/**
 * The catalog's shape, as types only. Importing this file costs nothing at run
 * time, so a component can name a key without bundling the English.
 */

import type { EnMessages } from './en'

export type Messages = EnMessages
export type MessageKey = keyof Messages & string

/** The namespace a key belongs to: `lesson.hint` → `lesson`. */
export type Namespace = MessageKey extends `${infer N}.${string}` ? N : never

/** The keys of one or more namespaces. */
export type KeysIn<N extends Namespace> = Extract<MessageKey, `${N}.${string}`>
