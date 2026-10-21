import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { KeyStation, releaseFocus, type KeyStationAction } from './KeyStation'
import { SignalTrace } from './MorseKey'
import { KeyerSpeedPicker } from './KeyerSpeedPicker'
import {
  cleanMessage,
  drawTelegram,
  ensureFonts,
  localDate,
  telegramBlob,
  telegramDescription,
  telegramMessageUrl,
  telegramShare,
  telegramText,
} from './telegramCard'
import { shareData } from '../../game/share'
import { useMorseKey } from './useMorseKey'
import { useInView } from './useInView'
import { SignalTree } from '../SignalTree/SignalTree'
import { Segmented } from '../ui/Segmented'
import { SITE } from '../../config/site'
import { encode, prettify } from '../../engine/morseEncoder'
import { spokenCode } from '../../engine/spokenCode'
import { UNKNOWN_CHARACTER } from '../../engine/morseDecoder'
import type { Achievement } from '../../game/achievements'
import {
  EASTER_EGGS,
  NAME_MAX,
  checkTarget,
  detectEasterEgg,
  findEgg,
  isMessageWord,
  lastWord,
  sendable,
  type EasterEggId,
  type EggHit,
  type TargetCheck,
} from '../../game/easterEggs'
import { bankActivity, type ActivityResult } from '../../storage/activity'
import {
  KEYER_PRESETS,
  type KeyerPreset,
  type SettingsRecord,
  createSettingsStore,
  defaultSettings,
} from '../../storage/settings'
import { LIGHT } from '../../styles/palette'
import { track } from '../../analytics/track'

/**
 * The real-time telegraph (PROJECT.md §14, §15, §49, §50).
 *
 * Key it, see it printed as you go. This is the screen that has to feel
 * immediate — §57 puts the whole growth argument on sending being fun, not on
 * the learning being thorough. So the page is never blank (it opens on a
 * target), the tape sits directly above the key at every width, and the four
 * words every operator knows get an answer from the instrument.
 *
 * Everything sent is banked through `bankActivity`: elements once per
 * committed character, a message once per real word. That is what makes First
 * Signal and CQ CQ CQ earnable here, where they are earned, and they are shown
 * here rather than in a toast somewhere else.
 */

type TargetId = 'free' | EasterEggId | 'name'

/** The targets on offer. Eggs double as targets, so their words come from the data. */
const TARGETS: readonly { id: TargetId; label: string }[] = [
  { id: 'sos', label: findEgg('sos').word },
  { id: 'cq', label: findEgg('cq').word },
  { id: 'name', label: 'Your name' },
  { id: 'free', label: 'Free' },
]

/** How long an answer from the instrument stays on the status line. */
const NOTICE_MS = 6500
/** How long the "signal detected" lamp stays lit after the first character. */
const MOMENT_MS = 2400

type Notice =
  { kind: 'achievement'; achievement: Achievement; xp: number } | { kind: 'egg'; hit: EggHit }

