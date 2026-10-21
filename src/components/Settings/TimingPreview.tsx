import { formatSeconds } from '../../data/format'
import { encode } from '../../engine/morseEncoder'
import {
  type TimingOptions,
  buildTimeline,
  resolveTiming,
  timelineDuration,
} from '../../engine/timingEngine'
import { Screen } from '../ui/Screen'

/** The word every WPM figure is defined by (timingEngine `PARIS_UNITS`). */
export const REFERENCE_WORD = 'PARIS'

export interface StripTone {
  /** Start, as a fraction of the word's length. */
  x: number
  width: number
}

export interface StripLetter {
  letter: string
  /** Centre of the letter's tones, as a fraction of the word's length. */
  centre: number
}

/**
 * PARIS laid out to scale: where each tone starts and how long it lasts, as
 * fractions of one whole word including its trailing word gap. Pure, so the
 * picture can be checked against the timing engine.
 */
export function stripLayout(
  word: string,
  timing: TimingOptions,
): { tones: StripTone[]; letters: StripLetter[]; wordMs: number } {
  const resolved = resolveTiming(timing)
  const letters = [...word]
  const tones: StripTone[] = []
  const centres: StripLetter[] = []

  // One timeline per letter, so each letter's span is known for its label.
  const total = timelineDuration(buildTimeline(encode(word), timing)) + resolved.wordGap
  let at = 0
  letters.forEach((letter, index) => {
    if (index > 0) at += resolved.characterGap
    const start = at
    for (const element of buildTimeline(encode(letter), timing)) {
      if (element.on) tones.push({ x: at / total, width: element.duration / total })
      at += element.duration
    }
    centres.push({ letter, centre: (start + at) / 2 / total })
  })

  return { tones, letters: centres, wordMs: total }
}

/**
 * The live picture of the speed settings: PARIS on the screen, drawn to
 * scale, so dragging Farnsworth visibly pulls the letters apart while the
 * letters themselves stay the same length.
 */
export function TimingPreview({ timing }: { timing: TimingOptions }) {
  const resolved = resolveTiming(timing)
  const { tones, letters, wordMs } = stripLayout(REFERENCE_WORD, timing)
  const farnsworth = timing.farnsworthWpm !== undefined && timing.farnsworthWpm < timing.wpm

  return (
    <Screen grid className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="mf-engraved">
          {REFERENCE_WORD} at {timing.wpm}
          {farnsworth ? ` / ${timing.farnsworthWpm}` : ''} WPM
        </p>
        <p className="font-mono text-control text-signal tabular-nums">
          {formatSeconds(wordMs)} s per word
        </p>
      </div>

      <svg
        className="pj-strip mt-3"
        viewBox="0 0 1000 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${REFERENCE_WORD} drawn to scale: each bar is a tone, each space is silence.`}
      >
        <line className="pj-strip-base" x1="0" y1="34" x2="1000" y2="34" />
        {tones.map((tone, index) => (
          <rect
            key={index}
            className="pj-strip-tone"
            x={tone.x * 1000}
            y={10}
            width={Math.max(tone.width * 1000, 1.5)}
            height={24}
            rx={1}
          />
        ))}
      </svg>
      <div className="relative h-5" aria-hidden="true">
        {letters.map(({ letter, centre }) => (
          <span
            key={letter}
            className="absolute top-1 -translate-x-1/2 font-mono text-label text-muted"
            style={{ left: `${centre * 100}%` }}
          >
            {letter}
          </span>
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3 font-mono text-label">
        <div>
          <dt className="mf-engraved">Dot</dt>
          <dd className="mt-1 text-control text-ink tabular-nums">{Math.round(resolved.dot)} ms</dd>
        </div>
        <div>
          <dt className="mf-engraved">Letter gap</dt>
          <dd className="mt-1 text-control text-ink tabular-nums">
            {Math.round(resolved.characterGap)} ms
          </dd>
        </div>
        <div>
          <dt className="mf-engraved">Word gap</dt>
          <dd className="mt-1 text-control text-ink tabular-nums">
            {Math.round(resolved.wordGap)} ms
          </dd>
        </div>
      </dl>
    </Screen>
  )
}
