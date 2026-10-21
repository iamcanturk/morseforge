import { useCallback, useEffect, useRef, useState } from 'react'
import { clipboardText, shareData, type ShareMessage } from '../../game/share'
import type { CardData } from '../Share/resultCard'
import { ShareCard } from '../Share/ShareCard'
import { track } from '../../analytics/track'
import { useT } from '../../i18n/react'
import '../../styles/pkg-e.css'

/**
 * The one share sheet (flow audit B6): shown after a result, never before,
 * and dismissible.
 *
 * "Challenge a friend" opens the system share sheet with a title, the text,
 * and the link as its url, once (DEC-035). Where there is no share sheet
 * (most desktops) it copies the text with the link on the end, and says so. The image
 * card is a disclosure underneath, an extra for people who post pictures.
 */

export type ShareKind = 'challenge' | 'practice'

export interface ShareSheetProps {
  message: ShareMessage
  kind: ShareKind
  /** Present to offer the image card. */
  card?: CardData
  /** One line under the heading: what the link carries. */
  blurb: string
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Refused (no focus, no permission). Saying "copied" would be a lie; the
    // link is on screen to copy by hand.
    return false
  }
}

export function ShareSheet({ message, kind, card, blurb }: ShareSheetProps) {
  const t = useT()
  const [dismissed, setDismissed] = useState(false)
  const [status, setStatus] = useState('')
  const [canShare, setCanShare] = useState(false)
  const [cardOpen, setCardOpen] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  const say = useCallback((text: string) => {
    if (timer.current !== null) clearTimeout(timer.current)
    setStatus(text)
    timer.current = setTimeout(() => setStatus(''), 3200)
  }, [])

  const copy = useCallback(
    async (what: 'message' | 'link') => {
      const ok = await copyText(what === 'link' ? message.url : clipboardText(message))
      if (ok) {
        track('share_copy', what === 'link' ? 'link' : kind)
        say(what === 'link' ? t('share.linkCopied') : t('share.messageCopied'))
      } else {
        field.current?.select()
        say(t('share.copyBlocked'))
      }
    },
    [message, kind, say, t],
  )

  const challenge = useCallback(async () => {
    if (canShare) {
      track('share_open', kind)
      try {
        await navigator.share(shareData(message))
        return
      } catch (error) {
        // Closing the sheet is a choice, not a failure.
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copy('message')
  }, [canShare, kind, message, copy])

  if (dismissed) return null

  return (
    <section aria-labelledby="share-heading" className="mf-panel p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id="share-heading" className="mf-engraved flex items-center gap-2">
            <span className="mf-lamp" data-on="true" data-tone="amber" aria-hidden="true" />
            {t('share.sendIt')}
          </h3>
          <p className="mt-2 max-w-[52ch] text-sm text-muted">{blurb}</p>
        </div>
        <button
          type="button"
          className="mf-icon-btn -mt-2 -mr-2"
          aria-label={t('share.hide')}
          onClick={() => setDismissed(true)}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          className="mf-btn mf-btn-amber mf-btn-lg sm:flex-1"
          onClick={() => void challenge()}
        >
          {t('share.challengeFriend')}
        </button>
        <button
          type="button"
          className="mf-btn mf-btn-secondary mf-btn-lg"
          onClick={() => void copy('link')}
        >
          {t('share.copyLink')}
        </button>
      </div>

      <label className="mt-4 block">
        <span className="sr-only">{t('share.linkLabel')}</span>
        <input
          ref={field}
          readOnly
          value={message.url}
          onFocus={(event) => event.currentTarget.select()}
          className="mf-input pe-link"
        />
      </label>

      <p role="status" className={status ? 'mt-3 text-sm text-signal' : 'sr-only'}>
        {status}
      </p>

      {card && (
        <details
          className="pe-details mt-5 border-t border-line pt-4"
          onToggle={(event) => setCardOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-11 items-center justify-between gap-3">
            <span className="font-mono text-control text-ink uppercase">
              {t('share.imageCard')}
            </span>
            <span className="flex items-center gap-2 text-sm text-muted">
              {t('share.imageCardHint')}
              <svg
                className="pe-chevron"
                viewBox="0 0 12 12"
                width="12"
                height="12"
                aria-hidden="true"
              >
                <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </span>
          </summary>
          {/* Drawn only once opened: most people never look, and a canvas
              plus two font loads is work for nothing. */}
          {cardOpen && (
            <div className="mt-4">
              <ShareCard data={card} message={message} />
            </div>
          )}
        </details>
      )}
    </section>
  )
}
