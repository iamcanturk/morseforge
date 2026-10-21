import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from '../../analytics/track'
import {
  MESSAGE_PATH,
  decodeMessageLink,
  describeProblem,
  type DecodeResult,
} from '../../game/messageLink'
import { Compose } from './Compose'
import { Incoming } from './Incoming'
import { useSettings, useWire } from './useWire'

/**
 * The wire-office desk: the composer when the link carries nothing, the
 * incoming telegram when it carries a message, and a plain explanation when
 * it carries something broken.
 *
 * The message is read from `location.hash` only, on the device. It is never
 * sent anywhere: not to analytics (the event carries its name and nothing
 * else), not in a request, not into storage.
 */

type View =
  | { kind: 'loading' }
  | { kind: 'compose'; focus: boolean; replyTo?: string }
  | { kind: 'incoming'; result: Extract<DecodeResult, { ok: true }> }
  | { kind: 'broken'; result: Extract<DecodeResult, { ok: false }> }

/**
 * The `m=` key of a message link. The page's inline script runs the same test
 * before hydration (a test keeps the two identical).
 */
export const MESSAGE_KEY = /(^#?|&)m=/

/**
 * Whether a fragment is somewhere on the page rather than a message: the skip
 * link's `#main`, `#faq`, any element id, or anything else without the
 * `m=` key that does not decode as a message by hand. Following one of these
 * used to replace the composer, and its draft, with "Signal lost".
 *
 * A fragment without `m=` still counts as a message when it decodes whole (a
 * link trimmed by hand to its bare payload) and names no element.
 */
export function isPageAnchor(
  hash: string,
  result: DecodeResult,
  namesElement: (id: string) => boolean,
): boolean {
  if (hash.length <= 1 || MESSAGE_KEY.test(hash)) return false
  if (!result.ok) return true
  let id = hash.slice(1)
  try {
    id = decodeURIComponent(id)
  } catch {
    // A malformed escape cannot be an element id either way.
  }
  return namesElement(id)
}

function viewFor(result: DecodeResult): View {
  if (result.ok) return { kind: 'incoming', result }
  if (result.problem === 'none') return { kind: 'compose', focus: false }
  return { kind: 'broken', result }
}

/** Mirrors the page's inline script, so CSS knows which desk is showing. */
function mark(kind: View['kind']) {
  document.documentElement.dataset.message = kind === 'incoming' ? 'incoming' : 'compose'
}

export function MessageDesk() {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const settings = useSettings()
  const wire = useWire(settings)
  const top = useRef<HTMLDivElement>(null)
  const counted = useRef<string | null>(null)

  useEffect(() => {
    let shown = false
    const read = () => {
      const hash = window.location.hash
      const result = decodeMessageLink(hash)
      // An in-page anchor (the skip link's `#main`, `#faq`) is not a message,
      // broken or otherwise: it is navigation within whatever desk is showing.
      // Keep the composer and its draft, or the telegram being read, exactly
      // as they are. On a first load there is nothing showing yet, so the
      // composer opens, as for no hash at all.
      const anchor = isPageAnchor(hash, result, (id) => document.getElementById(id) !== null)
      if (shown && anchor) return
      shown = true
      wire.stop()
      const next: View = anchor ? { kind: 'compose', focus: false } : viewFor(result)
      mark(next.kind)
      setView(next)
      // One count per distinct link opened, whatever the outcome — and only
      // the outcome, never the link.
      if (next.kind !== 'compose' && counted.current !== hash) {
        counted.current = hash
        track('message_open', next.kind === 'incoming' ? 'ok' : 'broken')
      }
    }
    read()
    window.addEventListener('hashchange', read)
    window.addEventListener('popstate', read)
    return () => {
      window.removeEventListener('hashchange', read)
      window.removeEventListener('popstate', read)
    }
    // `wire.stop` is stable; reading the hash again on every render is not wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Write a message: a reply to the one just read (its text is kept, so the
   * composer can say what it answers), or a fresh one from a broken link.
   */
  const reply = useCallback(
    (original?: string) => {
      wire.stop()
      // Drop the received message from the address bar, keeping it in history:
      // Back returns to it.
      window.history.pushState(null, '', MESSAGE_PATH)
      mark('compose')
      setView({ kind: 'compose', focus: true, replyTo: original })
      top.current?.scrollIntoView({ block: 'start' })
    },
    [wire],
  )

  return (
    <div
      ref={top}
      className="mf-instrument mfm-desk p-5 sm:p-8"
      aria-busy={view.kind === 'loading'}
    >
      {view.kind === 'loading' && <Standby />}
      {view.kind === 'compose' && (
        <Compose
          settings={settings}
          wire={wire}
          autoFocus={view.focus}
          replyTo={view.replyTo ?? null}
        />
      )}
      {view.kind === 'incoming' && (
        <Incoming message={view.result.message} settings={settings} wire={wire} onReply={reply} />
      )}
      {view.kind === 'broken' && <Broken problem={view.result.problem} onWrite={() => reply()} />}
    </div>
  )
}

/**
 * Before hydration. Hidden without JavaScript (the page explains itself in a
 * noscript block instead); with it, this shows for the moment before the hash
 * is read. Shapes, not words, so it cannot say the wrong thing.
 */
function Standby() {
  return (
    <div className="mfm-standby grid gap-6" role="status">
      <span className="sr-only">Opening the wire</span>
      <div className="h-4 w-40 rounded-chip bg-elevated" />
      <div className="h-9 w-4/5 rounded-chip bg-elevated" />
      <div className="mf-tape h-24" />
      <div className="h-14 w-full rounded-control bg-elevated" />
    </div>
  )
}

function Broken({
  problem,
  onWrite,
}: {
  problem: Exclude<DecodeResult, { ok: true }>['problem']
  onWrite: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <span className="mf-engraved">Incoming wire</span>
      <div className="mfm-slip grid grid-cols-1 gap-3">
        <span className="mf-stamp mfm-stamp mfm-paper-danger justify-self-start">Signal lost</span>
        <h2 className="font-display text-h2 text-paper-ink">This message did not arrive whole.</h2>
        <p className="text-paper-ink">
          {problem === 'none' ? describeProblem('empty') : describeProblem(problem)}
        </p>
        <p className="text-sm text-paper-muted">
          Ask whoever sent it to copy the whole link again, everything after the # included.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="mf-btn mf-btn-primary" onClick={onWrite}>
          Write a message
        </button>
        <a className="mf-btn mf-btn-secondary" href="/learn/">
          Learn Morse code
        </a>
      </div>
    </div>
  )
}
