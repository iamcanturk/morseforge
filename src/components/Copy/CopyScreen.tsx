import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCopySession } from './useCopySession'
import { SessionResult } from '../Practice/SessionResult'
import { AudioEngine } from '../../engine/audioEngine'
import { encode } from '../../engine/morseEncoder'
import { estimateDuration } from '../../engine/timingEngine'
import { TEXT_KINDS, TEXT_SOURCES, isAvailable, type TextKind } from '../../data/practiceText'
import { ALL_DIGITS, ALL_LETTERS } from '../../data/morseAlphabet'
import type { CopyGrade, CopySlot } from '../../game/copy'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import {
  createProgressStore,
  emptyProgress,
  unlockedCharacters,
  type ProgressRecord,
} from '../../storage/progress'

/**
 * Copy practice (PROJECT.md §13).
 *
 * The exercise between knowing the alphabet and reading a QSO: a whole line
 * arrives at once, you write down what you got, and you find out how much of it
 * was right. Nothing else on the site trains holding characters in your head
 * while the next ones are still arriving, which is the actual bottleneck.
 *
 * The answer key is the feature. A percentage tells you that you missed two;
 * seeing *which* two, in position, is what changes what you practise next.
 */

const LINE_COUNTS = [5, 10, 20] as const

const POOLS = [
  { id: 'method', label: 'My method' },
  { id: 'letters', label: 'A–Z' },
  { id: 'mixed', label: 'A–Z + 0–9' },
] as const

type PoolId = (typeof POOLS)[number]['id']

