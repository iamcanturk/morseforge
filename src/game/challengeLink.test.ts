import { describe, expect, it } from 'vitest'
import {
  BOUNDS,
  DEFAULT_CHALLENGE,
  challengeQuery,
  describeChallenge,
  isCustom,
  parseChallenge,
} from './challengeLink'

describe('parseChallenge', () => {
  it('reads the parameters §36 specifies', () => {
    expect(parseChallenge('?time=60&wpm=20&count=40')).toEqual({
      time: 60,
      wpm: 20,
      count: 40,
      beat: null,
    })
  })

  it('falls back to the standard challenge when there is nothing to read', () => {
    expect(parseChallenge('')).toEqual(DEFAULT_CHALLENGE)
    expect(parseChallenge('?')).toEqual(DEFAULT_CHALLENGE)
  })

  it('ignores parameters it does not know', () => {
    // A link forwarded through a chat app or an ad network picks these up.
    expect(parseChallenge('?utm_source=x&fbclid=abc&wpm=25').wpm).toBe(25)
  })

  it('clamps rather than trusts', () => {
    // A URL is the most editable input a web app has.
    expect(parseChallenge('?wpm=99999').wpm).toBe(BOUNDS.wpm.max)
    expect(parseChallenge('?wpm=-40').wpm).toBe(BOUNDS.wpm.min)
    expect(parseChallenge('?time=100000').time).toBe(BOUNDS.time.max)
    expect(parseChallenge('?time=0').time).toBe(BOUNDS.time.min)
    expect(parseChallenge('?count=1').count).toBe(BOUNDS.count.min)
  })

  it('survives values that are not numbers at all', () => {
    // Someone handed this link should get a challenge, not an error page.
    for (const query of ['?wpm=abc', '?time=NaN', '?count=Infinity', '?wpm=', '?beat=<script>']) {
      expect(() => parseChallenge(query), query).not.toThrow()
    }
    expect(parseChallenge('?wpm=abc').wpm).toBe(DEFAULT_CHALLENGE.wpm)
    expect(parseChallenge('?time=NaN').time).toBe(DEFAULT_CHALLENGE.time)
    expect(parseChallenge('?count=Infinity').count).toBe(DEFAULT_CHALLENGE.count)
  })

  it('rounds a fractional value rather than passing it on', () => {
    expect(parseChallenge('?wpm=17.6').wpm).toBe(18)
  })

  it('reads a score to beat', () => {
    expect(parseChallenge('?beat=340').beat).toBe(340)
  })
})

describe('challengeQuery', () => {
  it('writes nothing for the standard challenge', () => {
    // An ordinary share should be a short link, not a wall of parameters that
    // all say "the usual".
    expect(challengeQuery(DEFAULT_CHALLENGE)).toBe('')
  })

  it('writes only what differs', () => {
    expect(challengeQuery({ ...DEFAULT_CHALLENGE, wpm: 25 })).toBe('?wpm=25')
  })

  it('round-trips', () => {
    for (const challenge of [
      { time: 120, wpm: 25, count: 40, beat: 500 },
      { time: 60, wpm: 15, count: null, beat: null },
      { time: 30, wpm: 40, count: 10, beat: null },
    ]) {
      expect(parseChallenge(challengeQuery(challenge))).toEqual(challenge)
    }
  })
})

describe('isCustom', () => {
  it('is false for the standard challenge, with or without a score', () => {
    expect(isCustom(DEFAULT_CHALLENGE)).toBe(false)
    expect(isCustom({ ...DEFAULT_CHALLENGE, beat: 400 })).toBe(false)
  })

  it('is true once any setting differs', () => {
    expect(isCustom({ ...DEFAULT_CHALLENGE, wpm: 30 })).toBe(true)
    expect(isCustom({ ...DEFAULT_CHALLENGE, count: 20 })).toBe(true)
  })
})

describe('describeChallenge', () => {
  it('says what is about to happen', () => {
    expect(describeChallenge({ time: 60, wpm: 20, count: 40, beat: null })).toBe(
      '60 seconds · 20 WPM · 40 characters',
    )
  })

  it('leaves out a count that was never set', () => {
    expect(describeChallenge(DEFAULT_CHALLENGE)).toBe('60 seconds · 15 WPM')
  })
})