export function TelegraphScreen() {
  const store = useMemo(() => createSettingsStore(), [])

  // Settings start at defaults rather than being read during render: this is
  // prerendered in Node, and differing markup would tear hydration.
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  // Closed until we know the screen is wide: the tree is 560px by design, and
  // on a phone it only pushes everything else further from the key.
  const [showTree, setShowTree] = useState(false)
  const [target, setTarget] = useState<TargetId>('sos')
  const [name, setName] = useState('')
  const [attemptFrom, setAttemptFrom] = useState(0)
  const [egg, setEgg] = useState<{ hit: EggHit; n: number } | null>(null)
  // A queue, so an answer and an achievement that land on the same character
  // are both read, one after the other, instead of the second hiding the first.
  const [notices, setNotices] = useState<readonly Notice[]>([])
  const notice = notices[0] ?? null
  const [earned, setEarned] = useState<Achievement[]>([])
  const [moment, setMoment] = useState<{ n: number } | null>(null)
  const [sentMessage, setSentMessage] = useState(false)
  const [shareDismissed, setShareDismissed] = useState(false)

  useEffect(() => {
    setShowTree(window.matchMedia('(min-width: 1024px)').matches)
  }, [])

  useEffect(() => {
    setSettings(store.read())
    return store.subscribe(setSettings)
  }, [store])

  // Banking state lives in refs: none of it is drawn, and all of it must
  // survive the re-render every keyed element causes.
  const unbanked = useRef(0)
  const lastCode = useRef('')
  const previousText = useRef('')
  const messageBankedTo = useRef(0)
  const eggsCounted = useRef(new Set<EasterEggId>())
  const firstCharacter = useRef(true)
  const eggCount = useRef(0)
  const momentCount = useRef(0)
  const keyButton = useRef<HTMLButtonElement>(null)
  const station = useRef<HTMLDivElement>(null)
  /** The telegram card as a PNG, drawn by the share panel, shared by either share control. */
  const card = useRef<File | null>(null)
  const timers = useRef<{ egg?: number; moment?: number }>({})

  // Space keys the instrument only while it is on screen (DEC-028). Below it
  // are the guide and the FAQ, and there Space has to page down like it does
  // everywhere else. The on-screen key answers pointers and its own focus
  // either way.
  const stationInView = useInView(station)

  const morseKey = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    characterGapMs: settings.timing.characterGapMs,
    wordGapMs: settings.timing.wordGapMs,
    autoCommit: settings.timing.autoCommit,
    bindings: settings.keys,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
    windowKeys: stationInView,
    // Counted, not banked: banking waits for the character, so a held-down
    // key does not write to storage on every element.
    onElement: () => {
      unbanked.current += 1
    },
    // Counted per word rather than per character: a character is a
    // keystroke, a word is someone actually sending something.
    onWord: () => track('telegraph_send'),
  })
  const { state } = morseKey

  // The code of the character in progress, kept after it commits: the egg
  // detector needs to know how an unreadable mark was keyed (an SOS sent as one
  // prosign decodes as unknown, and only its elements say what it was).
  useEffect(() => {
    if (state.pending) lastCode.current = state.pending
  }, [state.pending])

  const showNotice = useCallback((next: Notice) => {
    setNotices((queue) => [...queue, next].slice(-3))
  }, [])

  // Each notice holds the line for a while, then gives way to the next.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotices((queue) => queue.slice(1)), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  const report = useCallback(
    (result: ActivityResult) => {
      if (result.earned.length === 0) return
      setEarned((previous) => [
        ...previous,
        ...result.earned.filter((a) => !previous.some((p) => p.id === a.id)),
      ])
      const latest = result.earned.at(-1)
      if (latest) showNotice({ kind: 'achievement', achievement: latest, xp: result.xp })
    },
    [showNotice],
  )

  /** Bank the elements keyed since the last character, if any. */
  const flush = useCallback(() => {
    const elements = unbanked.current
    if (elements === 0) return
    unbanked.current = 0
    report(bankActivity({ elements }))
  }, [report])

  const bankMessage = useCallback(
    (end: number) => {
      // One message per stretch of text: finishing a target and then the
      // word gap that follows it is one message, not two.
      if (messageBankedTo.current >= end) return
      messageBankedTo.current = end
      report(bankActivity({ message: true }))
      setSentMessage(true)
    },
    [report],
  )

  const targetText = useMemo(() => {
    if (target === 'free') return ''
    if (target === 'name') return name.trim()
    return findEgg(target).word
  }, [target, name])

  const sentSinceTarget = state.text.slice(attemptFrom)
  const check = targetText ? checkTarget(targetText, sentSinceTarget) : null

  // Refs for the commit effect, which must read the newest target without
  // re-running when only the target changed.
  const latest = useRef({ targetText, attemptFrom })
  latest.current = { targetText, attemptFrom }

  // Everything that happens when the decoded text changes: a character
  // printed, a word finished, or the tape cleared.
  useEffect(() => {
    const previous = previousText.current
    const text = state.text
    previousText.current = text
    if (text === previous) return
    if (!text.startsWith(previous)) {
      // Cleared. Nothing to bank or detect; the counters start again.
      messageBankedTo.current = 0
      return
    }

    const added = text.slice(previous.length)
    const upTo = text.trimEnd()

    if (/\S/.test(added)) {
      flush()

      if (firstCharacter.current) {
        firstCharacter.current = false
        momentCount.current += 1
        setMoment({ n: momentCount.current })
        window.clearTimeout(timers.current.moment)
        timers.current.moment = window.setTimeout(() => setMoment(null), MOMENT_MS)
      }

      const hit = detectEasterEgg({ text: upTo, code: lastCode.current })
      if (hit) {
        eggCount.current += 1
        setEgg({ hit, n: eggCount.current })
        window.clearTimeout(timers.current.egg)
        timers.current.egg = window.setTimeout(() => setEgg(null), NOTICE_MS)
        showNotice({ kind: 'egg', hit })
        // Once per egg per visit: the count is of people finding it, not of
        // how many times one person sent CQ.
        if (!eggsCounted.current.has(hit.egg.id)) {
          eggsCounted.current.add(hit.egg.id)
          track('easter_egg', hit.egg.id)
        }
      } else {
        setEgg(null)
      }

      const { targetText: wanted, attemptFrom: from } = latest.current
      if (wanted && checkTarget(wanted, text.slice(from)).done) {
        const before = checkTarget(wanted, previous.slice(from))
        if (!before.done) bankMessage(upTo.length)
      }
    }

    if (added.includes(' ')) {
      const word = lastWord(text)
      if (isMessageWord(word)) bankMessage(upTo.length)
    }
  }, [state.text, flush, bankMessage, showNotice])

  // Bank what is in flight when the page goes away; pagehide is the last
  // event a phone reliably delivers.
  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    const pending = timers.current
    return () => {
      window.removeEventListener('pagehide', onHide)
      window.clearTimeout(pending.egg)
      window.clearTimeout(pending.moment)
      flush()
    }
  }, [flush])

  const onAction = useCallback(
    (action: KeyStationAction) => {
      // Elements keyed into an abandoned character were still keyed.
      if (action === 'undo' || action === 'clear') flush()
      if (action === 'clear') {
        setAttemptFrom(0)
        setEgg(null)
        setSentMessage(false)
        setShareDismissed(false)
      }
    },
    [flush],
  )

  const chooseTarget = useCallback(
    (next: TargetId) => {
      setTarget(next)
      setAttemptFrom(state.text.length)
      setEgg(null)
    },
    [state.text.length],
  )

  const again = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      releaseFocus(event)
      setAttemptFrom(state.text.length)
    },
    [state.text.length],
  )

  const applyPreset = useCallback(
    (preset: KeyerPreset) => {
      const values = KEYER_PRESETS[preset]
      store.update((current) => ({
        ...current,
        timing: {
          ...current.timing,
          characterGapMs: values.characterGapMs,
          wordGapMs: values.wordGapMs,
          autoCommit: values.autoCommit,
        },
      }))
    },
    [store],
  )

  const decoded = state.text.trimEnd()
  const hasUnknown = decoded.includes(UNKNOWN_CHARACTER)
  const shareable = cleanMessage(decoded.replaceAll(UNKNOWN_CHARACTER, ' '))
  const showShare = sentMessage && !shareDismissed && shareable.length > 0
  const nameId = useId()
  const sendLabelId = useId()

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
      {/* `min-w-0` is load-bearing. A grid item defaults to `min-width: auto`,
          which refuses to shrink below its content's minimum — and the tree
          inside is 560px wide by design. On a 375px screen the whole page
          used to scroll sideways. */}
      <section
        className="mf-instrument min-w-0 p-4 pt-6 sm:p-6 lg:p-8"
        aria-labelledby={sendLabelId}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          <span id={sendLabelId} className="mf-engraved max-sm:sr-only">
            Send
          </span>
          {/* A finger tap leaves focus on the segment, and Space would then
              re-select it instead of keying; hand focus back to the page. */}
          <div onClick={(event) => releaseFocus(event)}>
            <Segmented
              label="What to send"
              labelledBy={sendLabelId}
              value={target}
              options={TARGETS.map((option) => ({ value: option.id, label: option.label }))}
              onChange={chooseTarget}
              size="sm"
            />
          </div>
        </div>

        {target === 'name' && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
            <label htmlFor={nameId} className="mf-engraved">
              Your name
            </label>
            <input
              id={nameId}
              className="mf-input w-full max-w-60 py-2 font-mono uppercase tracking-label"
              value={name}
              maxLength={NAME_MAX}
              autoComplete="given-name"
              spellCheck={false}
              placeholder="Ada"
              onChange={(event) => setName(sendable(event.target.value))}
              onKeyDown={(event) => {
                // Space types into the field, so Enter is the way out to the
                // key: focus moves to it, and Space keys from there.
                if (event.key === 'Enter') {
                  event.preventDefault()
                  setAttemptFrom(state.text.length)
                  keyButton.current?.focus()
                }
              }}
            />
            <span className="text-sm text-muted">
              <span className="pointer-coarse:hidden">Press Enter, then key it.</span>
              <span className="hidden pointer-coarse:inline">Then key it below.</span>
            </span>
          </div>
        )}

        <div ref={station} className="mt-4">
          <KeyStation
            morseKey={morseKey}
            settings={settings}
            tape="decoded"
            actions={['finish', 'word', 'undo', 'clear']}
            stickyTape
            moment={moment ? 'detected' : null}
            momentKey={moment?.n ?? 0}
            keyRef={keyButton}
            onAction={onAction}
            emptyTape={check ? 'Key the first letter' : 'Your message prints here'}
            tapeHeader={check ? <TargetLine target={targetText} check={check} /> : undefined}
            tapeOverlay={egg ? <EggStamp key={egg.n} hit={egg.hit} /> : undefined}
            status={
              <StatusLine
                notice={notice}
                check={check}
                target={target}
                onAgain={again}
                autoCommit={settings.timing.autoCommit}
              />
            }
          />
        </div>

        {/* Below lg the "Received" column comes after the whole desk, about
            1,000px under the key: a sender never saw what they had earned or
            that the telegram could be shared (J-16). So on a phone and a
            tablet both land here, right under the key, before the timing
            controls. The full panel, with the card, stays in the column. */}
        {(earned.length > 0 || showShare) && (
          <div className="mt-6 grid gap-3 lg:hidden">
            {earned.map((achievement) => (
              <AchievementSlip key={achievement.id} achievement={achievement} />
            ))}
            {showShare && (
              <ShareBar
                message={shareable}
                image={card}
                onDismiss={() => setShareDismissed(true)}
              />
            )}
          </div>
        )}

        {/* One column that cannot grow past the panel: the timing trace's
            marks do not shrink, and a long run of them used to widen the
            column, and the option group with it, past the panel's edge. */}
        <div className="mt-8 grid grid-cols-1 gap-6 border-t border-line pt-6">
          <KeyerSpeedPicker timing={settings.timing} onChange={applyPreset} />
          <div className="min-w-0">
            <span className="mf-engraved">Your timing</span>
            <SignalTrace
              className="mt-2"
              elements={state.recent}
              thresholdMs={settings.timing.dotDashThresholdMs}
            />
          </div>
        </div>

        {/* The tree, walking itself as you key. Watching the path light up is
            how the structure stops being a diagram and starts being somewhere
            you can feel where you are. */}
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <span className="mf-engraved">Where you are in the tree</span>
            <button
              type="button"
              aria-expanded={showTree}
              onClick={(event) => {
                releaseFocus(event)
                setShowTree((on) => !on)
              }}
              className="mf-btn mf-btn-ghost mf-btn-sm"
            >
              {showTree ? 'Hide tree' : 'Show tree'}
            </button>
          </div>
          {showTree && (
            <SignalTree livePath={state.pending} highlight={null} className="mt-3 min-w-0" />
          )}
        </div>
      </section>

      <aside className="flex min-w-0 flex-col gap-6" aria-label="Received">
        <section className="mf-panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="mf-engraved">Received</h2>
            <span className="mf-engraved tabular-nums">
              {decoded ? `${decoded.replaceAll(' ', '').length} chars` : ''}
            </span>
          </div>

          {/* Not a live region: the tape already reads each character out as
              it prints, and announcing the same text twice is noise. */}
          <p className="mt-3 min-h-16 font-display text-h3 leading-snug break-words text-ink">
            {decoded ? (
              decoded
            ) : (
              <span className="font-body text-base text-muted">
                Nothing sent yet. What you key prints on the tape and here, in full.
              </span>
            )}
          </p>

          {decoded && (
            <div className="mt-5 border-t border-line pt-4">
              <span className="mf-engraved">As Morse</span>
              <p className="mt-2 font-mono text-sm tracking-label break-all text-cyan">
                {prettify(encode(decoded))}
              </p>
            </div>
          )}

          {hasUnknown && (
            <p className="mt-4 text-sm leading-relaxed text-amber">
              {UNKNOWN_CHARACTER} marks a sequence that is not a character, usually an extra element
              slipped in. Give yourself more time per character, or switch to Manual so nothing
              finishes until you say so.
            </p>
          )}
        </section>

        {earned.length > 0 && (
          <section aria-label="Earned on this visit" className="hidden flex-col gap-3 lg:flex">
            {earned.map((achievement) => (
              <AchievementSlip key={achievement.id} achievement={achievement} />
            ))}
          </section>
        )}

        {showShare && (
          <SharePanel message={shareable} image={card} onDismiss={() => setShareDismissed(true)} />
        )}

        <section className="mf-panel p-5">
          <h2 className="mf-engraved">Worth sending</h2>
          <ul className="mt-3 grid gap-2">
            {EASTER_EGGS.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3">
                {/* A 44px row under a finger (A11Y-12): the words alone were
                    targets 13px tall. */}
                <a
                  href={item.href}
                  className="font-mono text-control text-ink underline decoration-line-strong underline-offset-4 hover:decoration-signal pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center"
                >
                  {item.word}
                </a>
                <span className="font-mono text-sm tracking-label text-muted" aria-hidden="true">
                  {prettify(encode(item.word))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Parts                                                                       */
/* -------------------------------------------------------------------------- */

/** The target printed along the top of the tape, with what is done ticked off. */
function TargetLine({ target, check }: { target: string; check: TargetCheck }) {
  let index = -1
  return (
    <div
      className="kc-target"
      role="group"
      aria-label={target ? `Send ${target}` : 'Send your name'}
    >
      <span className="kc-target-label">Send</span>
      {target ? (
        <span className="kc-target-word" aria-hidden="true">
          {[...target.toUpperCase()].map((character, position) => {
            if (character === ' ') return <span key={position} className="kc-target-gap" />
            index += 1
            const state = index < check.matched ? 'done' : index === check.matched ? 'next' : 'todo'
            return (
              <span key={position} className="kc-target-char" data-state={state}>
                {character}
              </span>
            )
          })}
        </span>
      ) : (
        <span className="kc-target-hint">Type your name above</span>
      )}
      {check.done && <span className="kc-target-done">Sent</span>}
    </div>
  )
}

/** A rubber stamp landing on the tape. Transform and opacity only; static when still. */
function EggStamp({ hit }: { hit: EggHit }) {
  return (
    <span className="kc-stamp-slot" aria-hidden="true">
      <span className="mf-stamp mf-stamp-in kc-stamp" style={{ color: LIGHT[hit.egg.tone] }}>
        {hit.egg.word} · {hit.egg.stamp}
      </span>
    </span>
  )
}

/**
 * The one line under the tape, by priority: something just earned, an answer
 * from the instrument, the target's live check, then how to key.
 */
function StatusLine({
  notice,
  check,
  target,
  onAgain,
  autoCommit,
}: {
  notice: Notice | null
  check: TargetCheck | null
  target: TargetId
  onAgain: (event: MouseEvent<HTMLButtonElement>) => void
  autoCommit: boolean
}) {
  let body: ReactNode
  if (notice?.kind === 'achievement') {
    const { achievement, xp } = notice
    body = (
      <p className="kc-status-earned">
        <span aria-hidden="true">{achievement.icon}</span>{' '}
        <strong className="font-mono text-control text-amber uppercase">{achievement.title}</strong>{' '}
        <span className="text-ink">{achievement.description}</span>
        {xp > 0 && (
          <span className="mf-rise ml-2 inline-block font-mono text-control text-amber">
            +{xp} XP
          </span>
        )}
      </p>
    )
  } else if (notice?.kind === 'egg') {
    body = (
      <p>
        <span className="text-ink">{notice.hit.reply}</span>{' '}
        <a
          href={notice.hit.egg.href}
          className="whitespace-nowrap text-signal underline underline-offset-4"
        >
          More on {notice.hit.egg.word}
        </a>
      </p>
    )
  } else if (check && check.total > 0) {
    if (check.done) {
      body = (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-ink">
            Sent
            {check.slips > 0
              ? `, with ${check.slips} ${check.slips === 1 ? 'slip' : 'slips'}`
              : ' clean'}
            .
          </span>
          <button type="button" className="mf-btn mf-btn-ghost mf-btn-sm" onClick={onAgain}>
            Send it again
          </button>
        </p>
      )
    } else if (check.next) {
      const code = prettify(encode(check.next))
      body = (
        <p>
          {check.lastSlip && <span className="text-amber">That was {check.lastSlip}. </span>}
          <span>
            Next: <strong className="font-mono text-control text-ink">{check.next}</strong>{' '}
            {/* The glyphs read as "minus minus minus"; the ear gets words (A11Y-11). */}
            <span className="font-mono tracking-code text-cyan" aria-hidden="true">
              {code}
            </span>
            <span className="sr-only">{spokenCode(code)}</span>
          </span>
          {target === 'name' && check.matched === 0 && !check.lastSlip && (
            <span className="text-muted"> Letter by letter, with a pause between.</span>
          )}
        </p>
      )
    }
  }

  return (
    // Polite and atomic: an achievement or an answer is read out once, whole.
    <div aria-live="polite" aria-atomic="true">
      {body ?? (
        <p>
          Tap for a dot, hold for a dash.{' '}
          {autoCommit
            ? 'Pause to finish the character; the fuse shows how long you have.'
            : 'Then press Finish.'}
        </p>
      )}
    </div>
  )
}

/** An achievement, delivered as a telegram slip with a received stamp. */
function AchievementSlip({ achievement }: { achievement: Achievement }) {
  return (
    <article className="mf-tape mf-slip kc-slip">
      <span className="kc-slip-icon" aria-hidden="true">
        {achievement.icon}
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-base font-bold tracking-normal">{achievement.title}</h3>
        <p className="mt-0.5 font-body text-sm tracking-normal text-paper-muted">
          {achievement.description}
        </p>
      </div>
      {/* Ink in the green, as a rubber stamp is: at 12px the plain light-theme
          signal fell to 4.4:1 on the slip once the stamp settled at 0.9
          opacity. This mix holds at least 5.9:1 on either paper (A11Y-15). */}
      <span
        className="mf-stamp mf-stamp-in kc-slip-stamp"
        style={{ color: `color-mix(in srgb, ${LIGHT['paper-ink']} 35%, ${LIGHT.signal})` }}
      >
        Received
      </span>
    </article>
  )
}

/**
 * Sharing a telegram: the system share sheet with the card when the browser
 * takes files, else the text with its link, and copying as the fallback for
 * both. One implementation for the full panel and the compact bar under the
 * key, so the two can never disagree about what goes out.
 *
 * `image` holds the card as a PNG once the panel has drawn it. A share has to
 * start inside the tap's user activation, and awaiting the PNG first can
 * outlast it (iOS Safari), so it is encoded ahead of time and only read here.
 */
function useTelegramShare(message: string, image: RefObject<File | null>) {
  const statusTimer = useRef<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [canShareFiles, setCanShareFiles] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const text = telegramText(message, SITE.url)
  const sheet = useMemo(() => telegramShare(message, SITE.url), [message])
  const listenUrl = telegramMessageUrl(message, SITE.url)

  // Feature-detected after mount: `navigator` does not exist while this is
  // prerendered, and a button that appears after hydration beats one that
  // promises a share the browser cannot do.
  useEffect(() => {
    setCanShare(typeof navigator.share === 'function')
    try {
      const probe = new File([new Blob()], 'probe.png', { type: 'image/png' })
      setCanShareFiles(
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }),
      )
    } catch {
      setCanShareFiles(false)
    }
  }, [])

  // One timer at a time: a second note must not be cut short by the first
  // one's timer, and nothing may set state after the panel is dismissed.
  const flash = useCallback((note: string) => {
    if (statusTimer.current !== null) window.clearTimeout(statusTimer.current)
    setStatus(note)
    statusTimer.current = window.setTimeout(() => {
      statusTimer.current = null
      setStatus(null)
    }, 2400)
  }, [])

  useEffect(
    () => () => {
      if (statusTimer.current !== null) window.clearTimeout(statusTimer.current)
    },
    [],
  )

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      track('share_copy', 'telegraph')
      flash(listenUrl ? 'Copied the telegram and a link that plays it' : 'Copied the telegram')
    } catch {
      flash('Copying was blocked. Select the text below instead.')
    }
  }, [text, listenUrl, flash])

  const share = useCallback(async () => {
    track('share_open', 'telegraph')
    // Nothing is awaited before the share: see above.
    const file = canShareFiles ? image.current : null
    try {
      // The link (the one that plays the message, when it fits in one; else
      // the key) goes once, as the url: share targets append it to the text,
      // so a text that carried it too posted it twice (DEC-035). The image
      // prints its own link for the targets that drop the url beside a file.
      await navigator.share(shareData(sheet, file ? [file] : undefined))
    } catch (error) {
      // Dismissed: the person's choice, nothing to say.
      if (error instanceof DOMException && error.name === 'AbortError') return
      // Refused. Copy instead, and say so, rather than a button that does nothing.
      try {
        await navigator.clipboard.writeText(text)
        track('share_copy', 'telegraph')
        flash('Sharing was refused, so the telegram and its link were copied instead.')
      } catch {
        flash('Sharing was refused here. Use Copy text, or Save image.')
      }
    }
  }, [canShareFiles, image, sheet, text, flash])

  return { status, flash, canShare, copy, share, listenUrl }
}

