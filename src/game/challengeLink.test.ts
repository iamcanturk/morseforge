import { describe, expect, it } from 'vitest'
import {
  BOUNDS,
  DEFAULT_CHALLENGE,
  challengePool,
  challengeQuery,
  challengeShare,
  challengeUrl,
  describeChallenge,
  isCustom,
  isIncoming,
  newSeed,
  parseChallenge,
  parseSeed,
  practiceInvite,
  seedNumber,
  versus,
  type ChallengeLink,
} from './challengeLink'
import { LEARNING_ORDER } from '../data/morseAlphabet'
import { WPM_RANGE } from '../storage/settings'
import { SIXTY_SECOND_CHALLENGE, promptSequence } from './session'
import { createRandom } from './random'
import { clipboardText, shareData } from './share'

const SITE = 'https://morse.example'

describe('the default challenge', () => {
  it('is the first fourteen letters, as DEC-006 decided', () => {
    expect(DEFAULT_CHALLENGE.pool).toBe(14)
    expect(challengePool(DEFAULT_CHALLENGE)).toEqual(LEARNING_ORDER.slice(0, 14))
  })

  it('takes its length from the sixty-second challenge, not a typed number', () => {
    expect(DEFAULT_CHALLENGE.time * 1000).toBe(SIXTY_SECOND_CHALLENGE.durationMs)
  })

  it('has no seed and no score: those come from a run or a link', () => {
    expect(DEFAULT_CHALLENGE.seed).toBeNull()
    expect(DEFAULT_CHALLENGE.beat).toBeNull()
  })
})

describe('parseChallenge', () => {
  it('reads the seeded link from the flow audit (P1)', () => {
    expect(parseChallenge('?seed=k7f3&pool=14&time=60&wpm=20&beat=340')).toEqual({
      seed: 'k7f3',
      pool: 14,
      time: 60,
      wpm: 20,
      count: null,
      beat: 340,
    })
  })

  it('still reads a link made before seeds existed', () => {
    // These are already out there in chats. They must keep opening a
    // challenge; they simply have no fixed sequence.
    expect(parseChallenge('?time=60&wpm=20&count=40&beat=340')).toEqual({
      seed: null,
      pool: DEFAULT_CHALLENGE.pool,
      time: 60,
      wpm: 20,
      count: 40,
      beat: 340,
    })
    expect(parseChallenge('?beat=340').seed).toBeNull()
  })

  it('falls back to the standard challenge when there is nothing to read', () => {
    expect(parseChallenge('')).toEqual(DEFAULT_CHALLENGE)
    expect(parseChallenge('?')).toEqual(DEFAULT_CHALLENGE)
  })

  it('ignores parameters it does not know', () => {
    // A link forwarded through a chat app or an ad network picks these up.
    const link = parseChallenge('?utm_source=x&fbclid=abc&wpm=25&seed=abc')
    expect(link.wpm).toBe(25)
    expect(link.seed).toBe('abc')
  })

  it('clamps rather than trusts', () => {
    // A URL is the most editable input a web app has.
    expect(parseChallenge('?wpm=99999').wpm).toBe(BOUNDS.wpm.max)
    expect(parseChallenge('?wpm=-40').wpm).toBe(BOUNDS.wpm.min)
    // The same range the speed slider offers, so no link asks for 60 WPM.
    expect(BOUNDS.wpm).toEqual(WPM_RANGE)
    expect(parseChallenge(`?wpm=${WPM_RANGE.max + 1}`).wpm).toBe(WPM_RANGE.max)
    expect(parseChallenge('?time=100000').time).toBe(BOUNDS.time.max)
    expect(parseChallenge('?time=0').time).toBe(BOUNDS.time.min)
    expect(parseChallenge('?count=1').count).toBe(BOUNDS.count.min)
    expect(parseChallenge('?pool=1').pool).toBe(BOUNDS.pool.min)
    expect(parseChallenge('?pool=900').pool).toBe(LEARNING_ORDER.length)
    expect(parseChallenge('?beat=-5').beat).toBe(0)
  })

  it('survives values that are not numbers at all', () => {
    // Someone handed this link should get a challenge, not an error page.
    for (const query of [
      '?wpm=abc',
      '?time=NaN',
      '?count=Infinity',
      '?wpm=',
      '?beat=<script>',
      '?pool=%%%',
      '?seed=%E0%A4%A',
      '?seed=<img src=x onerror=alert(1)>',
      '%',
      '?&&&=&=',
    ]) {
      expect(() => parseChallenge(query), query).not.toThrow()
      const link = parseChallenge(query)
      expect(challengePool(link).length, query).toBeGreaterThanOrEqual(BOUNDS.pool.min)
    }
    expect(parseChallenge('?wpm=abc').wpm).toBe(DEFAULT_CHALLENGE.wpm)
    expect(parseChallenge('?time=NaN').time).toBe(DEFAULT_CHALLENGE.time)
    expect(parseChallenge('?count=Infinity').count).toBe(DEFAULT_CHALLENGE.count)
    expect(parseChallenge('?pool=abc').pool).toBe(DEFAULT_CHALLENGE.pool)
  })

  it('rounds a fractional value rather than passing it on', () => {
    expect(parseChallenge('?wpm=17.6').wpm).toBe(18)
    expect(parseChallenge('?pool=6.4').pool).toBe(6)
  })

  it('reads a score to beat', () => {
    expect(parseChallenge('?beat=340').beat).toBe(340)
  })
})

