import { type SubmitEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine } from '../../engine/audioEngine'
import { encode, prettify } from '../../engine/morseEncoder'

/**
 * "Can you decode this?" (PROJECT.md §39.3, §57).
 *
 * The first thing on the landing page, and the whole of §57's argument: show a
 * signal, do not explain one. Someone who decodes SOS in eight seconds has
 * already had the experience the product is selling; someone who read four
 * paragraphs about what Morse is has not.
 *
 * The ladder starts at SOS because almost everyone half-knows it — the first
 * round has to be winnable, or the hook lands as a wall.
 */

interface Round {
  answer: string
  /** Shown after a correct answer, so a win teaches something. */
  note: string
}

/**
 * Ordered by how many characters there are to look up, which is what actually
 * makes a round harder for someone decoding from scratch. Element count is the
 * wrong measure: CQ is only two characters but both are four elements long and
 * neither is familiar, so it is not the gentle second round it looks like.
 */
const ROUNDS: readonly Round[] = [
  { answer: 'SOS', note: 'The distress signal. Three dots, three dashes, three dots.' },
  {
    answer: 'HELP',
    note: 'Not actually a distress signal — no maritime or aviation convention recognises it. Send SOS.',
  },
  {
    answer: 'MORSE',
    note: 'Named after Samuel Morse, though the code used worldwide today is not the one he devised.',
  },
  {
    answer: 'SIGNAL',
    note: 'Six characters, and you decoded them. That is roughly a quarter of the alphabet already.',
  },
]

type Status = 'idle' | 'wrong' | 'correct'

export function DecodeChallenge() {
  const [round, setRound] = useState(0)
  const [guess, setGuess] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [elapsed, setElapsed] = useState<number | null>(null)

  const startedAt = useRef<number | null>(null)
  const audio = useRef<AudioEngine | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const current = ROUNDS[round % ROUNDS.length]!
  const morse = useMemo(() => encode(current.answer), [current.answer])

  useEffect(() => () => void audio.current?.dispose(), [])

  // The clock starts when the user first engages, not on mount: a visitor who
  // scrolled past and came back two minutes later has not taken two minutes.
  const startClock = useCallback(() => {
    startedAt.current ??= performance.now()
  }, [])

  const play = useCallback(async () => {
    startClock()
    audio.current ??= new AudioEngine()
    const playback = await audio.current.play(morse, { wpm: 12, farnsworthWpm: 8 })
    await playback.finished
  }, [morse, startClock])

  const check = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault()
      const cleaned = guess.trim().toUpperCase()
      if (!cleaned) return

      if (cleaned === current.answer) {
        setElapsed(startedAt.current === null ? null : performance.now() - startedAt.current)
        setStatus('correct')
        return
      }
      setStatus('wrong')
    },
    [guess, current.answer],
  )

  const next = useCallback(() => {
    setRound((n) => n + 1)
    setGuess('')
    setStatus('idle')
    setElapsed(null)
    startedAt.current = null
    input.current?.focus()
  }, [])

  const reveal = useCallback(() => {
    setGuess(current.answer)
    setStatus('correct')
    setElapsed(null)
    input.current?.focus()
  }, [current.answer])

  const seconds = elapsed === null ? null : (elapsed / 1000).toFixed(2)

  return (
    <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
      <h2 className="font-mono text-[10px] tracking-[0.18em] text-muted">CAN YOU DECODE THIS?</h2>

      <p
        className="mt-4 font-mono text-2xl break-all text-signal sm:text-4xl"
        // The dots and dashes are the puzzle; announcing them would give it
        // away, so the accessible name points at the audio instead.
        aria-hidden="true"
      >
        {prettify(morse)}
      </p>

      <form onSubmit={check} className="mt-6">
        <label htmlFor="decode-input" className="sr-only">
          What does this Morse code say? Use the play button to hear it.
        </label>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="decode-input"
            ref={input}
            value={guess}
            onChange={(event) => {
              startClock()
              setGuess(event.target.value)
              // Clearing the verdict as they retype stops "NOT QUITE" hanging
              // over an answer they have already changed.
              if (status === 'wrong') setStatus('idle')
            }}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Your answer"
            disabled={status === 'correct'}
            className="min-w-0 flex-1 rounded-lg border border-line bg-elevated px-4 py-3 font-display text-lg uppercase outline-none focus:border-signal disabled:opacity-60"
          />

          <button
            type="button"
            onClick={() => void play()}
            className="rounded-lg border border-cyan/40 px-5 py-3 font-mono text-xs tracking-[0.14em] text-cyan"
          >
            ▶ HEAR IT
          </button>

          {status !== 'correct' && (
            <button
              type="submit"
              disabled={guess.trim() === ''}
              className="rounded-lg px-6 py-3 font-mono text-xs tracking-[0.14em] text-void disabled:opacity-40"
              style={{ background: 'var(--color-signal)' }}
            >
              DECODE
            </button>
          )}
        </div>
      </form>

      <div aria-live="polite" className="mt-5 min-h-20">
        {status === 'wrong' && (
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-danger">Not that one. Try hearing it.</p>
            <button
              type="button"
              onClick={reveal}
              className="font-mono text-[10px] tracking-[0.14em] text-muted underline underline-offset-4 hover:text-signal"
            >
              SHOW ME
            </button>
          </div>
        )}

        {status === 'correct' && (
          <div>
            <p className="font-display text-2xl font-bold text-signal">
              {current.answer}
              {seconds && (
                <span className="ml-3 font-mono text-sm font-normal text-muted">{seconds}s</span>
              )}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{current.note}</p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={next}
                className="rounded-lg border border-line px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-signal hover:text-signal"
              >
                ANOTHER →
              </button>
              <a
                href="/learn-morse-code-in-7-days/"
                className="rounded-lg px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-void"
                style={{ background: 'var(--color-signal)' }}
              >
                LEARN THE WHOLE ALPHABET
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Exported so the puzzle set can be checked against the real engine. */
export const DECODE_ROUNDS = ROUNDS
