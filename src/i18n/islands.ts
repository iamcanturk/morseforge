/**
 * Which namespaces each React island receives.
 *
 * An island gets its strings as a prop, resolved on the server for the page's
 * language, so the browser downloads one language and only the parts of it
 * the island uses. The list is per island root and covers everything the root
 * renders, nested components included; `islands.test.ts` walks each root's
 * imports and fails when a component uses a key from a namespace its island
 * was not given.
 */

import type { Namespace } from './keys'
import type { Message } from './message'
import type { LocaleInfo } from './translator'

export const ISLANDS = {
  /** Shared by every island. */
  base: ['format'],
  /** /practice/ and /challenge/: practice, the timed challenge, the result and sharing. */
  practice: [
    'format',
    'modes',
    'methods',
    'practice',
    'result',
    'challenge',
    'share',
    'lesson',
    'achievements',
    'tree',
    'key',
    'terms',
  ],
  /** /tree/: the board, its inspector and the one-character drill. */
  tree: ['format', 'tree', 'achievements', 'key', 'terms'],
  /** /stats/: progress, the next step and the achievements. */
  stats: ['format', 'stats', 'nextAction', 'achievements', 'modes'],
  /** /telegraph/: the key, its tape, the tree and sharing a telegram. */
  telegraph: ['format', 'key', 'terms', 'telegraph', 'tree', 'achievements'],
  /** /settings/: the control panel. */
  settings: ['format', 'settings', 'terms', 'methods'],
  /** /games/signal-defender/: the receiving game. */
  defender: ['format', 'games', 'defender', 'achievements'],
  /** /games/morse-runner/: the sending game, on the same key as the telegraph. */
  runner: ['format', 'games', 'runner', 'achievements', 'key', 'terms'],
  /** /learn/: the lesson, with the practice screen as its drill. */
  lesson: [
    'format',
    'modes',
    'methods',
    'practice',
    'result',
    'challenge',
    'share',
    'lesson',
    'achievements',
    'tree',
    'key',
    'terms',
  ],
} as const satisfies Record<string, readonly Namespace[]>

export type Island = keyof typeof ISLANDS

/** What an island root takes as its `i18n` prop. Plain data: it is serialised into the HTML. */
export interface IslandMessages {
  locale: LocaleInfo
  messages: Readonly<Record<string, Message>>
}
