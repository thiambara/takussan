'use client';

import React, { useCallback, useState } from 'react';
import { Share2, Check, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Lightweight share trigger — Wave 3 / TCK-047.
 *
 * - Mobile / supported browsers → `navigator.share()` (Web Share API).
 * - Fallback → copy the URL to the clipboard, flash a confirmation pill.
 *
 * Keeps it simple: no modal, no social-specific buttons. The richer
 * `PropertyShareDialog` (already in the detail page) remains for the
 * multi-channel flow.
 */
export interface ShareButtonProps {
  readonly url: string;
  readonly title: string;
  readonly text?: string;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
  readonly label?: string;
}

export function ShareButton({
  url,
  title,
  text,
  className = '',
  size = 'md',
  label,
}: ShareButtonProps) {
  const t = useTranslations('share');
  // `label` était par défaut « Partager » dans la signature — un libellé par défaut est du texte
  // affiché comme un autre, et une valeur par défaut ne peut pas appeler un hook.
  const libelle = label ?? t('share');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleShare = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        try {
          await navigator.share({ title, text, url });
          return;
        } catch (err) {
          // User aborted or share failed — fall through to clipboard.
          if (err instanceof Error && err.name === 'AbortError') return;
        }
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, title, text, url]);

  const sizeClasses =
    size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2';

  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      aria-label={libelle}
      className={`inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white ${sizeClasses} font-semibold text-stone-700 shadow-sm hover:bg-stone-50 transition ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{t('linkCopied')}</span>
        </>
      ) : (
        <>
          {busy ? (
            <Copy className="w-4 h-4" />
          ) : (
            <Share2 className="w-4 h-4" />
          )}
          <span>{libelle}</span>
        </>
      )}
    </button>
  );
}
