import { type SubmitEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine } from '../../engine/audioEngine'
import { encode, prettify } from '../../engine/morseEncoder'
import { capitalise, numberWord } from '../../data/format'
import { ALL_LETTERS } from '../../data/morseAlphabet'

/**
 * "Can you read this?" (PROJECT.md §39.3, §57; TASK-001 §5.2 section 3).
 *
 * The landing's third section, styled as a telegram form: the message arrives
 * as a strip of paper tape pasted onto the form, the way early telegrams did,
 * and a correct reading is stamped RECEIVED. The page supplies the heading;
 * this island is only the puzzle, and it hydrates when scrolled to.
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
  signalRound('SIGNAL'),
]

/**
 * The last round's note, counted from the word rather than typed: how many
 * characters it has, and what share of the alphabet its letters are.
 */
function signalRound(answer: string): Round {
  const letters = new Set(answer).size
  const share = letters / ALL_LETTERS.length
  const portion = share >= 0.25 ? 'a quarter' : share >= 0.2 ? 'nearly a quarter' : 'a fifth'
  return {
    answer,
    note: `${capitalise(numberWord(answer.length))} characters, ${numberWord(letters)} different letters: ${portion} of the alphabet already.`,
  }
}

/** `revealed`: "Show me" gave the answer away, which is not a decode. */
type Status = 'idle' | 'wrong' | 'correct' | 'revealed'

/** The stamp over a finished round. A revealed answer is never "Received". */
export function stampFor(status: 'correct' | 'revealed'): string {
  return status === 'correct' ? 'Received' : 'Shown'
}

