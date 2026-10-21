/**
 * Secret-message links (flow audit P4, DEC-017).
 *
 * A message travels inside the link itself, in the URL fragment:
 *
 *   /message/#m=<base64url of the UTF-8 text>
 *   /message/#m=<payload>&wpm=20        (optional sending speed)
 *
 * The fragment is the part after `#`. Browsers never put it in a request — not
 * in the request line, not in the Referer header — so the text cannot reach
 * nginx, the CDN, or the log summariser behind `/panel/`. A query string would
 * have put every message in a server log. That is the whole reason for the `#`.
 *
 * base64url rather than the text itself, so a message survives chat apps that
 * re-encode or truncate at spaces and punctuation, and so the link does not
 * show the answer to anyone glancing at it. It is an envelope, not a lock:
 * anyone with the link can read it, and the page says so.
 *
 * Everything here is total. A link is the most editable input a web app has,
 * and a mangled one should produce a clear message on the page, never an
 * exception and never anything rendered as markup.
 */

import { isEncodable, MORSE_ALPHABET } from '../data/morseAlphabet'
import { WPM_RANGE } from '../storage/settings'

/** Where the recipient lands. Matches the registry entry in config/pages.ts. */
export const MESSAGE_PATH = '/message/'

/**
 * Longest message, in characters, after normalisation.
 *
 * Long enough for a sentence ("MEET ME AT THE OLD STATION AT NINE"), short
 * enough that a beginner can decode it in one sitting and that the link stays
 * a link rather than a paragraph in a chat bubble.
 */
export const MESSAGE_MAX = 80

/**
 * Longest payload worth decoding at all.
 *
 * Every character Morse can carry is at most two UTF-8 bytes (the extended
 * letters such as Ä). Base64 turns 3 bytes into 4 characters. Anything longer
 * than this cannot be a valid message, so it is refused before any decoding
 * work — a megabyte of fragment costs one length check.
 */
export const PAYLOAD_MAX = Math.ceil((MESSAGE_MAX * 2 * 4) / 3)

/** The fragment keys. Short, because they end up in a chat bubble. */
const KEY_TEXT = 'm'
const KEY_WPM = 'wpm'

const BASE64URL = /^[A-Za-z0-9_-]+$/

/**
 * A bare payload, as typed or trimmed by hand: base64url, perhaps with the `=`
 * padding a standard encoder adds. Matched before the fragment is read as
 * `key=value` pairs, or `SGk=` would be read as a key with no value.
 */
const BARE_PAYLOAD = /^[A-Za-z0-9_-]+={0,2}$/

/** A fragment carrying the message key, as every link made here does. */
const KEYED = new RegExp(`(^|&)${KEY_TEXT}=`)

/** Base64 padding. Never needed to decode, and never produced here. */
const stripPadding = (payload: string): string => payload.replace(/=+$/, '')

export type MessageProblem =
  /** Nothing to send, or a link with no message in it. */
  | 'empty'
  /** Longer than `MESSAGE_MAX`. */
  | 'too-long'
  /** Contains characters Morse has no code for. */
  | 'unsupported'
  /** A fragment that is not a message link at all: broken, truncated, edited. */
  | 'malformed'

export interface MessageLink {
  /** The message, normalised: upper case, single spaces, no edge whitespace. */
  text: string
  /** Sending speed chosen by the sender, or null to use the reader's own. */
  wpm: number | null
}

export type CheckResult =
  | { ok: true; text: string; length: number }
  | {
      ok: false
      problem: Exclude<MessageProblem, 'malformed'>
      text: string
      length: number
      /** Distinct characters with no Morse code, in order of first appearance. */
      unsupported: string[]
    }

export type EncodeResult =
  { ok: true; text: string; hash: string; url: string } | Extract<CheckResult, { ok: false }>

export type DecodeResult =
  /** The fragment was empty: nothing was sent, show the composer. */
  | { ok: false; problem: 'none' }
  | { ok: false; problem: MessageProblem }
  | { ok: true; message: MessageLink }

/** Characters, not UTF-16 code units, so an emoji counts as one. */
function characters(text: string): string[] {
  return [...text]
}

/**
 * The form a message is sent and compared in.
 *
 * Morse has no lower case, so the text is upper-cased: what the recipient
 * reveals is exactly what was keyed, not a case the code never carried. NFC
 * first, so an "Ä" typed as A plus a combining mark becomes the one character
 * the alphabet knows. Runs of whitespace (including newlines) become a single
 * word gap, which is all Morse can express.
 */
