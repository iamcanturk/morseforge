import { type SubmitEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MorseKey } from '../MorseKey/MorseKey'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { AudioEngine } from '../../engine/audioEngine'
import { prettify } from '../../engine/morseEncoder'
import type { Skill } from '../../game/mastery'
import type { SettingsRecord } from '../../storage/settings'

/**
 * Practise one character, right where the learner selected it on the tree.
 *
 * Two of the three tracked skills are exercised here — `listening` (hear it,
 * name it) and `sending` (be told it, key it) — because those are the two the
 * tree screen can support without leaving it. `recognition` belongs to the
 * reading drills. §48: mastery needs all three, so this deliberately cannot
 * master a character on its own.
 */

export type DrillMode = 'send' | 'listen'

interface CharacterDrillProps {
  character: string
  settings: SettingsRecord
  /** Reports an attempt so the caller can persist it. */
  onAttempt: (character: string, skill: Skill, correct: boolean) => void
}

type Verdict = { correct: boolean; sent: string } | null

export function CharacterDrill({ character, settings, onAttempt }: CharacterDrillProps) {
  const [mode, setMode] = useState<DrillMode>('send')
  const [verdict, setVerdict] = useState<Verdict>(null)
  const [guess, setGuess] = useState('')
  const audio = useRef<AudioEngine | null>(null)

  const target = MORSE_ALPHABET[character] ?? ''

  // Selecting a different character starts a clean attempt rather than
  // carrying the previous verdict over, which would read as an instant result.
  useEffect(() => {
    setVerdict(null)
    setGuess('')
  }, [character])

  useEffect(() => () => void audio.current?.dispose(), [])

  const playTarget = useCallback(async () => {
    if (!target || !settings.audio.enabled) return
    audio.current ??= new AudioEngine({
      frequency: settings.audio.frequency,
      volume: settings.audio.volume,
    })
    const playback = await audio.current.play(target, {
      wpm: settings.timing.wpm,
      farnsworthWpm: settings.timing.farnsworthWpm,
    })
    await playback.finished
  }, [target, settings])

  const handleCharacter = useCallback(
    (sent: string) => {
      const correct = sent === character
      setVerdict({ correct, sent })
      onAttempt(character, 'sending', correct)
    },
    [character, onAttempt],
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
    disabled: mode !== 'send',
    onCharacter: handleCharacter,
  })

  const { reset } = key
  useEffect(() => {
    reset()
  }, [character, mode, reset])

  const submitGuess = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault()
      const cleaned = guess.trim().toUpperCase()
      if (!cleaned) return
      const correct = cleaned === character
      setVerdict({ correct, sent: cleaned })
      onAttempt(character, 'listening', correct)
    },
    [guess, character, onAttempt],
  )

  const tryAgain = useCallback(() => {
    setVerdict(null)
    setGuess('')
    reset()
  }, [reset])

  const keyLabel = settings.keys.key === ' ' ? 'SPACE' : settings.keys.key.toUpperCase()
  const modes = useMemo(
    () =>
      [
        { id: 'send' as const, label: 'SEND IT', hint: 'Key the character yourself' },
        { id: 'listen' as const, label: 'HEAR IT', hint: 'Listen, then type what you heard' },
      ] satisfies { id: DrillMode; label: string; hint: string }[],
    [],
  )

  return (
    <section className="mt-6 border-t border-line pt-6">
      <div className="flex gap-2">
        {modes.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={mode === entry.id}
            onClick={() => {
              setMode(entry.id)
              setVerdict(null)
              setGuess('')
            }}
            className="flex-1 rounded-lg border px-3 py-2 font-mono text-[11px] tracking-[0.12em] transition-colors"
            style={{
              borderColor: mode === entry.id ? 'var(--color-signal)' : 'var(--color-line)',
              color: mode === entry.id ? 'var(--color-signal)' : 'var(--color-muted)',
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {verdict ? (
        <div className="mt-6 text-center">
          <p
            className="font-display text-2xl font-bold"
            style={{ color: verdict.correct ? 'var(--color-signal)' : 'var(--color-danger)' }}
          >
            {verdict.correct ? 'SIGNAL LOCKED' : 'NOT QUITE'}
          </p>
          {!verdict.correct && (
            <p className="mt-2 text-sm text-muted">
              You sent <span className="text-ink">{verdict.sent}</span> — {character} is{' '}
              <span className="font-mono text-cyan">{prettify(target)}</span>
            </p>
          )}
          <button
            type="button"
            onClick={tryAgain}
            className="mt-5 w-full rounded-lg border border-line px-4 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-signal hover:text-signal"
          >
            TRY AGAIN
          </button>
        </div>
      ) : mode === 'send' ? (
        <div className="mt-6">
          <p className="text-center text-sm text-muted">
            Send <span className="font-display text-xl font-bold text-signal">{character}</span>
          </p>
          <div className="mt-4 scale-90">
            <MorseKey
              isDown={key.state.isDown}
              pending={key.state.pending}
              preview={key.state.preview}
              commitProgress={key.state.commitProgress}
              autoCommit={settings.timing.autoCommit}
              keyLabel={keyLabel}
              commitLabel={(settings.keys.submit ?? 'Control').toUpperCase()}
              pointerHandlers={key.pointerHandlers}
            />
          </div>
          <button
            type="button"
            onClick={key.commitCharacter}
            disabled={key.state.pending === ''}
            className="mt-4 w-full rounded-lg border px-4 py-2.5 font-mono text-xs tracking-[0.14em] transition-colors disabled:opacity-30"
            style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
          >
            FINISH CHARACTER
          </button>
        </div>
      ) : (
        <form onSubmit={submitGuess} className="mt-6">
          <button
            type="button"
            onClick={() => void playTarget()}
            className="w-full rounded-lg border border-cyan/40 px-4 py-3 font-mono text-xs tracking-[0.16em] text-cyan"
          >
            ▶ PLAY SIGNAL
          </button>

          <label className="mt-5 block">
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted">
              WHAT DID YOU HEAR?
            </span>
            <input
              value={guess}
              onChange={(event) => setGuess(event.target.value.slice(-1))}
              // Auto-correct and predictive text would rewrite a single letter
              // into a word on mobile, which silently fails the attempt.
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={1}
              className="mt-2 w-full rounded-lg border border-line bg-elevated px-4 py-3 text-center font-display text-2xl uppercase outline-none focus:border-signal"
              placeholder="?"
            />
          </label>

          <button
            type="submit"
            disabled={guess.trim() === ''}
            className="mt-4 w-full rounded-lg border px-4 py-2.5 font-mono text-xs tracking-[0.14em] transition-colors disabled:opacity-30"
            style={{ borderColor: 'var(--color-signal)', color: 'var(--color-signal)' }}
          >
            CHECK
          </button>
        </form>
      )}
    </section>
  )
}
