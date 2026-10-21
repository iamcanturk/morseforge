import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dailySharePayload, dailyShareText } from '../../game/dailyShare'
import {
  dailyCardBlob,
  dailyCardModel,
  drawDailyCard,
  loadCardFonts,
  type DailyCardInput,
} from '../Share/dailyCard'
import { TAPE_INK_VARS } from '../Copy/tapeInk'
import { track } from '../../analytics/track'

/**
 * Send the day's result: Wordle-style text first, the image card second.
 *
 * Text first because it is what travels — it pastes into any chat, group or
 * post, shows the grid inline, and spoils nothing. Web Share where the browser
 * has it (one tap into whatever app the person uses), the clipboard
 * everywhere, and the text itself on screen so it can be copied by hand when
 * both refuse.
 *
 * Shown only after a result and easy to put away: a share prompt you cannot
 * dismiss is a nag.
 */
export function DailyShare({ input }: { input: DailyCardInput }) {
  const text = useMemo(() => dailyShareText(input), [input])
  const payload = useMemo(() => dailySharePayload(input), [input])
  const model = useMemo(() => dailyCardModel(input), [input])

  const canvas = useRef<HTMLCanvasElement>(null)
  const preview = useRef<HTMLPreElement>(null)
  const [hidden, setHidden] = useState(false)
  const [status, setStatus] = useState('')
  const [canShare, setCanShare] = useState(false)
  const [canShareFiles, setCanShareFiles] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Detected after mount: there is no `navigator` while the page prerenders,
  // and a button that appears on hydration beats one that promises a share
  // the browser cannot do.
  useEffect(() => {
    setCanShare(typeof navigator.share === 'function')
    try {
      const probe = new File([new Blob()], 'probe.png', { type: 'image/png' })
      setCanShareFiles(
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }),
      )
    } catch {
      setCanShareFiles(false)
    }
  }, [])

  useEffect(() => {
    if (hidden) return
    let live = true
    void loadCardFonts().then(() => {
      if (live && canvas.current) drawDailyCard(canvas.current, model)
    })
    return () => {
      live = false
    }
  }, [model, hidden])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const flash = useCallback((message: string) => {
    setStatus(message)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setStatus(''), 3200)
  }, [])

  const selectPreview = useCallback(() => {
    const node = preview.current
    const selection = typeof window === 'undefined' ? null : window.getSelection()
    if (!node || !selection) return
    const range = document.createRange()
    range.selectNodeContents(node)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      track('daily_share', 'copy')
      flash('Copied. Paste it anywhere.')
    } catch {
      // No clipboard (an insecure origin, or permission refused): select the
      // text so one more keystroke copies it.
      selectPreview()
      flash('Selected. Press Ctrl+C or ⌘C to copy it.')
    }
  }, [text, flash, selectPreview])

  const share = useCallback(async () => {
    try {
      await navigator.share(payload)
      track('daily_share', 'native')
    } catch (error) {
      // Dismissing the sheet is not a failure worth a message. Anything else
      // falls back to the clipboard, which always works or says why.
      if (error instanceof DOMException && error.name === 'AbortError') return
      await copy()
    }
  }, [payload, copy])

  const image = useCallback(async () => {
    if (!canvas.current) return
    const blob = await dailyCardBlob(canvas.current)
    if (!blob) return
    const name = `morseforge-daily-${input.date}.png`
    const file = new File([blob], name, { type: 'image/png' })

    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], text: payload.text, url: payload.url })
        track('daily_share', 'image')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
    track('daily_share', 'save')
    flash(`Saved ${name}`)
  }, [canShareFiles, input.date, payload, flash])

  if (hidden) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          className="mf-btn mf-btn-ghost mf-btn-sm"
          onClick={() => setHidden(false)}
        >
          Show share options
        </button>
      </div>
    )
  }

  return (
    <section className="mf-panel p-5 sm:p-6" aria-labelledby="daily-share-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="daily-share-heading" className="mf-engraved">
          Send it
        </h3>
        <button
          type="button"
          className="mf-btn mf-btn-ghost mf-btn-sm"
          onClick={() => setHidden(true)}
          aria-label="Hide the share options"
        >
          Hide
        </button>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div>
          <pre
            ref={preview}
            className="mf-tape mf-f-telegram"
            style={TAPE_INK_VARS}
            aria-label="The text that will be shared"
          >
            {text}
          </pre>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            No line of today&rsquo;s wire is in it, so it spoils nothing for anyone still to play.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {canShare && (
              <button type="button" className="mf-btn mf-btn-primary" onClick={() => void share()}>
                Share result
              </button>
            )}
            <button
              type="button"
              className={`mf-btn ${canShare ? 'mf-btn-secondary' : 'mf-btn-primary'}`}
              onClick={() => void copy()}
            >
              Copy result
            </button>
          </div>
        </div>

        <figure className="m-0">
          <canvas
            ref={canvas}
            width={1200}
            height={630}
            className="block h-auto w-full rounded-control border border-line-strong"
            role="img"
            aria-label={model.alt}
          />
          <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted">The same result as a card.</span>
            <button
              type="button"
              className="mf-btn mf-btn-secondary mf-btn-sm"
              onClick={() => void image()}
            >
              {canShareFiles ? 'Share image' : 'Save image'}
            </button>
          </figcaption>
        </figure>
      </div>

      {/* Mounted with or without a message: a live region that appears at the
          same moment as its text is often not announced. */}
      <p role="status" className={status ? 'mt-4 font-mono text-control text-signal' : 'sr-only'}>
        {status}
      </p>
    </section>
  )
}
