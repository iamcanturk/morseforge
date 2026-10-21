import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { track } from '../../analytics/track'
import type { Achievement } from '../../game/achievements'
import {
  MESSAGE_MAX,
  checkMessage,
  describeProblem,
  encodeMessageLink,
  messageCells,
  stripUnsupported,
} from '../../game/messageLink'
import { bankActivity } from '../../storage/activity'
import type { SettingsRecord } from '../../storage/settings'
import { Lamp } from '../ui/Lamp'
import { Segmented } from '../ui/Segmented'
import {
  SPEEDS,
  cellOwners,
  cellsToMorse,
  messageTiming,
  nearestSpeed,
  type Speed,
} from './playback'
import { Tape } from './Tape'
import { buildTimeline } from '../../engine/timingEngine'
import type { useWire } from './useWire'

/** A few things worth sending, for an empty form. Plain words, no codes. */
const IDEAS = ['SOS', 'Meet me at nine', 'You can read this', '73'] as const

/**
 * Answers an operator would send back (J-17): "R R", received, received;
 * "73", best regards; "OK". Plain text: the link encodes them like any other.
 */
const REPLIES = ['R R', '73', 'OK'] as const

export type ShareState = 'idle' | 'shared' | 'copied' | 'copy-failed'

interface Created {
  url: string
  text: string
  earned: Achievement[]
}

export interface ComposeProps {
  settings: SettingsRecord
  wire: ReturnType<typeof useWire>
  /** Prefill, e.g. "Reply" starts empty but focused. */
  autoFocus?: boolean
  /**
   * The message being answered, when this is a reply. Shown above the form so
   * the context is not lost the moment Reply is pressed (J-17). It came from
   * a link, so it is rendered as text, never as markup.
   */
  replyTo?: string | null
}

/** The one line a screen reader hears when the link is made (A11Y-20). */
export function readyAnnouncement(share: ShareState, earned: readonly string[]): string {
  const said =
    share === 'shared'
      ? 'Link ready and sent through your share sheet.'
      : share === 'copied'
        ? 'Link ready and copied. Paste it into any chat.'
        : share === 'copy-failed'
          ? 'Link ready. Copy it from the box.'
          : 'Link ready. Share it, copy it or open it.'
  return earned.length > 0 ? `${said} Earned: ${earned.join(', ')}.` : said
}

