'use client';

import Link from 'next/link';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { parseServerDate } from '@/lib/calendar-date';
import { paletteFor, typeLabel } from './event-colors';
import type { CalendarEvent } from '@/types/calendar';

export interface EventDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatRange(event: CalendarEvent): string {
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
      return `Du ${start.toLocaleDateString('fr-FR', dateFmt)} au ${end.toLocaleDateString(
        'fr-FR',
        dateFmt,
      )}`;
    }
    return start.toLocaleDateString('fr-FR', dateFmt);
  }
  const dateLabel = start.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = start.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${dateLabel} à ${timeLabel}`;
}

export function EventDetailSheet({ event, open, onOpenChange }: EventDetailSheetProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/30 data-open:animate-in data-closed:animate-out data-open:fade-in-0 data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          data-testid="calendar-event-detail"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-xl outline-none data-open:animate-in data-closed:animate-out data-open:slide-in-from-right data-closed:slide-out-to-right"
        >
          <DialogPrimitive.Title className="sr-only">
            Détail de l&apos;événement
          </DialogPrimitive.Title>
          {event ? <EventDetailBody event={event} /> : null}
          <DialogPrimitive.Close
            className="absolute top-3 right-3 rounded-md p-1 text-stone-500 hover:bg-stone-100"
            aria-label="Fermer"
          >
            <XIcon className="size-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function EventDetailBody({ event }: { event: CalendarEvent }) {
  const palette = paletteFor(event);
  const openLabel =
    event.type === 'booking'
      ? 'la réservation'
      : event.type === 'lease'
        ? 'le bail'
        : 'la visite';

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-stone-200 px-6 py-5">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
              palette.pill,
            )}
          >
            {typeLabel(event.type)}
          </span>
          <span className="text-xs text-stone-500">{palette.label}</span>
        </div>
        <h2 className="text-lg font-semibold text-stone-900">{event.title}</h2>
        <p className="mt-1 text-sm text-stone-600 capitalize">{formatRange(event)}</p>
      </header>

      <dl className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
        {event.reference && (
          <div>
            <dt className="text-xs font-semibold uppercase text-stone-500">Référence</dt>
            <dd className="font-medium text-stone-900">{event.reference}</dd>
          </div>
        )}
        {typeof event.duration_minutes === 'number' && event.duration_minutes > 0 && (
          <div>
            <dt className="text-xs font-semibold uppercase text-stone-500">Durée</dt>
            <dd className="text-stone-900">{event.duration_minutes} min</dd>
          </div>
        )}
        {event.property_slug && (
          <div>
            <dt className="text-xs font-semibold uppercase text-stone-500">Bien</dt>
            <dd>
              <Link
                className="text-app-topbar hover:underline"
                href={`/properties/${event.property_slug}`}
              >
                Voir la fiche du bien
              </Link>
            </dd>
          </div>
        )}
      </dl>

      <footer className="border-t border-stone-200 px-6 py-4">
        <Link
          href={event.resource_url}
          className="inline-flex w-full items-center justify-center rounded-lg bg-app-topbar px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          data-testid="calendar-event-open-resource"
        >
          Ouvrir {openLabel}
        </Link>
      </footer>
    </div>
  );
}