describe('parseSeed', () => {
  it('accepts short letter-and-digit tokens, lower-cased', () => {
    expect(parseSeed('k7f3')).toBe('k7f3')
    expect(parseSeed('K7F3')).toBe('k7f3')
    expect(parseSeed(' k7f3 ')).toBe('k7f3')
  })

  it('drops anything that could carry markup, or is too long to be a seed', () => {
    // A seed is shown on the page. Refusing everything but [a-z0-9] means it
    // can never be anything other than text.
    for (const raw of ['', '<b>', 'a b', 'k7f3"', 'x'.repeat(17), 'ü', 'a-b']) {
      expect(parseSeed(raw), raw).toBeNull()
    }
    expect(parseSeed(null)).toBeNull()
  })
})

describe('newSeed', () => {
  it('makes a seed that its own parser accepts', () => {
    const random = createRandom(42)
    for (let i = 0; i < 200; i++) {
      const seed = newSeed(random)
      expect(parseSeed(seed)).toBe(seed)
    }
  })

  it('varies from run to run', () => {
    const random = createRandom(7)
    const seeds = new Set(Array.from({ length: 100 }, () => newSeed(random)))
    expect(seeds.size).toBeGreaterThan(95)
  })

  it('is total even for a broken random source', () => {
    expect(parseSeed(newSeed(() => 1))).not.toBeNull()
  })
})

describe('the same link, the same game', () => {
  it('turns one link into one prompt sequence, on any device', () => {
    const url = '?seed=k7f3&pool=14&time=60&wpm=20&beat=340'
    const a = parseChallenge(url)
    const b = parseChallenge(url)
    expect(promptSequence(challengePool(a), seedNumber(a.seed!), 60)).toEqual(
      promptSequence(challengePool(b), seedNumber(b.seed!), 60),
    )
  })

  it('is not changed by the score on it', () => {
    // Beating 340 and resharing changes `beat` only, so the next friend plays
    // the identical run.
    const a = parseChallenge('?seed=k7f3&pool=14&time=60&wpm=20&beat=340')
    const b = parseChallenge(challengeQuery({ ...a, beat: 372 }))
    expect(b).toEqual({ ...a, beat: 372 })
  })
})

describe('challengeQuery', () => {
  it('writes nothing for an unseeded standard challenge', () => {
    expect(challengeQuery(DEFAULT_CHALLENGE)).toBe('')
  })

  it('writes only what differs while there is no seed', () => {
    expect(challengeQuery({ ...DEFAULT_CHALLENGE, wpm: 25 })).toBe('?wpm=25')
  })

  it('spells out every setting once there is a seed, in a fixed order', () => {
    // A link meant to work forever must not lean on today's defaults.
    expect(challengeQuery({ ...DEFAULT_CHALLENGE, seed: 'k7f3', wpm: 20, beat: 340 })).toBe(
      '?seed=k7f3&pool=14&time=60&wpm=20&beat=340',
    )
  })

  it('round-trips', () => {
    const cases: ChallengeLink[] = [
      { seed: 'k7f3', pool: 14, time: 60, wpm: 20, count: null, beat: 340 },
      { seed: null, pool: 6, time: 120, wpm: 25, count: 40, beat: 500 },
      { seed: null, pool: 14, time: 60, wpm: 15, count: null, beat: null },
      { seed: 'abc123', pool: 26, time: 30, wpm: 40, count: 10, beat: null },
    ]
    for (const challenge of cases) {
      expect(parseChallenge(challengeQuery(challenge))).toEqual(challenge)
    }
  })
})