/**
 * The compact share control under the key, below `lg` (J-16): the same
 * share and copy as the full panel, which stays further down with the card.
 * Dismissing it dismisses both.
 */
function ShareBar({
  message,
  image,
  onDismiss,
}: {
  message: string
  image: RefObject<File | null>
  onDismiss: () => void
}) {
  const { status, canShare, copy, share } = useTelegramShare(message, image)
  const headingId = useId()

  return (
    <section className="mf-panel mf-slip p-4" aria-labelledby={headingId}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="font-display text-base font-bold text-ink">
            Share this telegram
          </h2>
          <p className="mt-0.5 text-sm text-muted">With a link that plays it in Morse.</p>
        </div>
        <button
          type="button"
          className="mf-icon-btn -mt-1 -mr-2 shrink-0"
          aria-label="Dismiss sharing"
          onClick={onDismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canShare && (
          <button
            type="button"
            className="mf-btn mf-btn-primary mf-btn-sm"
            onClick={() => void share()}
          >
            Share
          </button>
        )}
        <button
          type="button"
          className="mf-btn mf-btn-secondary mf-btn-sm"
          onClick={() => void copy()}
        >
          Copy text
        </button>
        <a href="#kc-share" className="mf-btn mf-btn-ghost mf-btn-sm">
          See the card
        </a>
      </div>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-signal">
        {status}
      </p>
    </section>
  )
}

