import { useCallback, useId, useMemo, useRef, useState } from 'react'
import '../../styles/pkg-i.css'
import { MorsePlayer } from '../MorsePlayer/MorsePlayer'
import { track } from '../../analytics/track'
import { encode, encodeDetailed } from '../../engine/morseEncoder'
import { decodeDetailed } from '../../engine/morseDecoder'

/**
 * Two-way translator (PROJECT.md §11), drawn as an instrument: a telegram
 * form to type on, a CRT that shows the code, and the player's lamp and
 * controls on the deck below.
 *
 * Edits flow one way at a time, tracked by `source`. Round-tripping every
 * keystroke through both directions would fight the user: typing a lone "."
 * would immediately rewrite itself to "E", and typing a space in the text box
 * would collapse.
 *
 * It starts on SOS in both the server render and the client, so the lamp and
 * the player are on screen at first paint and a crawler sees a worked example.
 * Every code here comes from the encoder; none is typed.
 */

type Source = 'text' | 'morse'

const INITIAL_TEXT = 'SOS'

const EXAMPLES = ['SOS', 'HELLO WORLD', 'CQ CQ CQ', 'I LOVE YOU', '73'] as const

export function Translator() {
  const [text, setText] = useState(INITIAL_TEXT)
  const [morse, setMorse] = useState(() => encode(INITIAL_TEXT))
  const [source, setSource] = useState<Source>('text')
  const [copied, setCopied] = useState<Source | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()

  const encoded = useMemo(() => encodeDetailed(text), [text])
  const decoded = useMemo(() => decodeDetailed(morse), [morse])

  const onTextChange = useCallback((value: string) => {
    setSource('text')
    setText(value)
    setMorse(encodeDetailed(value).morse)
  }, [])

  const onMorseChange = useCallback((value: string) => {
    setSource('morse')
    setMorse(value)
    setText(decodeDetailed(value).text)
  }, [])

  const copy = useCallback(async (which: Source, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(which)
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(null), 1500)
    } catch {
      // Clipboard permission denied, or an insecure context. The text is
      // selectable either way, so there is nothing useful to say about it.
    }
  }, [])

  // Only warn about what the user is actually typing. Showing "these characters
  // could not be decoded" while they type the *text* side is noise.
  const unsupported = source === 'text' ? encoded.unsupported : decoded.unknown
  const textId = `${id}-text`
  const morseId = `${id}-morse`
  const hintId = `${id}-hint`

  return (
    <div className="mf-instrument p-3 sm:p-6">
      <div className="grid gap-5 md:grid-cols-2 md:gap-6">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <label htmlFor={textId} className="mf-engraved">
              Text
            </label>
            <CopyButton
              done={copied === 'text'}
              label="Copy the text"
              onCopy={() => void copy('text', text)}
            />
          </div>
          <div className="pi-form mf-focus-within">
            <textarea
              id={textId}
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              rows={5}
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="Type anything…"
              className="pi-field"
            />
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <label htmlFor={morseId} className="mf-engraved">
              Morse
            </label>
            <CopyButton
              done={copied === 'morse'}
              label="Copy the Morse code"
              onCopy={() => void copy('morse', morse)}
            />
          </div>
          <div className="mf-screen mf-focus-within">
            <textarea
              id={morseId}
              value={morse}
              onChange={(event) => onMorseChange(event.target.value)}
              rows={5}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              placeholder={encode(INITIAL_TEXT)}
              aria-describedby={hintId}
              className="pi-field"
            />
          </div>
          <p id={hintId} className="mt-3 px-1 text-sm text-muted">
            Dots and dashes, a space between letters, <code className="font-mono text-ink">/</code>{' '}
            between words.
          </p>
        </div>
      </div>

      <div aria-live="polite">
        {unsupported.length > 0 && (
          <p className="mt-5 flex items-center gap-3 rounded-control border border-line-strong bg-void px-4 py-3 text-sm text-amber">
            <span className="mf-lamp" data-tone="amber" data-on="true" aria-hidden="true" />
            {source === 'text'
              ? `Morse has no code for: ${[...new Set(unsupported)].join(' ')}`
              : `Not a valid character: ${[...new Set(unsupported)].join(' ')}`}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 px-1">
        <span className="mf-engraved mr-1">Try</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onTextChange(example)}
            className="mf-chip-link"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {morse.trim() ? (
          <MorsePlayer
            morse={morse}
            label="Playback"
            layout="deck"
            initialFlash
            onPlay={() => track('translator_play')}
          />
        ) : (
          <p className="mf-panel px-5 py-4 text-sm text-muted">
            Type something above and it plays here, as sound and as a signal lamp.
          </p>
        )}
      </div>
    </div>
  )
}

function CopyButton({ done, label, onCopy }: { done: boolean; label: string; onCopy: () => void }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={done ? 'Copied' : label}
      className="mf-btn mf-btn-ghost mf-btn-sm"
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}
