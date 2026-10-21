import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnswerKey } from './AnswerKey'
import { bringIntoView } from './bringIntoView'
import { Screen } from '../ui/Screen'
import { Lamp } from '../ui/Lamp'
import { SignalLamp } from '../ui/SignalLamp'
import { useTransmitter } from '../ui/transmitter'
import type { UseCopySessionResult } from './useCopySession'
import { encode } from '../../engine/morseEncoder'
import { estimateDuration } from '../../engine/timingEngine'
import { type SettingsRecord, hasLamp, hasSound } from '../../storage/settings'

/**
 * One line of copy practice: send it, take an answer, show the answer key.
 *
 * Shared by free copy practice and the daily challenge, which differ in what
 * they send and how they are scored but not at all in how a line is answered.
 * Keeping this in one place is what stops the two screens drifting into two
 * slightly different exercises.
 */

export interface RoundAudio {
  /** The learner's settings: the Signal mode, tone and volume come from here. */
  settings: SettingsRecord
  /** The speed of the line. The daily sets its own; free copy uses the settings'. */
  wpm: number
  farnsworthWpm: number
}

export function useCopyRound(session: UseCopySessionResult, audio: RoundAudio) {
  const { status, current } = session

  const [typed, setTyped] = useState('')
  const [plays, setPlays] = useState(0)

  // One timeline for the tone and the lamp, from the Signal setting
  // (DEC-045). With Signal = Lamp the line flashes in silence instead of
  // being "sent" to nobody.
  const transmitter = useTransmitter(audio.settings)
  const { transmit, stop: halt } = transmitter
  const input = useRef<HTMLInputElement>(null)
  const advance = useRef<HTMLButtonElement>(null)

  // Held in a ref so the play callback keeps a stable identity: it is called
  // from an effect keyed on the prompt, and re-sending a line because the
  // volume slider moved would be maddening.
  const timing = useRef({ wpm: audio.wpm, farnsworthWpm: audio.farnsworthWpm })
  timing.current = { wpm: audio.wpm, farnsworthWpm: audio.farnsworthWpm }

  // A second press restarts rather than overlapping: two copies of the same
  // line a beat apart are unreadable. The transmitter restarts by itself.
  const play = useCallback(
    (text: string) => {
      setPlays((count) => count + 1)
      return transmit(encode(text), timing.current)
    },
    [transmit],
  )

  /** Whether this line is the first of its run, read when the line appears. */
  const firstLine = useRef(true)
  firstLine.current = session.results.length === 0

  // The line stops sounding once it is answered, given up or ended: the
  // answer key on screen and the tail of the line still playing do not mix.
  useEffect(() => {
    if (status !== 'running') halt()
  }, [status, halt])

  // Send each line as it appears. The AudioContext is unlocked by then, since
  // a session only starts from a press. The first line of a run brings the
  // whole instrument into view (V-01); later lines leave the page where the
  // learner put it, since the field is already in view.
  useEffect(() => {
    if (status !== 'running' || current === null) return
    setPlays(0)
    setTyped('')
    void play(current)
    if (firstLine.current) bringIntoView(input.current?.closest('section') ?? null, input.current)
    else input.current?.focus()
  }, [current, status, play])

  // Move focus to the continue button while the answer key is up, so a whole
  // session stays playable from the keyboard.
  useEffect(() => {
    if (status === 'reviewing') advance.current?.focus()
  }, [status])

  const estimate = useMemo(
    () =>
      current === null
        ? 0
        : Math.round(
            estimateDuration(current, {
              wpm: audio.wpm,
              farnsworthWpm: audio.farnsworthWpm,
            }) / 1000,
          ),
    [current, audio.wpm, audio.farnsworthWpm],
  )

  return {
    typed,
    setTyped,
    sending: transmitter.busy,
    lit: transmitter.lit,
    sound: hasSound(audio.settings),
    lamp: hasLamp(audio.settings),
    plays,
    estimate,
    play,
    input,
    advance,
  }
}

export type CopyRound = ReturnType<typeof useCopyRound>

