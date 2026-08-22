import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from './useSession'
import { SessionResult } from './SessionResult'
import { MethodPicker } from './MethodPicker'
import { MorseKey } from '../MorseKey/MorseKey'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { AudioEngine } from '../../engine/audioEngine'
import { MORSE_ALPHABET, ALL_LETTERS, LEARNING_STAGES } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'
import { SESSION_MODES, type SessionConfig, type SessionMode } from '../../game/session'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'
import { SignalTree } from '../SignalTree/SignalTree'
import { levelToNodeState, type NodeState } from '../../data/tree'
import { masteryLevel } from '../../game/mastery'
import {
  createProgressStore,
  emptyProgress,
  getCharacter,
  setMethod,
  unlockNext,
  unlockedCharacters,
  type ProgressRecord,
} from '../../storage/progress'
import { METHODS, shouldUnlock, type MethodId } from '../../data/methods'

/**
 * How the prompt is answered.
 *
 * `flat` types the letter. `tree` answers by picking the node on the Signal
 * Tree, which means a session doubles as practice at reading the tree — the
 * structure stops being a diagram you looked at once and becomes the thing you
 * navigate under time pressure.
 */
export type PracticeLayout = 'flat' | 'tree'

/**
 * Free practice (PROJECT.md §7, §12).
 *
 * One screen for all three skills, because they are the same loop with a
 * different prompt: listening plays the character, reading shows the dots and
 * dashes, sending asks you to key it.
 */

const POOLS = [
  { id: 'stage1', label: 'E T', characters: LEARNING_STAGES[0]! },
  { id: 'stage2', label: 'First 6', characters: [...LEARNING_STAGES[0]!, ...LEARNING_STAGES[1]!] },
  {
    id: 'stage3',
    label: 'First 14',
    characters: [...LEARNING_STAGES[0]!, ...LEARNING_STAGES[1]!, ...LEARNING_STAGES[2]!],
  },
  { id: 'all', label: 'All 26', characters: ALL_LETTERS as readonly string[] },
] as const

export interface PracticeScreenProps {
  /** Fixed 60-second challenge instead of the configurable practice screen. */
  challenge?: boolean
}

