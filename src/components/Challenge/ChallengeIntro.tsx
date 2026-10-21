import { challengePool, isIncoming, type ChallengeLink } from '../../game/challengeLink'
import { LEARNING_STAGES } from '../../data/morseAlphabet'
import type { SignalMode } from '../../storage/settings'
import { useT } from '../../i18n/react'
import { renderRich } from '../../i18n/richReact'
import type { Translator } from '../../i18n/translator'
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

/**
 * "60 seconds · 20 WPM · 26 letters", in the page's language: the same parts
 * as `describeChallenge` in `src/game/challengeLink.ts`.
 */
export function describeChallenge(t: Translator, link: ChallengeLink): string {
  const parts = [
    t('challenge.describeTime', { seconds: link.time }),
    t('challenge.describeWpm', { wpm: link.wpm }),
    t('challenge.describeLetters', { count: challengePool(link).length }),
  ]
  if (link.count !== null) parts.push(t('challenge.describeCharacters', { count: link.count }))
  return parts.join(' · ')
}

/** The two one-element letters the newcomer line names: E (short) and T (long). */
const [SHORT, LONG] = LEARNING_STAGES[0] ?? []

export function ChallengeIntro({ link, onStart, signal }: ChallengeIntroProps) {
  const t = useT()
  const pool = challengePool(link)
  const incoming = isIncoming(link)
  const note = signalNote(t, signal)
  const lampOnly = signal === 'lamp'

  return (
    <div className="grid gap-6">
      {incoming && <IncomingWire link={link} />}

      <section aria-labelledby="challenge-ready" className="mf-instrument p-5 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <h2 id="challenge-ready" className="mf-engraved flex items-center gap-2">
            <span className="mf-lamp" data-on="true" data-tone="amber" aria-hidden="true" />
            {incoming ? t('challenge.theirRun') : t('challenge.test', { seconds: link.time })}
          </h2>
          <span className="mf-engraved hidden sm:inline">
            {lampOnly ? t('challenge.watchType') : t('challenge.listenType')}
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
            <span className="mf-engraved sm:mt-2">{t('challenge.seconds')}</span>
          </div>
          <div className="relative z-[3]">
            <p className="text-base text-ink sm:text-lead">
              {lampOnly ? t('challenge.flashIntro') : t('challenge.playIntro')}
            </p>
            <p className="mf-engraved mt-2">{describeChallenge(t, link)}</p>
          </div>
        </Screen>

        {/* Start straight under what it starts; the letters are reference,
            and stay one glance below it. */}
        <button
          type="button"
          onClick={onStart}
          className="mf-btn mf-btn-amber mf-btn-lg mf-btn-block mt-6"
        >
          {t('challenge.startButton', { seconds: link.time })}
        </button>

        <div className="mt-6">
          <p className="mf-engraved">{t('challenge.lettersHeading')}</p>
          <ul
            className="mt-3 flex flex-wrap gap-1.5"
            aria-label={t('challenge.letterCount', { count: pool.length })}
          >
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
            <a href={t.href('/settings/#signal')} className="text-ink underline underline-offset-4">
              {t('challenge.changeInSettings')}
            </a>
            .
          </p>
        )}

        <p className="mt-4 text-sm text-muted">
          {renderRich(
            t.rich(lampOnly ? 'challenge.newToMorseFlash' : 'challenge.newToMorseBeep', {
              short: SHORT ?? '',
              long: LONG ?? '',
            }),
            { learn: { href: '/learn/', class: 'text-signal underline underline-offset-4' } },
            t,
          )}
        </p>
      </section>
    </div>
  )
}

/** The telegram a recipient holds: the sender's claimed score and the run's settings. */
export function IncomingWire({ link }: { link: ChallengeLink }) {
  const t = useT()
  return (
    <section aria-labelledby="incoming-heading" className="pe-telegram mf-slip p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mf-engraved">
            {link.seed !== null
              ? t('challenge.incomingRun', { run: link.seed.toUpperCase() })
              : t('challenge.incomingWire')}
          </p>
          <h2 id="incoming-heading" className="mt-3 font-display text-h2 font-bold">
            {link.beat !== null
              ? renderRich(t.rich('challenge.theirScore', { score: link.beat }), {
                  score: { el: 'span', class: 'tabular-nums' },
                })
              : t('challenge.someoneSent')}
          </h2>
          {link.beat !== null && (
            <p className="pe-paper-muted mt-1 text-sm">{t('challenge.claimed')}</p>
          )}
        </div>
        <span className="mf-stamp pe-paper-stamp shrink-0 text-base sm:text-h3">
          {link.beat !== null ? t('challenge.beat', { score: link.beat }) : t('challenge.sameRun')}
        </span>
      </div>
      <p className="mt-4 max-w-[60ch]">
        {link.seed !== null ? t('challenge.sameSequence') : t('challenge.olderLink')}
      </p>
    </section>
  )
}
