'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * TCK-251 — A single welcome slide.
 *
 * `illustration` is a free-form node — consumers may pass an SVG, an
 * `<Image>`, an emoji, or nothing at all. Keep it under 240px tall to
 * fit the mobile fullscreen layout comfortably.
 */
export type WelcomeSlide = {
  illustration?: ReactNode;
  title: string;
  body: string;
};

export type WelcomeModalProps = {
  /** Whether the modale is currently displayed. */
  open: boolean;
  /** Slides to render in order. The component is built around 1–3 slides. */
  slides: WelcomeSlide[];
  /** Called when the user finishes the last slide via the primary CTA. */
  onComplete: () => void;
  /**
   * Called when the user dismisses without completing — via the "Passer"
   * link, the close button, an Escape press, or a backdrop click.
   * Per TCK-251 AC1/AC2, dismissal is treated as "seen" by the consumer.
   */
  onSkip: () => void;
};

/**
 * TCK-251 — Reusable, role-agnostic welcome modale.
 *
 * Mobile: fullscreen sheet. Desktop: centered card over a dimmed backdrop
 * (the project's `<Dialog>` primitive already handles overlay + Esc /
 * outside-click via Base UI). Slide content is owned by the parent — this
 * component knows nothing about which role / parcours it's serving.
 *
 * The component intentionally has no network calls — the persistence
 * contract (`/api/me/welcome-seen`) is handled by `useWelcomeOnce`.
 */
export function WelcomeModal({ open, slides, onComplete, onSkip }: WelcomeModalProps) {
  const t = useTranslations('welcome');
  const [index, setIndex] = useState(0);
  // Reset slide index when the modale transitions from closed → open.
  // We use the React "store-and-compare-during-render" idiom rather than
  // an effect: the latter triggers cascading renders on every open change.
  // See https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setIndex(0);
  }

  const total = slides.length;
  const isLast = index >= total - 1;
  const current = slides[index];

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete();
    } else {
      setIndex((i) => Math.min(i + 1, total - 1));
    }
  }, [isLast, onComplete, total]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Base UI fires `onOpenChange(false)` on Esc, backdrop click, or
      // close-button activation — TCK-251 AC2 treats all three as a skip.
      if (!next) onSkip();
    },
    [onSkip],
  );

  // Defensive: if the parent passes `open` but no slides, render nothing
  // rather than a blank shell.
  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-label={t('dialogAriaLabel')}
        className={cn(
          // Mobile fullscreen ↔ desktop centered card. Override the
          // primitive's default max-width on small screens.
          'max-w-[100vw] sm:max-w-md',
          'h-[100dvh] sm:h-auto sm:max-h-[min(80vh,32rem)]',
          'rounded-none sm:rounded-xl',
          'flex flex-col gap-4',
        )}
      >
        {current.illustration ? (
          <div
            data-testid="welcome-illustration"
            className="flex items-center justify-center pt-4 sm:pt-2"
          >
            {current.illustration}
          </div>
        ) : null}

        <DialogHeader>
          <DialogTitle className="text-lg">{current.title}</DialogTitle>
          <DialogDescription>{current.body}</DialogDescription>
        </DialogHeader>

        <div className="flex-1" />

        <div
          role="tablist"
          aria-label={t('stepAriaLabel', { current: index + 1, total })}
          className="flex items-center justify-center gap-1.5 py-2"
        >
          {slides.map((_, i) => (
            <span
              key={i}
              data-testid="welcome-dot"
              data-active={i === index || undefined}
              aria-current={i === index ? 'step' : undefined}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-6 bg-foreground' : 'w-1.5 bg-foreground/25',
              )}
            />
          ))}
        </div>

        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="link"
            onClick={onSkip}
            data-testid="welcome-skip"
            className="text-muted-foreground"
          >
            {t('skip')}
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            data-testid="welcome-next"
          >
            {isLast ? t('finish') : t('next')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