describe('challengeUrl', () => {
  it('points at the challenge page, with or without a trailing slash on the site', () => {
    const link = { ...DEFAULT_CHALLENGE, seed: 'k7f3' }
    expect(challengeUrl(link, SITE)).toBe(`${SITE}/challenge/?seed=k7f3&pool=14&time=60&wpm=15`)
    expect(challengeUrl(link, `${SITE}/`)).toBe(challengeUrl(link, SITE))
    expect(challengeUrl(DEFAULT_CHALLENGE, SITE)).toBe(`${SITE}/challenge/`)
  })
})

describe('isCustom and isIncoming', () => {
  it('is not custom for the standard challenge, with or without a seed or score', () => {
    expect(isCustom(DEFAULT_CHALLENGE)).toBe(false)
    expect(isCustom({ ...DEFAULT_CHALLENGE, beat: 400 })).toBe(false)
    expect(isCustom({ ...DEFAULT_CHALLENGE, seed: 'abc' })).toBe(false)
  })

  it('is custom once any setting differs', () => {
    expect(isCustom({ ...DEFAULT_CHALLENGE, wpm: 30 })).toBe(true)
    expect(isCustom({ ...DEFAULT_CHALLENGE, count: 20 })).toBe(true)
    expect(isCustom({ ...DEFAULT_CHALLENGE, pool: 26 })).toBe(true)
  })

  it('is incoming when a link fixes the sequence or carries a score', () => {
    expect(isIncoming(DEFAULT_CHALLENGE)).toBe(false)
    expect(isIncoming({ ...DEFAULT_CHALLENGE, seed: 'abc' })).toBe(true)
    expect(isIncoming({ ...DEFAULT_CHALLENGE, beat: 10 })).toBe(true)
  })
})

describe('describeChallenge', () => {
  it('says what is about to happen', () => {
    expect(describeChallenge({ ...DEFAULT_CHALLENGE, wpm: 20, count: 40 })).toBe(
      '60 seconds · 20 WPM · 14 letters · 40 characters',
    )
  })

  it('leaves out a count that was never set', () => {
    expect(describeChallenge(DEFAULT_CHALLENGE)).toBe('60 seconds · 15 WPM · 14 letters')
  })
})

describe('versus', () => {
  it('is nothing without a score on the link', () => {
    expect(versus(DEFAULT_CHALLENGE, 100)).toBeNull()
  })

  it('compares the two numbers and says whether the runs matched', () => {
    expect(versus({ ...DEFAULT_CHALLENGE, seed: 'k7f3', beat: 340 }, 372)).toEqual({
      you: 372,
      them: 340,
      sameSequence: true,
    })
    // An old link: the sender's prompts were their own.
    expect(versus({ ...DEFAULT_CHALLENGE, beat: 340 }, 372)?.sameSequence).toBe(false)
  })
})

describe('challengeShare', () => {
  const played: ChallengeLink = { ...DEFAULT_CHALLENGE, seed: 'k7f3', wpm: 20, beat: 340 }
  const message = challengeShare({
    challenge: played,
    score: 372,
    correct: 34,
    total: 39,
    accuracy: 34 / 39,
    siteUrl: SITE,
    siteName: 'MorseForge',
  })

  it('gives a share sheet the link once, as url, and the clipboard the link at the end', () => {
    // DEC-035: share targets append `url` to the text, so a text that also
    // carried it posted the link twice. A paste has no url field, so the
    // copied text ends in it.
    expect(message.text).not.toContain(message.url)
    expect(message.text).not.toContain('http')
    expect(shareData(message)).toEqual({
      title: message.title,
      text: message.text,
      url: message.url,
    })
    expect(clipboardText(message)).toBe(`${message.text} ${message.url}`)
  })

  it('links the same run, with the new score to beat', () => {
    expect(parseChallenge(new URL(message.url).search)).toEqual({ ...played, beat: 372 })
  })

  it('says the score, the count and the accuracy that were actually achieved', () => {
    expect(message.text).toContain('372')
    expect(message.text).toContain('34 of 39')
    expect(message.text).toContain('87%')
    expect(message.title).toContain('372')
  })
})

describe('practiceInvite', () => {
  const message = practiceInvite({
    seed: 'abcde',
    accuracy: 0.9,
    total: 20,
    siteUrl: SITE,
    siteName: 'MorseForge',
  })

  it('invites to a fresh seeded challenge with no score to beat', () => {
    // A practice score is not comparable with a challenge score, so it is not
    // offered as one.
    const link = parseChallenge(new URL(message.url).search)
    expect(link.seed).toBe('abcde')
    expect(link.beat).toBeNull()
  })

  it('carries the link as its url, and on the clipboard, never twice', () => {
    expect(message.text).not.toContain(message.url)
    expect(clipboardText(message).endsWith(message.url)).toBe(true)
  })
})