export function DecodeChallenge() {
  const [round, setRound] = useState(0)
  const [guess, setGuess] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [elapsed, setElapsed] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  /** Bumped on each miss, so the shake replays even on a second wrong answer. */
  const [misses, setMisses] = useState(0)

  const startedAt = useRef<number | null>(null)
  const audio = useRef<AudioEngine | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const another = useRef<HTMLButtonElement>(null)
  /** Set by "Another", so the next round's field takes focus once it is enabled again. */
  const advanced = useRef(false)

  const current = ROUNDS[round % ROUNDS.length]!
  const morse = useMemo(() => encode(current.answer), [current.answer])

  useEffect(() => () => void audio.current?.dispose(), [])

  // A miss shakes the field (D3). Restarted by hand rather than by re-keying
  // the input, which would remount it and drop the focus mid-answer.
  useEffect(() => {
    const field = input.current
    if (!field || misses === 0) return
    field.classList.remove('mf-shake')
    void field.offsetWidth
    field.classList.add('mf-shake')
  }, [misses])

  // The clock starts when the user first engages, not on mount: a visitor who
  // scrolled past and came back two minutes later has not taken two minutes.
  const startClock = useCallback(() => {
    startedAt.current ??= performance.now()
  }, [])

  const play = useCallback(async () => {
    startClock()
    audio.current ??= new AudioEngine()
    // Held for the whole message, so the button says something is happening.
    // Without it a muted device, or a browser that blocked the context, looks
    // identical to a button that does nothing.
    setPlaying(true)
    try {
      const playback = await audio.current.play(morse, { wpm: 12, farnsworthWpm: 8 })
      await playback.finished
    } finally {
      setPlaying(false)
    }
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
      setMisses((n) => n + 1)
    },
    [guess, current.answer],
  )

  const next = useCallback(() => {
    advanced.current = true
    setRound((n) => n + 1)
    setGuess('')
    setStatus('idle')
    setElapsed(null)
    startedAt.current = null
  }, [])

  const reveal = useCallback(() => {
    setGuess(current.answer)
    setStatus('revealed')
    setElapsed(null)
  }, [current.answer])

  const finished = status === 'correct' || status === 'revealed'

  // Focus follows the round, after the render that changes it. Focusing in
  // the click handlers did nothing: the field was still disabled, and the
  // button that had focus then unmounted, dropping focus to the page.
  // - A finished round disables the field and removes "Decode" and "Show me",
  //   so focus moves to "Another".
  // - "Another" re-enables the field, so focus goes back to it. Not on first
  //   mount: the island hydrates as it scrolls into view.
  useEffect(() => {
    if (finished) {
      another.current?.focus({ preventScroll: true })
      return
    }
    if (advanced.current && status === 'idle') {
      advanced.current = false
      input.current?.focus({ preventScroll: true })
    }
  }, [finished, status, round])

  const seconds = elapsed === null ? null : (elapsed / 1000).toFixed(2)
  const roundNumber = (round % ROUNDS.length) + 1

  return (
    <div className="mf-panel relative overflow-hidden p-5 sm:p-8">
      {/* The form's printed header. */}
      <div className="flex items-center justify-between gap-4 border-b border-line pb-3">
        <span className="mf-engraved text-ink">Telegram</span>
        <span className="font-mono text-label text-muted tabular-nums">
          No. {roundNumber} of {ROUNDS.length}
        </span>
      </div>

      <p className="mt-5 mf-engraved">Message</p>
      <p
        className="mf-tape mt-2 text-[clamp(1.375rem,1rem+2vw,2rem)] leading-snug break-words"
        // The dots and dashes are the puzzle; announcing them would give it
        // away, so the accessible name points at the audio instead.
        aria-hidden="true"
      >
        {prettify(morse)}
      </p>

      <form onSubmit={check} className="mt-6">
        <label htmlFor="decode-input" className="mf-engraved">
          Your reading
          <span className="sr-only">. What does this Morse code say? Use Hear it to listen.</span>
        </label>

        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="decode-input"
            ref={input}
            value={guess}
            onChange={(event) => {
              startClock()
              setGuess(event.target.value)
              // Clearing the verdict as they retype stops the miss hanging
              // over an answer they have already changed.
              if (status === 'wrong') setStatus('idle')
            }}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Type what it says"
            disabled={finished}
            aria-invalid={status === 'wrong'}
            className="mf-input min-w-0 flex-1 font-display text-xl font-bold tracking-label uppercase disabled:opacity-60"
          />

          {/* The one look every "play the sound" trigger shares (V-18). */}
          <button type="button" onClick={() => void play()} className="mf-btn mf-btn-audio">
            <span className="mf-lamp" data-tone="cyan" data-on={playing} aria-hidden="true" />
            {playing ? (
              'Playing'
            ) : (
              <>
                <span aria-hidden="true">▶ </span>Hear it
              </>
            )}
          </button>

          {!finished && (
            <button type="submit" disabled={guess.trim() === ''} className="mf-btn mf-btn-primary">
              Decode
            </button>
          )}
        </div>
      </form>

      <div aria-live="polite" className="mt-5 min-h-24">
        {/* The verdict's room is held so nothing jumps when it prints; until
            then it reads as the empty slip it is, not a gap (V-15). Decoration,
            so it is hidden from the live region. */}
        {status === 'idle' && (
          <p
            aria-hidden="true"
            className="grid min-h-24 place-items-center rounded-control border border-dashed border-line-strong px-4 text-center mf-engraved text-muted"
          >
            Your reading prints here
          </p>
        )}
        {status === 'wrong' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="text-sm text-danger">
              <span aria-hidden="true">✕ </span>Not that one. Try hearing it.
            </p>
            <button type="button" onClick={reveal} className="mf-btn mf-btn-ghost mf-btn-sm">
              Show me
            </button>
          </div>
        )}

        {finished && (
          <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start sm:gap-6">
            <span
              className={[
                'mf-stamp mf-stamp-in justify-self-start',
                status === 'correct' ? 'text-signal' : 'text-muted',
              ].join(' ')}
            >
              {stampFor(status)}
            </span>
            <div>
              <p className="font-display text-h3 font-bold tracking-label text-ink">
                {current.answer}
                {seconds && (
                  <span className="ml-3 font-mono text-sm font-normal tracking-normal text-muted tabular-nums">
                    {seconds}s
                  </span>
                )}
              </p>
              {status === 'revealed' && (
                <p className="mt-1 text-sm text-ink">
                  That is what it says. Play it again with the answer in front of you; the next one
                  is yours.
                </p>
              )}
              <p className="mt-1 text-sm leading-relaxed text-muted">{current.note}</p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  ref={another}
                  type="button"
                  onClick={next}
                  className="mf-btn mf-btn-secondary"
                >
                  Another →
                </button>
                {/* The hands-on path first (J-18): the lesson, where the next
                    letter is heard and sent; the written plan is the aside. */}
                <a href="/learn/" className="mf-btn mf-btn-primary">
                  Start the lesson
                </a>
              </div>
              <a
                href="/learn-morse-code-in-7-days/"
                className="mt-3 inline-block text-sm text-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
              >
                Or read the plan for the whole alphabet
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
