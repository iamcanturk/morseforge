import { useCallback, useEffect, useRef, useState } from 'react'
import { type CardData, cardDescription, drawCard, ensureCardFonts, toBlob } from './resultCard'
import { SITE } from '../../config/site'
import { shareData, type ShareMessage } from '../../game/share'
import { track } from '../../analytics/track'
import { useT } from '../../i18n/react'

/** The file a saved card downloads as. A name, not copy: it stays the same in every language. */
const CARD_FILE = 'morseforge-result.png'

/**
 * The result card as an image, and the two ways to get it out.
 *
 * An optional extra beside the share text, never instead of it (flow audit
 * B6). Many share targets drop the text when a file is attached, so the card
 * prints its own URL, and the link goes with the image as the share's url
 * for the targets that keep it (once, not also inside the text: DEC-035).
 */
export function ShareCard({ data, message }: { data: CardData; message: ShareMessage }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [canShareFiles, setCanShareFiles] = useState(false)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The card as a PNG, built as soon as it is drawn. */
  const image = useRef<File | null>(null)

  useEffect(() => {
    let live = true
    image.current = null
    // The brand faces first, briefly; a card drawn before they load comes out
    // in the system font.
    void ensureCardFonts().then(async () => {
      if (!live || !canvas.current) return
      drawCard(canvas.current, data, SITE.url)
      // Encoded now, not on click: a share must start inside the tap's user
      // activation, and awaiting the PNG first can outlast it (iOS Safari),
      // which makes the share fail with NotAllowedError.
      const blob = await toBlob(canvas.current)
      if (live && blob) {
        image.current = new File([blob], 'morseforge-result.png', { type: 'image/png' })
      }
    })
    return () => {
      live = false
    }
  }, [data])

  // Feature-detected after mount: `navigator` does not exist while this is
  // prerendered, and a button that appears after hydration is better than one
  // that promises a share the browser cannot do.
  useEffect(() => {
    try {
      const probe = new File([new Blob()], 'probe.png', { type: 'image/png' })
      setCanShareFiles(
        typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }),
      )
    } catch {
      setCanShareFiles(false)
    }
  }, [])

  useEffect(
    () => () => {
      if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    },
    [],
  )

  const t = useT()
  const flash = useCallback((text: string) => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current)
    setStatus(text)
    flashTimer.current = setTimeout(() => setStatus(null), 2400)
  }, [])

  const download = useCallback(async () => {
    if (!canvas.current) return
    const blob = image.current ?? (await toBlob(canvas.current))
    if (!blob) {
      flash(t('share.imageFailed'))
      return
    }
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = CARD_FILE
    link.click()
    // Revoked later: some browsers start the download after the handler
    // returns, and a revoked URL downloads nothing.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    flash(t('share.imageSaved', { file: CARD_FILE }))
  }, [flash, t])

  const share = useCallback(async () => {
    // Nothing awaited before the share itself: see the draw effect.
    const file = image.current
    if (!file) {
      flash(t('share.imageNotReady'))
      return
    }
    track('share_open', 'card')
    try {
      await navigator.share(shareData(message, [file]))
    } catch (error) {
      // Dismissed: the person's choice, nothing to say.
      if (error instanceof DOMException && error.name === 'AbortError') return
      // Refused: say so, rather than a button that silently does nothing.
      flash(t('share.imageRefused'))
    }
  }, [message, flash, t])

  return (
    <div>
      <canvas
        ref={canvas}
        width={1200}
        height={630}
        className="block aspect-[1200/630] w-full rounded-control border border-line-strong"
        role="img"
        aria-label={cardDescription(data)}
      />
      <div className="mt-4 flex flex-wrap gap-3">
        {canShareFiles && (
          <button type="button" onClick={() => void share()} className="mf-btn mf-btn-secondary">
            {t('share.shareImage')}
          </button>
        )}
        <button type="button" onClick={() => void download()} className="mf-btn mf-btn-secondary">
          {t('share.saveImage')}
        </button>
      </div>
      {/* Mounted whether or not there is a message: a live region that appears
          at the same moment as its content is usually not announced. */}
      <p role="status" className={status ? 'mt-3 text-sm text-signal' : 'sr-only'}>
        {status ?? ''}
      </p>
    </div>
  )
}
