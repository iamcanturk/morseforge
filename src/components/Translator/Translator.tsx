import { useCallback, useMemo, useState } from 'react'
import { MorsePlayer } from '../MorsePlayer/MorsePlayer'
import { track } from '../../analytics/track'
import { encodeDetailed } from '../../engine/morseEncoder'
import { decodeDetailed } from '../../engine/morseDecoder'

/**
 * Two-way translator (PROJECT.md §11).
 *
 * Edits flow one way at a time, tracked by `source`. Round-tripping every
 * keystroke through both directions would fight the user: typing a lone "."
 * would immediately rewrite itself to "E", and typing a space in the text box
 * would collapse.
 */

type Source = 'text' | 'morse'

const EXAMPLES = ['SOS', 'HELLO WORLD', 'CQ CQ CQ', 'I LOVE YOU', '73'] as const

export function Translator() {
  const [text, setText] = useState('SOS')
  const [morse, setMorse] = useState('... --- ...')
  const [source, setSource] = useState<Source>('text')
  const [copied, setCopied] = useState<Source | null>(null)

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
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // Clipboard permission denied, or an insecure context. The text is
      // selectable either way, so there is nothing useful to say about it.
    }
  }, [])

  // Only warn about what the user is actually typing. Showing "these characters
  // could not be decoded" while they type the *text* side is noise.
  const unsupported = source === 'text' ? encoded.unsupported : decoded.unknown

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <label
              htmlFor="translator-text"
              className="font-mono text-[10px] tracking-[0.18em] text-muted"
            >
              TEXT
            </label>
            <button
              type="button"
              onClick={() => void copy('text', text)}
              className="font-mono text-[10px] tracking-[0.14em] text-muted hover:text-signal"
            >
              {copied === 'text' ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <textarea
            id="translator-text"
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="Type anything…"
            className="mt-2 w-full resize-y bg-transparent font-display text-lg outline-none placeholder:text-muted/50"
          />
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <label
              htmlFor="translator-morse"
              className="font-mono text-[10px] tracking-[0.18em] text-muted"
            >
              MORSE
            </label>
            <button
              type="button"
              onClick={() => void copy('morse', morse)}
              className="font-mono text-[10px] tracking-[0.14em] text-muted hover:text-signal"
            >
              {copied === 'morse' ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <textarea
            id="translator-morse"
            value={morse}
            onChange={(event) => onMorseChange(event.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="... --- ..."
            className="mt-2 w-full resize-y bg-transparent font-mono text-lg text-cyan outline-none placeholder:text-muted/50"
          />
          <p className="mt-1 text-[11px] text-muted">
            Dots and dashes, spaces between letters, <code className="text-cyan">/</code> between
            words.
          </p>
        </div>
      </div>

      {unsupported.length > 0 && (
        <p className="rounded-lg border border-amber/40 bg-panel px-4 py-3 text-xs text-amber">
          {source === 'text'
            ? `Morse has no code for: ${[...new Set(unsupported)].join(' ')}`
            : `Not a valid character: ${[...new Set(unsupported)].join(' ')}`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted">TRY</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onTextChange(example)}
            className="rounded-lg border border-line px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-signal hover:text-signal"
          >
            {example}
          </button>
        ))}
      </div>

      {morse.trim() && (
        <MorsePlayer morse={morse} label="PLAYBACK" onPlay={() => track('translator_play')} />
      )}
    </div>
  )
}
