import {
  challengePool,
  describeChallenge,
  isIncoming,
  type ChallengeLink,
} from '../../game/challengeLink'
import type { SignalMode } from '../../storage/settings'
import { Screen } from '../ui/Screen'
import { signalNote } from '../Practice/practice'
import '../../styles/pkg-e.css'

/**
 * Before the timed challenge starts: what is about to happen, and, when
 * someone sent the link, whose run this is.
 *
 * The received challenge used to be a 12px line. It is the moment the whole
 * share loop exists for, so it is now a telegram the recipient holds before
 * pressing start (TASK-001 §2.5). Their score is printed as what it is: a
 * number in a URL that anyone could have typed.
 */
export interface ChallengeIntroProps {
  link: ChallengeLink
  onStart: () => void
  /** How the characters will reach the player (DEC-045). */
  signal: SignalMode
}

export function ChallengeIntro({ link, onStart, signal }: ChallengeIntroProps) {
  const pool = challengePool(link)
  const incoming = isIncoming(link)
  const note = signalNote(signal, 'character')
  const lampOnly = signal === 'lamp'

  return (
    <div className="grid gap-6">
      {incoming && <IncomingWire link={link} />}

      <section aria-labelledby="challenge-ready" className="mf-instrument p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 id="challenge-ready" className="mf-engraved flex items-center gap-2">
            <span className="mf-lamp" data-on="true" data-tone="amber" aria-hidden="true" />
            {incoming ? 'Their run, your turn' : `${link.time}-second test`}
          </h2>
          <span className="mf-engraved hidden sm:inline">
            {lampOnly ? 'Watch · type what you see' : 'Listen · type what you hear'}
          </span>
        </div>

        {/* On a phone the clock and its unit share a line and the text steps
            down a size, so a recipient holding the telegram above still sees
            Start without scrolling (WI-2). */}
        <Screen
          grid
          className="mt-5 grid gap-4 px-5 py-6 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6 sm:px-8 sm:py-8"
        >
          <div className="relative z-[3] flex items-baseline justify-center gap-3 sm:grid sm:justify-items-start sm:gap-0">
            <span className="font-mono text-readout-xl text-signal tabular-nums mf-phosphor">
              {link.time}
            </span>
            <span className="mf-engraved sm:mt-2">seconds</span>
          </div>
          <div className="relative z-[3]">
            <p className="text-base text-ink sm:text-lead">
              {lampOnly
                ? 'One character flashes at a time. Type the letter you saw; the next one follows a moment later.'
                : 'One character plays at a time. Type the letter you heard; the next one follows a moment later.'}
            </p>
            <p className="mf-engraved mt-2">{describeChallenge(link)}</p>
          </div>
        </Screen>

        {/* Start straight under what it starts; the letters are reference,
            and stay one glance below it. */}
        <button
          type="button"
          onClick={onStart}
          className="mf-btn mf-btn-amber mf-btn-lg mf-btn-block mt-6"
        >
          Start the {link.time} seconds
        </button>

        <div className="mt-6">
          <p className="mf-engraved">The letters in this run</p>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`${pool.length} letters`}>
            {pool.map((character) => (
              <li key={character} className="mf-kbd">
                {character}
              </li>
            ))}
          </ul>
        </div>

        {note && (
          <p className="mt-4 text-sm text-muted" role="note">
            {note}{' '}
            <a href="/settings/#signal" className="text-ink underline underline-offset-4">
              Change it in settings
            </a>
            .
          </p>
        )}

        <p className="mt-4 text-sm text-muted">
          New to Morse code? E is one short {lampOnly ? 'flash' : 'beep'} and T is one long one.{' '}
          <a href="/learn/" className="text-signal underline underline-offset-4">
            Learn your first letters
          </a>{' '}
          before the clock starts.
        </p>
      </section>
    </div>
  )
}

/** The telegram a recipient holds: the sender's claimed score and the run's settings. */
export function IncomingWire({ link }: { link: ChallengeLink }) {
  return (
    <section aria-labelledby="incoming-heading" className="pe-telegram mf-slip p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mf-engraved">
            Incoming wire{link.seed !== null && <> · run {link.seed.toUpperCase()}</>}
          </p>
          <h2 id="incoming-heading" className="mt-3 font-display text-h2 font-bold">
            {link.beat !== null ? (
              <>
                Their score: <span className="tabular-nums">{link.beat}</span>
              </>
            ) : (
              'Someone sent you this run'
            )}
          </h2>
          {link.beat !== null && (
            <p className="pe-paper-muted mt-1 text-sm">
              Claimed by the link. Nothing checks it; it is whatever the URL says.
            </p>
          )}
        </div>
        <span className="mf-stamp pe-paper-stamp shrink-0 text-base sm:text-h3">
          {link.beat !== null ? `Beat ${link.beat}` : 'Same run'}
        </span>
      </div>
      <p className="mt-4 max-w-[60ch]">
        {link.seed !== null
          ? 'You get the same characters, in the same order, at the same speed.'
          : 'This is an older link without a fixed sequence: the speed and length match, but your characters will be your own draw.'}
      </p>
    </section>
  )
}
