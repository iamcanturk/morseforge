import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from './useSession'
import { SessionResult } from './SessionResult'
import { MorseKey } from '../MorseKey/MorseKey'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { AudioEngine } from '../../engine/audioEngine'
import { MORSE_ALPHABET, ALL_LETTERS, LEARNING_STAGES } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'
import { SESSION_MODES, type SessionConfig, type SessionMode } from '../../game/session'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'

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
  const [poolId, setPoolId] = useState<(typeof POOLS)[number]['id']>('stage2')
  const [guess, setGuess] = useState('')
  const [flash, setFlash] = useState<'right' | 'wrong' | null>(null)

  const audio = useRef<AudioEngine | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSettings(settingsStore.read())
    return settingsStore.subscribe(setSettings)
  }, [settingsStore])

  useEffect(() => () => void audio.current?.dispose(), [])

  const pool = POOLS.find((entry) => entry.id === poolId)!

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
      const playback = await audio.current.play(code, {
        wpm: settings.timing.wpm,
        farnsworthWpm: settings.timing.farnsworthWpm,
      })
      await playback.finished
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
      const correct = submit(given)
      setFlash(correct ? 'right' : 'wrong')
      setGuess('')
      setTimeout(() => setFlash(null), 260)
      input.current?.focus()
    },
    [submit],
  )

  const key = useMorseKey({
    wpm: settings.timing.wpm,
    dotDashThresholdMs: settings.timing.dotDashThresholdMs,
    characterGapMs: settings.timing.characterGapMs,
    wordGapMs: settings.timing.wordGapMs,
    autoCommit: settings.timing.autoCommit,
    bindings: settings.keys,
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
    disabled: status !== 'running' || config.mode !== 'sending',
    onCharacter: (sent) => answer(sent),
  })

  const { reset: resetKey } = key
  useEffect(() => {
    resetKey()
  }, [current, resetKey])

  if (status === 'finished' && session.summary) {
    return (
      <SessionResult
        summary={session.summary}
        challenge={challenge}
        onAgain={() => {
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
            className="font-mono text-2xl tabular-nums"
            style={{ color: seconds <= 10 ? 'var(--color-danger)' : 'var(--color-signal)' }}
          >
            {seconds}s
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
        className="mt-8 flex min-h-32 flex-col items-center justify-center rounded-xl border transition-colors"
        style={{
          borderColor:
            flash === 'right'
              ? 'var(--color-signal)'
              : flash === 'wrong'
                ? 'var(--color-danger)'
                : 'var(--color-line)',
        }}
      >
        {config.mode === 'listening' && current && (
          <button
            type="button"
            onClick={() => void play(current)}
            className="rounded-lg border border-cyan/40 px-6 py-3 font-mono text-xs tracking-[0.14em] text-cyan"
          >
            ▶ PLAY AGAIN
          </button>
        )}

        {config.mode === 'recognition' && code && (
          <span className="font-mono text-4xl tracking-[0.2em] text-cyan">{prettify(code)}</span>
        )}

        {config.mode === 'sending' && current && (
          <span className="font-display text-5xl font-bold text-signal">{current}</span>
        )}
      </div>

      {config.mode === 'sending' ? (
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