/**
 * "Share this as a telegram". Offered only once something real was sent, and
 * dismissible. The image is optional; the text, with the link, always works.
 */
function SharePanel({
  message,
  image,
  onDismiss,
}: {
  message: string
  /** Filled with the card as a PNG once it is drawn, for either share control. */
  image: RefObject<File | null>
  onDismiss: () => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const date = useMemo(() => localDate(), [])
  const { status, flash, canShare, copy, share, listenUrl } = useTelegramShare(message, image)

  useEffect(() => {
    let live = true
    image.current = null
    void ensureFonts().then(async () => {
      if (!live || !canvas.current) return
      drawTelegram(canvas.current, message, SITE.url, date)
      // Encoded now rather than on click: see useTelegramShare.
      const blob = await telegramBlob(canvas.current)
      if (live && blob) {
        image.current = new File([blob], 'morseforge-telegram.png', { type: 'image/png' })
      }
    })
    return () => {
      live = false
    }
  }, [message, date, image])

  const save = useCallback(async () => {
    if (!canvas.current) return
    const blob = image.current ?? (await telegramBlob(canvas.current))
    if (!blob) {
      flash('The image could not be made here. Copy text still works.')
      return
    }
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = 'morseforge-telegram.png'
    link.click()
    // Revoked later, not now: some browsers start the download only after
    // the click handler returns, and a revoked URL downloads nothing.
    window.setTimeout(() => URL.revokeObjectURL(href), 1000)
    flash('Saved morseforge-telegram.png')
  }, [flash, image])

  return (
    <section id="kc-share" className="mf-panel mf-slip p-5" aria-labelledby="kc-share-heading">
      <div className="flex items-start justify-between gap-3">
        <h2 id="kc-share-heading" className="font-display text-h3 font-bold text-ink">
          Share this as a telegram
        </h2>
        <button
          type="button"
          className="mf-icon-btn -mt-1 -mr-2 shrink-0"
          aria-label="Dismiss the share panel"
          onClick={onDismiss}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <canvas
        ref={canvas}
        width={1200}
        height={630}
        className="mt-4 block aspect-[1200/630] w-full rounded-chip border border-line"
        role="img"
        aria-label={telegramDescription(message)}
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {canShare && (
          <button
            type="button"
            className="mf-btn mf-btn-primary mf-btn-sm"
            onClick={() => void share()}
          >
            Share
          </button>
        )}
        <button
          type="button"
          className="mf-btn mf-btn-secondary mf-btn-sm"
          onClick={() => void copy()}
        >
          Copy text
        </button>
        <button type="button" className="mf-btn mf-btn-ghost mf-btn-sm" onClick={() => void save()}>
          Save image
        </button>
      </div>

      <p className="mt-3 text-sm text-muted">
        {listenUrl
          ? 'The text carries a link that plays your message in Morse, so whoever gets it can hear it.'
          : 'Too long, or too unusual, for a message link, so this one links to the telegraph instead.'}
      </p>

      <p aria-live="polite" className="mt-1 min-h-5 text-sm text-signal">
        {status}
      </p>
    </section>
  )
}
