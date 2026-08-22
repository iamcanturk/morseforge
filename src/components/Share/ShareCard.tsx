import { useCallback, useEffect, useRef, useState } from 'react'
import { type CardData, drawCard, toBlob } from './resultCard'
import { SITE } from '../../config/site'

/**
 * Renders the result card and offers the three ways to get it out.
 *
 * Web Share first, because on a phone that is one tap into whatever app the
 * person actually uses. Download second, for desktop. And the X intent last,
 * with the URL in the text — an image posted without a link is a poster for
 * nothing, and the link is the entire reason the card exists.
 */
export function ShareCard({ data }: { data: CardData }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [canShareFiles, setCanShareFiles] = useState(false)

  useEffect(() => {
    if (canvas.current) drawCard(canvas.current, data, SITE.url)
  }, [data])

  // Feature-detected on mount rather than during render: `navigator` does not
  // exist while this is prerendered, and a button that appears after hydration
  // is better than one that promises a share the browser cannot do.
  useEffect(() => {
    const probe = new File([new Blob()], 'probe.png', { type: 'image/png' })
    setCanShareFiles(
      typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [probe] }),
    )
  }, [])

  const flash = useCallback((message: string) => {
    setStatus(message)
    setTimeout(() => setStatus(null), 2400)
  }, [])

  const download = useCallback(async () => {
    if (!canvas.current) return
    const blob = await toBlob(canvas.current)
    if (!blob) return

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'morseforge-result.png'
    link.click()
    URL.revokeObjectURL(url)
    flash('Saved morseforge-result.png')
  }, [flash])

  const share = useCallback(async () => {
    if (!canvas.current) return
    const blob = await toBlob(canvas.current)
    if (!blob) return

    const file = new File([blob], 'morseforge-result.png', { type: 'image/png' })
    try {
      await navigator.share({
        files: [file],
        title: 'MorseForge',
        text: `${Math.round(data.accuracy * 100)}% accuracy on MorseForge. Can you beat it?`,
      })
    } catch {
      // The user dismissed the sheet, or the browser refused. Neither is worth
      // an error message — they can still download.
    }
  }, [data.accuracy])

  const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(
    data.challenge
      ? `I decoded ${data.correct} Morse signals in 60 seconds at ${Math.round(data.accuracy * 100)}% accuracy.\n\nCan you beat me?\n\n⚡ ${SITE.url}/challenge/`
      : `${data.correct} characters at ${Math.round(data.accuracy * 100)}% accuracy on MorseForge.\n\n⚡ ${SITE.url}`,
  )}`

  return (
    <div>
      <canvas
        ref={canvas}
        className="w-full rounded-xl border border-line"
        // The card is a picture of numbers already announced above it, so the
        // description says what it is rather than reading them out twice.
        role="img"
        aria-label="Your result as a shareable image"
      />

      <div className="mt-4 flex flex-wrap gap-3">
        {canShareFiles && (
          <button
            type="button"
            onClick={() => void share()}
            className="rounded-lg px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-void"
            style={{ background: 'var(--color-signal)' }}
          >
            SHARE
          </button>
        )}

        <button
          type="button"
          onClick={() => void download()}
          className="rounded-lg border border-line px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-signal hover:text-signal"
        >
          SAVE IMAGE
        </button>

        <a
          href={intent}
          target="_blank"
          rel="noopener"
          className="rounded-lg border border-line px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-cyan hover:text-cyan"
        >
          POST ON X
        </a>
      </div>

      {/* Mounted whether or not there is a message: a live region that appears
          at the same moment as its content is usually not announced. */}
      <p
        role="status"
        className={status ? 'mt-3 font-mono text-[11px] tracking-[0.12em] text-signal' : 'sr-only'}
      >
        {status ?? ''}
      </p>
    </div>
  )
}