export function Compose({ settings, wire, autoFocus = false, replyTo = null }: ComposeProps) {
  const [draft, setDraft] = useState('')
  const [speed, setSpeed] = useState<Speed>(() => nearestSpeed(settings.timing.wpm))
  const [created, setCreated] = useState<Created | null>(null)
  const [share, setShare] = useState<ShareState>('idle')
  const [canShare, setCanShare] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const linkField = useRef<HTMLInputElement>(null)
  /** The slip's first action, which takes focus once the link exists (A11Y-20). */
  const firstAction = useRef<HTMLButtonElement>(null)
  /** Messages already banked on this visit, so re-creating one counts once. */
  const banked = useRef(new Set<string>())
  const ids = { field: useId(), counter: useId(), problem: useId(), privacy: useId() }

  useEffect(() => setCanShare(typeof navigator.share === 'function'), [])
  useEffect(() => {
    if (autoFocus) field.current?.focus()
  }, [autoFocus])
  // Follow the settings speed until the sender picks one here.
  const picked = useRef(false)
  useEffect(() => {
    if (!picked.current) setSpeed(nearestSpeed(settings.timing.wpm))
  }, [settings.timing.wpm])

  const check = useMemo(() => checkMessage(draft), [draft])
  // Only what will actually be sent goes on the tape.
  const cells = useMemo(() => messageCells(stripUnsupported(check.text)), [check.text])
  const typed = draft.trim().length > 0
  // "Empty" is the resting state, not an error worth announcing.
  const problem = !check.ok && check.problem !== 'empty' ? check : null
  const over = check.length > MESSAGE_MAX

  const edit = (value: string) => {
    setDraft(value)
    if (created) {
      // The link was for the old text; never leave a stale one on screen.
      setCreated(null)
      setShare('idle')
    }
  }

  const preview = () => {
    if (wire.playing) {
      wire.stop()
      return
    }
    const morse = cellsToMorse(cells)
    const timing = messageTiming(speed, settings)
    void wire.send({ morse, timing, owners: cellOwners(buildTimeline(morse, timing), cells) })
  }

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setShare('copied')
    } catch {
      // No clipboard permission (an embedded browser, an old WebView): the
      // link is already selected in the box for a manual copy.
      setShare('copy-failed')
      linkField.current?.select()
    }
  }

  const shareLink = async (url: string) => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'A secret message in Morse code',
          text: 'I sent you a message in Morse code. Can you read it?',
          url,
        })
        setShare('shared')
        return
      } catch (error) {
        // Closing the share sheet is a choice, not a failure: leave the link
        // where it is and say nothing.
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copy(url)
  }

  const create = async () => {
    const result = encodeMessageLink(draft, { wpm: speed, origin: window.location.origin })
    if (!result.ok) return
    wire.stop()
    // One message is one message, however many times its link is rebuilt
    // (a new speed, a second share): count it once per visit, so pressing
    // Create again cannot inflate the sent count.
    let earned: Created['earned'] = []
    if (!banked.current.has(result.text)) {
      banked.current.add(result.text)
      earned = bankActivity({ message: true }).earned
      track('message_create')
    }
    setCreated({ url: result.url, text: result.text, earned })
    setShare('idle')
    await shareLink(result.url)
    // Focus stayed on "Create link", behind the slip it just made: hand it to
    // the slip's first action, Share (or Copy link where there is no share).
    firstAction.current?.focus()
  }

  const counterTone = over ? 'mfm-paper-danger font-bold' : ''

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex items-center justify-between gap-4">
        <span className="mf-engraved flex items-center gap-2">
          <Lamp on={typed} tone="amber" />
          Outgoing telegram
        </span>
        <span className="mf-engraved hidden sm:inline">Plain words in, Morse out</span>
      </div>

      {replyTo && (
        <figure className="mfm-reply">
          <figcaption className="mf-engraved">Replying to</figcaption>
          <blockquote className="mfm-reply-text">{replyTo}</blockquote>
        </figure>
      )}

      {/* The form */}
      <div className="mfm-form">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.field} className="mfm-form-label">
            Your message
          </label>
          <span
            id={ids.counter}
            className={`mfm-form-label tabular-nums ${counterTone}`}
            aria-label={`${check.length} of ${MESSAGE_MAX} characters`}
          >
            {check.length} / {MESSAGE_MAX}
          </span>
        </div>
        <textarea
          ref={field}
          id={ids.field}
          className="mfm-form-field"
          rows={3}
          value={draft}
          onChange={(event) => edit(event.target.value)}
          placeholder="Type it in plain words"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={problem ? true : undefined}
          aria-describedby={`${ids.counter} ${problem ? ids.problem : ''} ${ids.privacy}`.trim()}
        />
        <p id={ids.problem} className="mfm-form-note min-h-6" aria-live="polite">
          {problem && (
            <span className="mfm-paper-danger">
              <span aria-hidden="true">✕ </span>
              {describeProblem(problem.problem, problem)}{' '}
              {problem.problem === 'unsupported' && (
                <button
                  type="button"
                  className="underline decoration-1 underline-offset-4"
                  onClick={() => edit(stripUnsupported(draft))}
                >
                  Remove {problem.unsupported.length === 1 ? 'it' : 'them'}
                </button>
              )}
              {problem.problem === 'too-long' && 'Shorter is easier to decode, too.'}
            </span>
          )}
        </p>
      </div>

      {/* Empty state: a nudge, not a lecture. A reply offers the answers an
          operator would send back. */}
      {!typed && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mf-engraved w-full sm:mr-1 sm:w-auto">
            {replyTo ? 'Quick reply' : 'Need an idea?'}
          </span>
          {(replyTo ? REPLIES : IDEAS).map((idea) => (
            <button
              key={idea}
              type="button"
              className="mf-chip-link"
              onClick={() => {
                edit(idea)
                field.current?.focus()
              }}
            >
              {idea}
            </button>
          ))}
        </div>
      )}

      {/* Live preview on tape */}
      {typed && cells.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          <span className="mf-engraved">How it will go down the wire</span>
          <Tape
            cells={cells}
            shown={cells.map(() => true)}
            active={wire.cell}
            label="Your message in Morse code"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Segmented
          label="Sending speed"
          size="sm"
          value={speed}
          onChange={(value) => {
            picked.current = true
            setSpeed(value)
            if (created) setCreated(null)
          }}
          options={SPEEDS.map((option) => ({
            value: option.value,
            label: option.label,
            ariaLabel: `${option.label}, ${option.value} words per minute`,
          }))}
        />
        {/* One look for every "play the sound" button (V-18, C-2). */}
        <button
          type="button"
          className="mf-btn mf-btn-audio mf-btn-sm"
          onClick={preview}
          disabled={!check.ok}
        >
          <Lamp on={wire.playing} tone="cyan" />
          {wire.playing ? 'Stop' : 'Hear it'}
        </button>
      </div>

      <div className="grid gap-3">
        <button
          type="button"
          className="mf-btn mf-btn-primary mf-btn-lg mf-btn-block"
          onClick={() => void create()}
          disabled={!check.ok}
        >
          Create link
        </button>
        <p id={ids.privacy} className="text-sm text-muted">
          The message rides after the # in the link, a part browsers never send to any server,
          including this one. It is not encrypted: anyone with the link can read it.
        </p>
      </div>

      {/* One short line for a screen reader, mounted before it has anything
          to say, or the first announcement is dropped. The slip itself is not
          live: read as one, it was every control and the achievements in a
          single breath (A11Y-20). */}
      <p role="status" className="sr-only">
        {created
          ? readyAnnouncement(
              share,
              created.earned.map((achievement) => achievement.title),
            )
          : ''}
      </p>

      {created && (
        <section
          className="mf-slip mfm-slip grid grid-cols-1 gap-4"
          aria-labelledby={`${ids.field}-ready`}
        >
          <div className="mfm-slip-head">
            <h2 id={`${ids.field}-ready`} className="font-display text-h3 text-paper-ink">
              Your link is ready
            </h2>
            <span className="mf-stamp mf-stamp-in mfm-stamp shrink-0 text-paper-ink">
              On the wire
            </span>
          </div>
          <p className="text-sm text-paper-muted">
            {share === 'shared' && 'Sent through your share sheet.'}
            {share === 'copied' && 'Copied. Paste it into any chat.'}
            {share === 'copy-failed' && 'Copy it from the box below.'}
            {share === 'idle' && 'Send it to someone and see if they can read it.'}
          </p>

          <label className="sr-only" htmlFor={`${ids.field}-link`}>
            Message link
          </label>
          <input
            ref={linkField}
            id={`${ids.field}-link`}
            className="mfm-link"
            readOnly
            value={created.url}
            onFocus={(event) => event.currentTarget.select()}
          />

          <div className="grid gap-2 sm:flex sm:flex-wrap">
            {canShare && (
              <button
                ref={firstAction}
                type="button"
                className="mf-btn mf-btn-primary mf-btn-sm"
                onClick={() => void shareLink(created.url)}
              >
                Share
              </button>
            )}
            <button
              ref={canShare ? undefined : firstAction}
              type="button"
              className="mf-btn mfm-btn-paper mf-btn-sm"
              onClick={() => void copy(created.url)}
            >
              {share === 'copied' ? 'Copied' : 'Copy link'}
            </button>
            <a className="mf-btn mfm-btn-paper mf-btn-sm" href={created.url}>
              Open it yourself
            </a>
          </div>

          {created.earned.map((achievement) => (
            <p key={achievement.id} className="mfm-earned">
              <span aria-hidden="true">{achievement.icon}</span>
              <span>
                <strong className="font-mono text-control uppercase">
                  Earned: {achievement.title}
                </strong>
                <span className="block text-sm text-paper-muted">{achievement.description}</span>
              </span>
            </p>
          ))}
        </section>
      )}
    </div>
  )
}