export function CopyScreen() {
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])

  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)

  const [kind, setKind] = useState<TextKind>('groups')
  const [poolId, setPoolId] = useState<PoolId>('letters')
  const [lines, setLines] = useState<number>(10)
  const [typed, setTyped] = useState('')
  const [sending, setSending] = useState(false)
  const [plays, setPlays] = useState(0)

  const audio = useRef<AudioEngine | null>(null)
  const stopPlayback = useRef<(() => void) | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const advance = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => {
    setProgress(progressStore.read())
    return progressStore.subscribe(setProgress)
  }, [progressStore])

  useEffect(() => () => void audio.current?.dispose(), [])

  const characters = useMemo(() => {
    if (poolId === 'method') return unlockedCharacters(progress)
    if (poolId === 'mixed') return [...ALL_LETTERS, ...ALL_DIGITS]
    return [...ALL_LETTERS]
  }, [poolId, progress])

  const session = useCopySession({ kind, characters, lines })
  const { status, current, submit, next } = session

  const play = useCallback(
    async (text: string) => {
      if (!settings.audio.enabled) return

      audio.current ??= new AudioEngine({
        frequency: settings.audio.frequency,
        volume: settings.audio.volume,
      })
      audio.current.update({
        frequency: settings.audio.frequency,
        volume: settings.audio.volume,
      })

      // A second press restarts rather than overlapping — two copies of the
      // same line playing a beat apart is unreadable.
      stopPlayback.current?.()
      setSending(true)
      setPlays((count) => count + 1)
      try {
        const playback = await audio.current.play(encode(text), {
          wpm: settings.timing.wpm,
          farnsworthWpm: settings.timing.farnsworthWpm,
        })
        stopPlayback.current = playback.stop
        await playback.finished
      } finally {
        stopPlayback.current = null
        setSending(false)
      }
    },
    [settings],
  )

  // Send each new line as it appears. The AudioContext is already unlocked by
  // then, because the session only starts from a press.
  useEffect(() => {
    if (status !== 'running' || current === null) return
    setPlays(0)
    setTyped('')
    void play(current)
    input.current?.focus()
    // `play` is intentionally left out: it changes identity whenever settings
    // do, and re-sending the line because the volume moved would be maddening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, status])

  // Move focus onto the continue button while the answer key is up, so the
  // whole session stays playable from the keyboard.
  useEffect(() => {
    if (status === 'reviewing') advance.current?.focus()
  }, [status])

  const estimate = useMemo(
    () =>
      current === null
        ? 0
        : Math.round(
            estimateDuration(current, {
              wpm: settings.timing.wpm,
              farnsworthWpm: settings.timing.farnsworthWpm,
            }) / 1000,
          ),
    [current, settings.timing],
  )

  if (status === 'finished' && session.summary) {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold tracking-tight">
            {session.perfectLines} of {session.results.length} lines copied clean
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Character accuracy is below. A line counts as clean only if every character in it was
            right and you added none that were not sent.
          </p>

          <ul className="mt-5 space-y-2">
            {session.results.map((result, index) => (
              <li
                key={`${result.text}-${index}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line px-3 py-2"
              >
                <span className="font-mono text-[10px] tracking-[0.14em] text-muted">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <AnswerKey grade={result.grade} compact />
                <span
                  className="ml-auto font-mono text-[11px] tabular-nums"
                  style={{
                    color: result.grade.perfect ? 'var(--color-signal)' : 'var(--color-muted)',
                  }}
                >
                  {Math.round(result.grade.accuracy * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>

        <SessionResult
          summary={session.summary}
          challenge={false}
          onAgain={() => {
            session.reset()
            session.start()
          }}
        />
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        <h2 className="font-display text-2xl font-bold tracking-tight">What should I send?</h2>

        <div className="mt-6 space-y-6">
          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">TEXT</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {TEXT_KINDS.map((id) => {
                const source = TEXT_SOURCES[id]
                const selected = kind === id
                const available = isAvailable(id, characters)
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    disabled={!available}
                    onClick={() => setKind(id)}
                    className="rounded-lg border p-3 text-left transition-colors disabled:opacity-40"
                    style={{
                      borderColor: selected ? 'var(--color-signal)' : 'var(--color-line)',
                      color: selected ? 'var(--color-signal)' : 'var(--color-muted)',
                    }}
                  >
                    <span className="block font-mono text-xs tracking-[0.12em]">
                      {source.name.toUpperCase()}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug opacity-80">
                      {available ? source.summary : 'Needs more characters'}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {TEXT_SOURCES[kind].rationale}
            </p>
          </fieldset>

          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">
              CHARACTERS
            </legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {POOLS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={poolId === entry.id}
                  onClick={() => setPoolId(entry.id)}
                  className="rounded-lg border px-3 py-2 font-mono text-xs tracking-[0.12em] transition-colors"
                  style={{
                    borderColor: poolId === entry.id ? 'var(--color-signal)' : 'var(--color-line)',
                    color: poolId === entry.id ? 'var(--color-signal)' : 'var(--color-muted)',
                  }}
                >
                  {entry.label.toUpperCase()}
                  {entry.id === 'method' && ` (${unlockedCharacters(progress).length})`}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">LINES</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {LINE_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={lines === count}
                  onClick={() => setLines(count)}
                  className="rounded-lg border px-4 py-2 font-mono text-xs tracking-[0.12em] transition-colors"
                  style={{
                    borderColor: lines === count ? 'var(--color-signal)' : 'var(--color-line)',
                    color: lines === count ? 'var(--color-signal)' : 'var(--color-muted)',
                  }}
                >
                  {count}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <button
          type="button"
          onClick={session.start}
          className="mt-8 w-full rounded-lg px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          START COPYING
        </button>

        <p className="mt-4 text-xs leading-relaxed text-muted">
          Sending at {settings.timing.wpm} WPM
          {settings.timing.farnsworthWpm < settings.timing.wpm &&
            `, spaced out to ${settings.timing.farnsworthWpm}`}
          . Change it in{' '}
          <a href="/settings/" className="text-signal underline underline-offset-4">
            settings
          </a>
          .
        </p>

        {!settings.audio.enabled && (
          <p className="mt-3 text-xs text-amber">
            Sound is off in settings, so nothing will be sent.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          LINE {session.lineNumber} / {lines}
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          {session.perfectLines} CLEAN
        </span>
        <button
          type="button"
          onClick={session.stop}
          className="font-mono text-[10px] tracking-[0.14em] text-muted hover:text-danger"
        >
          END
        </button>
      </div>

      {status === 'reviewing' && session.lastGrade ? (
        <div className="mt-8">
          <div
            className="rounded-xl border p-5"
            style={{
              borderColor: session.lastGrade.perfect
                ? 'var(--color-signal)'
                : 'var(--color-danger)',
            }}
          >
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted">SENT</p>
            <div className="mt-3">
              <AnswerKey grade={session.lastGrade} />
            </div>

            <p
              className="mt-4 font-mono text-xs tracking-[0.14em]"
              style={{
                color: session.lastGrade.perfect ? 'var(--color-signal)' : 'var(--color-danger)',
              }}
            >
              {session.lastGrade.perfect
                ? 'CLEAN COPY'
                : `${session.lastGrade.hits} / ${session.lastGrade.total} CHARACTERS`}
            </p>

            {!session.lastGrade.perfect && session.lastGrade.missed.length > 0 && (
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Lost: {[...new Set(session.lastGrade.missed)].join(', ')}
              </p>
            )}
          </div>

          <button
            ref={advance}
            type="button"
            onClick={next}
            className="mt-6 w-full rounded-lg px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-void"
            style={{ background: 'var(--color-signal)' }}
          >
            {session.results.length >= lines ? 'SEE THE RESULT' : 'NEXT LINE'}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => current && void play(current)}
              className="rounded-lg border px-6 py-3 font-mono text-xs tracking-[0.14em] transition-colors"
              style={{
                borderColor: sending
                  ? 'var(--color-cyan)'
                  : 'color-mix(in srgb, var(--color-cyan) 40%, transparent)',
                color: sending ? 'var(--color-void)' : 'var(--color-cyan)',
                background: sending ? 'var(--color-cyan)' : 'transparent',
              }}
            >
              {sending ? '♪ SENDING' : '▶ SEND IT AGAIN'}
            </button>

            <p className="font-mono text-[10px] tracking-[0.14em] text-muted">
              {plays <= 1 ? `ABOUT ${estimate}s` : `HEARD IT ${plays}×`}
            </p>
          </div>

          <form
            className="mt-8"
            onSubmit={(event) => {
              event.preventDefault()
              submit(typed)
            }}
          >
            <label htmlFor="copy-answer" className="sr-only">
              Type what you copied
            </label>
            <input
              id="copy-answer"
              ref={input}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="what did you get?"
              className="w-full rounded-lg border border-line bg-elevated px-4 py-4 text-center font-mono text-2xl tracking-[0.18em] uppercase outline-none placeholder:text-sm placeholder:tracking-normal placeholder:normal-case focus:border-signal"
            />
            <button
              type="submit"
              className="mt-4 w-full rounded-lg px-6 py-3 font-mono text-xs tracking-[0.14em] text-void"
              style={{ background: 'var(--color-signal)' }}
            >
              CHECK IT
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              Submit an empty answer if you got nothing — it counts, and nothing is lost by being
              honest about it.
            </p>
          </form>
        </>
      )}
    </div>
  )
}

/**
 * The line as it was sent, marked up with what happened to each character.
 *
 * Colour alone would not carry this, so a wrong character also shows what was
 * typed instead and a missed one shows a dash — the mark is legible without
 * seeing the colour at all.
 */
function AnswerKey({ grade, compact = false }: { grade: CopyGrade; compact?: boolean }) {
  return (
    <p className={`flex flex-wrap ${compact ? 'gap-x-1.5' : 'gap-x-2.5'} font-mono`}>
      {grade.slots.map((slot, index) => (
        <Slot key={index} slot={slot} compact={compact} />
      ))}
    </p>
  )
}

function Slot({ slot, compact }: { slot: CopySlot; compact: boolean }) {
  const colour =
    slot.mark === 'hit'
      ? 'var(--color-signal)'
      : slot.mark === 'extra'
        ? 'var(--color-muted)'
        : 'var(--color-danger)'

  const label =
    slot.mark === 'hit'
      ? `${slot.expected}, copied`
      : slot.mark === 'miss'
        ? `${slot.expected}, missed`
        : slot.mark === 'wrong'
          ? `${slot.expected}, copied as ${slot.given}`
          : `${slot.given}, not sent`

  return (
    <span className="inline-flex flex-col items-center leading-none" title={label}>
      <span className="sr-only">{label}. </span>
      <span
        aria-hidden="true"
        className={compact ? 'text-sm' : 'text-2xl'}
        style={{ color: colour, opacity: slot.mark === 'extra' ? 0.5 : 1 }}
      >
        {slot.expected ?? '·'}
      </span>
      {slot.mark !== 'hit' && (
        <span
          aria-hidden="true"
          className={`mt-1 ${compact ? 'text-[9px]' : 'text-[11px]'}`}
          style={{ color: colour }}
        >
          {slot.given ?? '–'}
        </span>
      )}
    </span>
  )
}
