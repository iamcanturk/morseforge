import { type SubmitEvent, useCallback, useEffect, useRef, useState } from 'react'
import { MorseKey } from '../MorseKey/MorseKey'
import { useMorseKey } from '../MorseKey/useMorseKey'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { prettify } from '../../engine/morseEncoder'
import type { Skill } from '../../game/mastery'
import type { SettingsRecord } from '../../storage/settings'
import { Screen } from '../ui/Screen'
import { Segmented } from '../ui/Segmented'

/**
 * Practise one character, right where the learner picked it on the tree.
 *
 * Two of the three tracked skills are exercised here — `listening` (hear it,
 * name it) and `sending` (be told it, key it) — because those are the two the
 * tree screen can support without leaving it. `recognition` belongs to the
 * reading drills. §48: mastery needs all three, so this deliberately cannot
 * master a character on its own.
 */

export type DrillMode = 'send' | 'listen'

export interface DrillAttempt {
  character: string
  skill: Skill
  correct: boolean
  /** Elements keyed for this answer; zero for a typed one. */
  elements: number
}

interface CharacterDrillProps {
  character: string
  settings: SettingsRecord
  /**
   * Play the character, with the screen's own transmitter: the learner's tone
   * and speed, and only the lamp when sound is off. Passed in so the drill and
   * the pad's own playback share one lamp and can never talk over each other.
   */
  onPlay: () => void | Promise<void>
  /** True while that transmitter is busy. */
  playing?: boolean
  /** Reports an attempt so the caller can persist and bank it. */
  onAttempt: (attempt: DrillAttempt) => void
}

type Verdict = { correct: boolean; sent: string } | null

const MODES = [
  { value: 'send' as const, label: 'Send it' },
  { value: 'listen' as const, label: 'Hear it' },
]

export function CharacterDrill({
  character,
  settings,
  onPlay,
  playing = false,
  onAttempt,
}: CharacterDrillProps) {
  const [mode, setMode] = useState<DrillMode>('send')
  const [verdict, setVerdict] = useState<Verdict>(null)
  const [guess, setGuess] = useState('')
  /** Elements keyed since the last committed character. */
  const keyed = useRef(0)

  const target = MORSE_ALPHABET[character] ?? ''

  // Selecting a different character starts a clean attempt rather than
  // carrying the previous verdict over, which would read as an instant result.
  useEffect(() => {
    setVerdict(null)
    setGuess('')
    keyed.current = 0
  }, [character])

  const handleCharacter = useCallback(
    (sent: string) => {
      const correct = sent === character
      setVerdict({ correct, sent })
      onAttempt({ character, skill: 'sending', correct, elements: keyed.current })
      keyed.current = 0
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
    // Paused while a verdict is up, so a stray Space does not start the next
    // attempt behind the result.
    disabled: mode !== 'send' || verdict !== null,
    onElement: () => {
      keyed.current += 1
    },
    onCharacter: handleCharacter,
  })

  const { reset } = key
  useEffect(() => {
    reset()
    keyed.current = 0
  }, [character, mode, reset])

  const submitGuess = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault()
      const cleaned = guess.trim().toUpperCase()
      if (!cleaned) return
      const correct = cleaned === character
      setVerdict({ correct, sent: cleaned })
      onAttempt({ character, skill: 'listening', correct, elements: 0 })
    },
    [guess, character, onAttempt],
  )

  const tryAgain = useCallback(() => {
    setVerdict(null)
    setGuess('')
    keyed.current = 0
    reset()
  }, [reset])

  const keyLabel = settings.keys.key === ' ' ? 'SPACE' : settings.keys.key.toUpperCase()

  return (
    <section className="mt-6 border-t border-line pt-6" aria-labelledby="drill-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="drill-title" className="mf-engraved">
          Drill {character}
        </h3>
        <Segmented
          label={`Drill ${character}`}
          value={mode}
          options={MODES}
          size="sm"
          onChange={(next) => {
            setMode(next)
            setVerdict(null)
            setGuess('')
          }}
        />
      </div>

      {verdict ? (
        <div
          aria-live="polite"
          className={['mt-5 text-center', verdict.correct ? '' : 'mf-shake'].join(' ')}
          data-state={verdict.correct ? 'correct' : 'wrong'}
        >
          {verdict.correct ? (
            <span className="mf-stamp mf-stamp-in text-signal">Signal locked</span>
          ) : (
            <>
              <p className="font-display text-h3 font-bold text-amber">
                <span aria-hidden="true">✕ </span>Not quite
              </p>
              <p className="mt-2 text-sm text-muted">
                You {mode === 'send' ? 'sent' : 'typed'}{' '}
                <span className="font-mono text-ink">{verdict.sent}</span>. {character} is{' '}
                <span className="font-mono tracking-code text-cyan">{prettify(target)}</span>.
              </p>
            </>
          )}
          <button type="button" onClick={tryAgain} className="mf-btn mf-btn-secondary mt-5 w-full">
            {verdict.correct ? 'Again' : 'Try again'}
          </button>
        </div>
      ) : mode === 'send' ? (
        <div className="mt-5">
          <p className="text-center text-sm text-muted">
            Key <span className="font-display text-h3 font-bold text-ink">{character}</span> on the
            key below
          </p>
          <div className="mt-4">
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
            className="mf-btn mf-btn-secondary mf-btn-block mt-4"
          >
            Finish character
          </button>
        </div>
      ) : (
        <form onSubmit={submitGuess} className="mt-5">
          <button
            type="button"
            onClick={() => void onPlay()}
            disabled={playing}
            className="mf-btn mf-btn-secondary mf-btn-block"
          >
            <span aria-hidden="true">▶</span>
            {playing ? 'Sending…' : settings.audio.enabled ? 'Play the signal' : 'Flash the signal'}
          </button>

          <Screen className="mt-4 p-4">
            <label className="relative z-[3] block">
              <span className="mf-engraved">
                What did you {settings.audio.enabled ? 'hear' : 'see'}?
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
                className="mf-input-answer mt-2"
                placeholder="?"
              />
            </label>
          </Screen>

          <button
            type="submit"
            disabled={guess.trim() === ''}
            className="mf-btn mf-btn-primary mf-btn-block mt-4"
          >
            Check
          </button>
        </form>
      )}
    </section>
  )
}