export function CopyRound({
  session,
  round,
  nextLabel,
}: {
  session: UseCopySessionResult
  round: CopyRound
  /** What the continue button says on the final line. */
  nextLabel: string
}) {
  const { status, current, lastGrade } = session
  const { typed, setTyped, sending, lit, sound, lamp, plays, estimate, play, input, advance } =
    round

  const helpId = useId()
  const reviewing = status === 'reviewing' && lastGrade !== null
  const lost = reviewing ? [...new Set(lastGrade.missed)] : []

  return (
    <div className="mt-6">
      {/* Focus moves to the continue button once a line is graded, which
          would skip the grade itself — the one thing worth hearing. A live
          region only announces changes to itself, so this one is mounted for
          the whole round and its text changes, rather than mounting with it. */}
      <p className="sr-only" aria-live="polite">
        {reviewing ? gradeAnnouncement(lastGrade, lost) : ''}
      </p>
      {reviewing ? (
        <div>
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3">
            <span className="mf-engraved">Answer key</span>
            {lastGrade.perfect ? (
              <span className="mf-stamp mf-stamp-in text-signal">Clean copy</span>
            ) : (
              <span className="font-mono text-control text-ink tabular-nums">
                {lastGrade.hits} of {lastGrade.total} characters
              </span>
            )}
          </div>

          <div className="mt-3">
            <AnswerKey grade={lastGrade} />
          </div>

          {!lastGrade.perfect && lost.length > 0 && (
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Got past you: <span className="font-mono text-ink">{lost.join(' ')}</span>
            </p>
          )}

          <button
            ref={advance}
            type="button"
            onClick={session.next}
            className="mf-btn mf-btn-primary mf-btn-lg mf-btn-block mt-6"
          >
            {nextLabel}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            session.submit(typed)
          }}
        >
          <Screen grid className="p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="mf-engraved flex items-center gap-2">
                <Lamp on={sending} tone="cyan" />
                {sending ? (sound ? 'Receiving' : 'Receiving · watch') : 'Line received'}
              </span>
              <span className="font-mono text-label tracking-label text-muted uppercase">
                {plays <= 1 ? `About ${estimate}s` : `${sound ? 'Heard' : 'Seen'} ${plays} times`}
              </span>
            </div>

            {lamp && (
              <div className="relative z-[3] mt-5 flex justify-center">
                <SignalLamp lit={lit} />
              </div>
            )}

            <label htmlFor="copy-answer" className="sr-only">
              Type what you copied
            </label>
            <input
              id="copy-answer"
              ref={input}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              // Up sends the line again without leaving the box (AI-2): the
              // field has one line, so the arrow has nothing else to do.
              onKeyDown={(event) => {
                if (event.key !== 'ArrowUp' || event.altKey || event.ctrlKey || event.metaKey)
                  return
                if (event.shiftKey || current === null) return
                event.preventDefault()
                void play(current)
              }}
              aria-describedby={helpId}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Type what you copied"
              className="mf-input-answer mf-f-answer relative z-[3] mt-5"
            />
          </Screen>

          <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
            <button
              type="button"
              onClick={() => current && void play(current)}
              className="mf-btn mf-btn-audio mf-btn-lg"
              aria-label={sending ? 'Sending, press to start the line again' : undefined}
            >
              <Lamp on={sending} tone="cyan" />
              {sending ? 'Sending' : 'Send it again'}
            </button>
            <button type="submit" className="mf-btn mf-btn-primary mf-btn-lg">
              Check it
            </button>
          </div>
          <p id={helpId} className="mt-3 text-sm text-muted">
            The up arrow in the box sends the line again. Got nothing? Submit it empty. It counts,
            and nothing is lost by being honest about it.
          </p>
        </form>
      )}
    </div>
  )
}

/** What the live region says when a line is graded: the verdict, then what was missed. */
export function gradeAnnouncement(
  grade: { perfect: boolean; hits: number; total: number },
  lost: readonly string[],
): string {
  if (grade.perfect) return 'Clean copy.'
  const score = `${grade.hits} of ${grade.total} characters.`
  return lost.length > 0 ? `${score} Got past you: ${lost.join(' ')}.` : score
}
