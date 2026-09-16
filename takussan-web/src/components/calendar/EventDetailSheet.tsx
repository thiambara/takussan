'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseServerDate } from '@/lib/calendar-date';
import { paletteFor, typeLabelKey } from './event-colors';
import { useDatesCalendrier } from './dates';
import type { CalendarEvent } from '@/types/calendar';

export interface EventDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Traducteur = ReturnType<typeof useTranslations>;

type DatesCalendrier = ReturnType<typeof useDatesCalendrier>;

function formatRange(event: CalendarEvent, t: Traducteur, dates: DatesCalendrier): string {
  const start = parseServerDate(event.start);
  const end = parseServerDate(event.end);
  if (!start) return '';
  if (event.all_day) {
    const dateFmt: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };
    if (end && end.getTime() !== start.getTime()) {
      return t('range.fromTo', {
        from: dates.date(start, dateFmt),
        to: dates.date(end, dateFmt),
      });
    }
    return dates.date(start, dateFmt);
  }
  const dateLabel = dates.date(start, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = dates.heure(start);
  return t('range.dateAtTime', { date: dateLabel, time: timeLabel });
}

export function EventDetailSheet({ event, open, onOpenChange }: EventDetailSheetProps) {
  const t = useTranslations('calendar');
  const tCommon = useTranslations('common');
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-scrim/30 data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          data-testid="calendar-event-detail"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col bg-card shadow-xl outline-none data-open:animate-in data-closed:animate-out data-open:slide-in-from-right data-closed:slide-out-to-right"
        >
          <DialogPrimitive.Title className="sr-only">
            {t('detail.title')}
          </DialogPrimitive.Title>
          {event ? <EventDetailBody event={event} /> : null}
          <DialogPrimitive.Close
            className="absolute top-3 right-3 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={tCommon('actions.close')}
          >
            <XIcon className="size-5" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function EventDetailBody({ event }: { event: CalendarEvent }) {
  const t = useTranslations('calendar');
  const dates = useDatesCalendrier();
  const palette = paletteFor(event);
  const openLabel =
    event.type === 'booking'
      ? t('detail.resource.booking')
      : event.type === 'lease'
        ? t('detail.resource.lease')
        : t('detail.resource.visit');

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-6 py-5">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
              palette.pill,
            )}
          >
            {t(typeLabelKey(event.type))}
          </span>
          <span className="text-xs text-muted-foreground">{t(palette.labelKey)}</span>
        </div>
        <h2 className="pr-10 font-display text-lg font-semibold tracking-tight text-balance text-foreground">{event.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase">{formatRange(event, t, dates)}</p>
      </header>

      <dl className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
        {event.reference && (
          <div>
            <dt className="text-xs font-semibold uppercase text-muted-foreground">{t('detail.reference')}</dt>
            <dd className="font-medium text-foreground">{event.reference}</dd>
          </div>
        )}
        {typeof event.duration_minutes === 'number' && event.duration_minutes > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase text-muted-foreground">{t('detail.duration')}</dt>
            <dd className="tabular-nums text-foreground">{event.duration_minutes} {t('detail.minutesUnit')}</dd>
          </div>
        )}
        {event.property_slug && (
          <div>
            <dt className="text-xs font-semibold uppercase text-muted-foreground">{t('detail.property')}</dt>
            <dd>
              <Link
                className="text-foreground underline underline-offset-2 hover:text-primary"
                href={`/properties/${event.property_slug}`}
              >
                {t('detail.viewProperty')}
              </Link>
            </dd>
          </div>
        )}
      </dl>

      <footer className="border-t border-border px-6 py-4">
        <Link
          href={event.resource_url}
          className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
          data-testid="calendar-event-open-resource"
        >
          {t('detail.open', { resource: openLabel })}
        </Link>
      </footer>
    </div>
  );
}