export function normaliseMessage(text: string): string {
  return text.normalize('NFC').toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Distinct characters Morse cannot send, in order of first appearance. */
export function unsupportedCharacters(text: string): string[] {
  const seen = new Set<string>()
  for (const character of characters(normaliseMessage(text))) {
    if (!isEncodable(character)) seen.add(character)
  }
  return [...seen]
}

/** Drop everything Morse cannot send, then normalise what is left. */
export function stripUnsupported(text: string): string {
  return normaliseMessage(
    characters(normaliseMessage(text))
      .filter((character) => isEncodable(character))
      .join(''),
  )
}

/** Validate a message without building a link. Never throws. */
export function checkMessage(input: string): CheckResult {
  const text = normaliseMessage(typeof input === 'string' ? input : '')
  const length = characters(text).length
  const unsupported = unsupportedCharacters(text)

  if (length === 0) return { ok: false, problem: 'empty', text, length, unsupported }
  if (unsupported.length > 0)
    return { ok: false, problem: 'unsupported', text, length, unsupported }
  if (length > MESSAGE_MAX) return { ok: false, problem: 'too-long', text, length, unsupported }
  return { ok: true, text, length }
}

/** A speed from the link, or null for anything outside the range the UI offers. */
function readWpm(raw: string | null): number | null {
  if (raw === null || !/^\d{1,3}$/.test(raw)) return null
  const value = Number(raw)
  return value >= WPM_RANGE.min && value <= WPM_RANGE.max ? value : null
}

function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** Null on anything that is not valid base64url of valid UTF-8. */
function fromBase64Url(payload: string): string | null {
  if (!BASE64URL.test(payload) || payload.length % 4 === 1) return null
  try {
    const binary = atob(payload.replaceAll('-', '+').replaceAll('_', '/'))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    // `fatal` makes invalid UTF-8 an error instead of U+FFFD replacement
    // characters quietly appearing in somebody's message.
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

export interface EncodeOptions {
  /** Sending speed to suggest to the reader. Ignored outside `WPM_RANGE`. */
  wpm?: number | null
  /**
   * Origin to build the full URL on, e.g. `location.origin`. Defaults to none,
   * which gives a root-relative URL.
   */
  origin?: string
}

/** Build the fragment for an already valid, normalised message. */
function fragmentFor(text: string, wpm: number | null): string {
  const parts = [`${KEY_TEXT}=${toBase64Url(text)}`]
  if (wpm !== null) parts.push(`${KEY_WPM}=${wpm}`)
  return `#${parts.join('&')}`
}

/**
 * Turn a message into a link. Never throws: invalid input comes back as the
 * same result `checkMessage` gives, so the composer can show why.
 */
export function encodeMessageLink(text: string, options: EncodeOptions = {}): EncodeResult {
  const check = checkMessage(text)
  if (!check.ok) return check

  const wpm =
    typeof options.wpm === 'number' && Number.isInteger(options.wpm)
      ? readWpm(String(options.wpm))
      : null
  const hash = fragmentFor(check.text, wpm)
  return { ok: true, text: check.text, hash, url: `${options.origin ?? ''}${MESSAGE_PATH}${hash}` }
}

/**
 * Read a message out of a fragment (`location.hash`, with or without the `#`).
 *
 * Total. Accepts the canonical `m=<payload>[&wpm=N]` and, for links typed or
 * trimmed by hand, a bare payload, either with or without `=` padding. A
 * message that decodes but would not have been accepted by the composer (too
 * long, or holding characters Morse cannot send) is refused the same way, so a
 * hand-edited link cannot smuggle in anything the page would not have
 * produced itself.
 *
 * A bare fragment is only a message if it reads as one. Otherwise it is
 * `none`, not `malformed`: `#main` (the skip link), `#faq` or `#top` name a
 * place on the page, and reading them as a damaged message destroyed the
 * composer and its draft.
 */
const NOT_A_MESSAGE: DecodeResult = { ok: false, problem: 'none' }

export function decodeMessageLink(hash: unknown): DecodeResult {
  if (typeof hash !== 'string') return { ok: false, problem: 'none' }
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  if (fragment.trim() === '') return { ok: false, problem: 'none' }
  // Cheap refusal before any parsing: no valid message is anywhere near this.
  if (fragment.length > PAYLOAD_MAX + 32) return { ok: false, problem: 'malformed' }

  // `m=` first: `m=` alone also looks like one padded base64 character.
  const keyed = KEYED.test(fragment)
  if (!keyed && BARE_PAYLOAD.test(fragment)) {
    const decoded = fromBase64Url(stripPadding(fragment))
    const check = decoded === null ? null : checkMessage(decoded)
    return check?.ok ? { ok: true, message: { text: check.text, wpm: null } } : NOT_A_MESSAGE
  }

  // Neither a payload nor key=value pairs: an anchor such as `#how.it.works`.
  if (!fragment.includes('=')) return NOT_A_MESSAGE

  let params: URLSearchParams
  try {
    params = new URLSearchParams(fragment)
  } catch {
    return { ok: false, problem: 'malformed' }
  }
  const raw = params.get(KEY_TEXT)
  // Pairs that are not ours are not a message. A speed with no text is one of
  // ours with its message missing.
  if (raw === null) return params.has(KEY_WPM) ? { ok: false, problem: 'empty' } : NOT_A_MESSAGE
  const payload = stripPadding(raw)
  const wpm = readWpm(params.get(KEY_WPM))

  if (payload === '') return { ok: false, problem: 'empty' }
  if (payload.length > PAYLOAD_MAX) return { ok: false, problem: 'too-long' }

  const decoded = fromBase64Url(payload)
  if (decoded === null) return { ok: false, problem: 'malformed' }

  const check = checkMessage(decoded)
  if (!check.ok) return { ok: false, problem: check.problem }
  return { ok: true, message: { text: check.text, wpm } }
}

/** One character of a message, laid out the way the tape shows it. */
export interface MessageCell {
  /** Position in the normalised text. */
  index: number
  character: string
  /** The character's code, from MORSE_ALPHABET. Empty for a word gap. */
  code: string
  /** True for the gap between words. */
  space: boolean
}

/**
 * Split a normalised message into cells for the tape: one per character, with
 * word gaps kept as their own cells so the layout can show them.
 */
export function messageCells(text: string): MessageCell[] {
  return characters(normaliseMessage(text)).map((character, index) => ({
    index,
    character,
    code: character === ' ' ? '' : (MORSE_ALPHABET[character] ?? ''),
    space: character === ' ',
  }))
}

/**
 * Compare a guess with the message, position by position.
 *
 * Returns one boolean per cell of the message (word gaps count as right), and
 * how many of the letters were right. Normalised first, so case and spacing
 * never cost anything.
 */
export function gradeGuess(
  guess: string,
  text: string,
): { cells: boolean[]; correct: number; letters: number; exact: boolean } {
  const want = characters(normaliseMessage(text))
  const got = characters(normaliseMessage(guess))
  const cells = want.map((character, index) => character === ' ' || got[index] === character)
  const letters = want.filter((character) => character !== ' ').length
  const correct = want.filter(
    (character, index) => character !== ' ' && got[index] === character,
  ).length
  return { cells, correct, letters, exact: got.join('') === want.join('') }
}

/**
 * A character as it can safely be shown in a hint. Invisible and control
 * characters (a zero-width space, a direction override) are shown as their
 * code point, because quoting them literally would show nothing, or reorder
 * the sentence around them.
 */
export function visibleCharacter(character: string): string {
  if (/^[\p{C}\p{Z}\p{M}]+$/u.test(character)) {
    return `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`
  }
  return character
}

/** What to tell someone about a problem, in one sentence. */
export function describeProblem(
  problem: MessageProblem,
  detail: { unsupported?: readonly string[]; length?: number } = {},
): string {
  switch (problem) {
    case 'empty':
      return 'There is no message here yet.'
    case 'too-long':
      return detail.length === undefined
        ? `A message can be at most ${MESSAGE_MAX} characters.`
        : `That is ${detail.length} characters; a message can be at most ${MESSAGE_MAX}.`
    case 'unsupported': {
      const list = detail.unsupported ?? []
      return list.length === 0
        ? 'Some characters have no Morse code.'
        : `Morse has no code for ${list.map((character) => `“${visibleCharacter(character)}”`).join(', ')}.`
    }
    case 'malformed':
      return 'This link is damaged, so the message could not be read. It may have been cut short when it was copied.'
  }
}