export function PracticeScreen({ challenge = false }: PracticeScreenProps) {
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)

  const [mode, setMode] = useState<SessionMode>('listening')
  const [poolId, setPoolId] = useState<'method' | (typeof POOLS)[number]['id']>('method')
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null)
  const [layout, setLayout] = useState<PracticeLayout>('flat')
  const [guess, setGuess] = useState('')
  /**
   * What just happened, held long enough to be read.
   *
   * A wrong answer used to flash a red border for 260ms and move on, so the
   * learner never found out what the character actually was — which is the one
   * thing they needed. Being told is the entire point of getting it wrong.
   */
  const [feedback, setFeedback] = useState<{
    correct: boolean
    expected: string
    given: string
  } | null>(null)

  const [playingPrompt, setPlayingPrompt] = useState(false)

  const audio = useRef<AudioEngine | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const progressStore = useMemo(() => createProgressStore(), [])
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => {
    setProgress(progressStore.read())
    return progressStore.subscribe(setProgress)
  }, [progressStore])

  useEffect(() => () => void audio.current?.dispose(), [])

  const methodCharacters = useMemo(() => unlockedCharacters(progress), [progress])

  const pool = useMemo(
    () =>
      poolId === 'method'
        ? { id: 'method' as const, label: 'My method', characters: methodCharacters }
        : POOLS.find((entry) => entry.id === poolId)!,
    [poolId, methodCharacters],
  )

  const config = useMemo<SessionConfig>(
    () => ({
      mode: challenge ? 'listening' : mode,
      characters: pool.characters,
      durationMs: challenge ? 60_000 : null,
      target: null,
    }),
    [challenge, mode, pool],
  )

  const session = useSession(config)
  const { current, status, submit } = session

  const play = useCallback(
    async (character: string) => {
      const code = MORSE_ALPHABET[character]
      if (!code || !settings.audio.enabled) return
      audio.current ??= new AudioEngine({
        frequency: settings.audio.frequency,
        volume: settings.audio.volume,
      })
      audio.current.update({
        frequency: settings.audio.frequency,
        volume: settings.audio.volume,
      })
      setPlayingPrompt(true)
      try {
        const playback = await audio.current.play(code, {
          wpm: settings.timing.wpm,
          farnsworthWpm: settings.timing.farnsworthWpm,
        })
        await playback.finished
      } finally {
        setPlayingPrompt(false)
      }
    },
    [settings],
  )

  // Play the prompt as soon as it appears, in listening mode. The AudioContext
  // is already unlocked by then — the user pressed Start.
  useEffect(() => {
    if (status !== 'running' || current === null) return
    if (config.mode !== 'listening') return
    void play(current)
  }, [current, status, config.mode, play])

  const answer = useCallback(
    (given: string) => {
      const expected = current ?? ''
      const correct = submit(given)
      setFeedback({ correct, expected, given: given.trim().toUpperCase() })
      setGuess('')
      // A correct answer only needs an acknowledgement; a wrong one has
      // something to read, so it stays up nearly three times as long.
      setTimeout(() => setFeedback(null), correct ? 500 : 1400)
      input.current?.focus()
    },
    [submit, current],
  )

  /** Mastery-derived node states, so the tree shows progress while you drill. */
  const nodeStates = useMemo<Record<string, NodeState>>(() => {
    const now = Date.now()
    return Object.fromEntries(
      ALL_LETTERS.map((character) => {
        const entry = getCharacter(progress, character, now)
        return [character, levelToNodeState(masteryLevel(entry.skills, entry.seen))]
      }),
    )
  }, [progress])

  const key = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    characterGapMs: settings.timing.characterGapMs,
    wordGapMs: settings.timing.wordGapMs,
    autoCommit: settings.timing.autoCommit,
    bindings: settings.keys,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
    // In tree layout the key is always live: keying a character back is a
    // legitimate way to say you recognised it, not only a sending exercise.
    disabled: status !== 'running' || (layout !== 'tree' && config.mode !== 'sending'),
    onCharacter: (sent) => answer(sent),
  })

  const { reset: resetKey } = key
  useEffect(() => {
    resetKey()
  }, [current, resetKey])

  /**
   * Unlock the next character when a Koch-style session clears the bar.
   *
   * Checked once per finished session rather than per answer: accuracy over a
   * whole session is the measure Koch describes, and unlocking mid-session
   * would introduce a character the learner has never seen into a run they are
   * being scored on.
   */
  const summary = session.summary
  useEffect(() => {
    if (status !== 'finished' || !summary || poolId !== 'method') return

    const method = METHODS[progress.method]
    if (!shouldUnlock(method, summary.accuracy, summary.total)) return
    if (progress.unlocked >= method.order.length - method.startingCount) return

    const next = method.order[method.startingCount + progress.unlocked]
    progressStore.update(unlockNext)
    setUnlockNotice(next ?? null)
  }, [status, summary, poolId, progress.method, progress.unlocked, progressStore])

  if (status === 'finished' && session.summary) {
    return (
      <SessionResult
        summary={session.summary}
        challenge={challenge}
        unlocked={unlockNotice}
        earned={session.earned}
        onAgain={() => {
          setUnlockNotice(null)
          session.reset()
          session.start()
        }}
      />
    )
  }

  if (status === 'idle') {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
        {challenge ? (
          <>
            <h2 className="font-display text-2xl font-bold tracking-tight">
              Sixty seconds. How many can you decode?
            </h2>
            <p className="mt-3 leading-relaxed text-muted">
              You will hear one character at a time. Type what you heard. No account, no signup, and
              it starts the moment you press the button.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-2xl font-bold tracking-tight">Set up your session</h2>
            <div className="mt-6 space-y-6">
              <fieldset>
                <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">MODE</legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(Object.keys(SESSION_MODES) as SessionMode[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={mode === id}
                      onClick={() => setMode(id)}
                      className="rounded-lg border px-4 py-2.5 text-left transition-colors"
                      style={{
                        borderColor: mode === id ? 'var(--color-signal)' : 'var(--color-line)',
                        color: mode === id ? 'var(--color-signal)' : 'var(--color-muted)',
                      }}
                    >
                      <span className="block font-mono text-xs tracking-[0.12em]">
                        {SESSION_MODES[id].label.toUpperCase()}
                      </span>
                      <span className="mt-0.5 block text-[11px] opacity-70">
                        {SESSION_MODES[id].prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <MethodPicker
                method={progress.method}
                unlocked={progress.unlocked}
                onChange={(next: MethodId) => {
                  progressStore.update((current) => setMethod(current, next))
                  setPoolId('method')
                }}
              />

              <fieldset>
                <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">
                  ANSWER BY
                </legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: 'flat' as const, label: 'TYPING', hint: 'Type the letter' },
                    { id: 'tree' as const, label: 'THE TREE', hint: 'Pick it on the tree' },
                  ].map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={layout === entry.id}
                      onClick={() => setLayout(entry.id)}
                      className="rounded-lg border px-4 py-2.5 text-left transition-colors"
                      style={{
                        borderColor:
                          layout === entry.id ? 'var(--color-signal)' : 'var(--color-line)',
                        color: layout === entry.id ? 'var(--color-signal)' : 'var(--color-muted)',
                      }}
                    >
                      <span className="block font-mono text-xs tracking-[0.12em]">
                        {entry.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] opacity-70">{entry.hint}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="font-mono text-[10px] tracking-[0.18em] text-muted">
                  CHARACTERS
                </legend>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { id: 'method' as const, label: `My method (${methodCharacters.length})` },
                    ...POOLS,
                  ].map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      aria-pressed={poolId === entry.id}
                      onClick={() => setPoolId(entry.id)}
                      className="rounded-lg border px-3 py-2 font-mono text-xs tracking-[0.12em] transition-colors"
                      style={{
                        borderColor:
                          poolId === entry.id ? 'var(--color-signal)' : 'var(--color-line)',
                        color: poolId === entry.id ? 'var(--color-signal)' : 'var(--color-muted)',
                      }}
                    >
                      {entry.label.toUpperCase()}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => {
            session.start()
            setTimeout(() => input.current?.focus(), 50)
          }}
          className="mt-8 w-full rounded-lg px-6 py-3.5 font-mono text-sm tracking-[0.16em] text-void"
          style={{ background: 'var(--color-signal)' }}
        >
          {challenge ? '⚡ START THE 60 SECONDS' : 'START'}
        </button>

        {!settings.audio.enabled && (
          <p className="mt-4 text-xs text-amber">
            Sound is off in settings, so listening prompts will be silent.
          </p>
        )}
      </div>
    )
  }

  const seconds = session.remaining === null ? null : Math.ceil(session.remaining / 1000)
  const code = current ? MORSE_ALPHABET[current] : null

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
          {session.attempts.filter((a) => a.correct).length} / {session.attempts.length}
        </span>
        {seconds !== null && (
          <span
            role="timer"
            // Announced every ten seconds rather than every tick: a per-second
            // live region would talk over the character being played, which is
            // the thing the user is trying to hear.
            aria-live={seconds % 10 === 0 ? 'polite' : 'off'}
            aria-label={`${seconds} seconds left${seconds <= 10 ? ', hurry' : ''}`}
            className="font-mono text-2xl tabular-nums"
            style={{ color: seconds <= 10 ? 'var(--color-danger)' : 'var(--color-signal)' }}
          >
            {seconds}s{/* The under-ten warning was a colour change and nothing else. */}
            {seconds <= 10 && (
              <span aria-hidden="true" className="ml-1 text-sm">
                !
              </span>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={session.stop}
          className="font-mono text-[10px] tracking-[0.14em] text-muted hover:text-danger"
        >
          END
        </button>
      </div>

      <div
        aria-live="polite"
        className="mt-8 flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border px-4 text-center transition-colors"
        style={{
          borderColor: feedback
            ? feedback.correct
              ? 'var(--color-signal)'
              : 'var(--color-danger)'
            : 'var(--color-line)',
        }}
      >
        {feedback ? (
          feedback.correct ? (
            <>
              <span className="font-display text-4xl font-bold text-signal">
                {feedback.expected}
              </span>
              <span className="font-mono text-xs tracking-[0.16em] text-signal-dim">CORRECT</span>
            </>
          ) : (
            <>
              <span className="font-mono text-xs tracking-[0.16em] text-danger">
                {feedback.given ? `YOU SAID ${feedback.given}` : 'MISSED'}
              </span>
              <span className="font-display text-4xl font-bold text-ink">{feedback.expected}</span>
              <span className="font-mono text-lg tracking-[0.2em] text-cyan">
                {prettify(MORSE_ALPHABET[feedback.expected] ?? '')}
              </span>
            </>
          )
        ) : (
          <>
            {config.mode === 'listening' && current && (
              <button
                type="button"
                onClick={() => void play(current)}
                className="rounded-lg border px-6 py-3 font-mono text-xs tracking-[0.14em] transition-colors"
                style={{
                  borderColor: playingPrompt
                    ? 'var(--color-cyan)'
                    : 'color-mix(in srgb, var(--color-cyan) 40%, transparent)',
                  color: playingPrompt ? 'var(--color-void)' : 'var(--color-cyan)',
                  background: playingPrompt ? 'var(--color-cyan)' : 'transparent',
                }}
              >
                {playingPrompt ? '♪ PLAYING' : '▶ PLAY AGAIN'}
              </button>
            )}

            {config.mode === 'recognition' && code && (
              <span className="font-mono text-4xl tracking-[0.2em] text-cyan">
                {prettify(code)}
              </span>
            )}

            {config.mode === 'sending' && current && (
              <span className="font-display text-5xl font-bold text-signal">{current}</span>
            )}
          </>
        )}
      </div>

      {layout === 'tree' && !challenge ? (
        <div className="mt-6">
          <SignalTree
            states={nodeStates}
            // Highlighted only during feedback. Lighting the target while the
            // prompt is still up would answer the question for them.
            highlight={feedback ? feedback.expected : null}
            // The path being keyed right now, so the learner watches themselves
            // walk the tree rather than being told about it afterwards.
            livePath={key.state.pending}
            onSelect={answer}
            className="min-w-0"
          />

          <p className="mt-3 text-center text-xs leading-relaxed text-muted">
            Answer however you like — tap a node, or key it and watch the path light up as you go.
          </p>

          <div className="mt-6">
            <MorseKey
              isDown={key.state.isDown}
              pending={key.state.pending}
              preview={key.state.preview}
              commitProgress={key.state.commitProgress}
              autoCommit={settings.timing.autoCommit}
              keyLabel={settings.keys.key === ' ' ? 'SPACE' : settings.keys.key.toUpperCase()}
              commitLabel={(settings.keys.submit ?? 'Control').toUpperCase()}
              pointerHandlers={key.pointerHandlers}
            />
            <button
              type="button"
              onClick={key.commitCharacter}
              disabled={key.state.pending === ''}
              className="mx-auto mt-5 block w-full max-w-md rounded-lg border px-4 py-2.5 font-mono text-xs tracking-[0.14em] disabled:opacity-30"
              style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
            >
              FINISH CHARACTER
            </button>
          </div>
        </div>
      ) : config.mode === 'sending' ? (
        <div className="mt-8">
          <MorseKey
            isDown={key.state.isDown}
            pending={key.state.pending}
            preview={key.state.preview}
            commitProgress={key.state.commitProgress}
            autoCommit={settings.timing.autoCommit}
            keyLabel={settings.keys.key === ' ' ? 'SPACE' : settings.keys.key.toUpperCase()}
            commitLabel={(settings.keys.submit ?? 'Control').toUpperCase()}
            pointerHandlers={key.pointerHandlers}
          />
          <button
            type="button"
            onClick={key.commitCharacter}
            disabled={key.state.pending === ''}
            className="mx-auto mt-5 block w-full max-w-md rounded-lg border px-4 py-2.5 font-mono text-xs tracking-[0.14em] disabled:opacity-30"
            style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
          >
            FINISH CHARACTER
          </button>
        </div>
      ) : (
        <form
          className="mt-8"
          onSubmit={(event) => {
            event.preventDefault()
            if (guess.trim()) answer(guess)
          }}
        >
          <label htmlFor="practice-answer" className="sr-only">
            What character was that?
          </label>
          <input
            id="practice-answer"
            ref={input}
            value={guess}
            // Only the last character typed: a learner who types "AB" meant B,
            // and making them clear the field first breaks the rhythm entirely.
            onChange={(event) => setGuess(event.target.value.slice(-1))}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={1}
            placeholder="?"
            className="w-full rounded-lg border border-line bg-elevated px-4 py-4 text-center font-display text-3xl uppercase outline-none focus:border-signal"
          />
          <button
            type="submit"
            disabled={guess.trim() === ''}
            className="mt-4 w-full rounded-lg px-6 py-3 font-mono text-xs tracking-[0.14em] text-void disabled:opacity-40"
            style={{ background: 'var(--color-signal)' }}
          >
            ENTER
          </button>
        </form>
      )}
    </div>
  )
}
