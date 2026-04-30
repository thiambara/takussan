'use client';

import { cn } from '@/lib/utils';
import { eventTouchesDay, parseServerDate } from '@/lib/calendar-date';
import { paletteFor, typeLabel } from './event-colors';
import type { CalendarEvent } from '@/types/calendar';

export interface DayViewProps {
  focus: Date;
  events: readonly CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}

export function DayView({ focus, events, onSelect }: DayViewProps) {
  const parsed = events
    .map((e) => ({
      event: e,
      start: parseServerDate(e.start) ?? new Date(NaN),
      end: parseServerDate(e.end),
    }))
    .filter((p) => eventTouchesDay({ start: p.start, end: p.end }, focus))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const dayLabel = focus.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm font-semibold capitalize text-stone-900">
        {dayLabel}
      </div>
      {parsed.length === 0 ? (
        <p className="p-8 text-center text-sm text-stone-500">
          Aucun événement sur cette journée.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {parsed.map(({ event, start }) => {
            const palette = paletteFor(event);
            const timeLabel = event.all_day
              ? 'Journée'
              : start.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
            return (
              <li key={`${event.type}-${event.id}`}>
                <button
                  type="button"
                  onClick={() => onSelect(event)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-stone-50"
                  data-testid={`calendar-event-row-${event.type}-${event.id}`}
                >
                  <span
                    className={cn('h-10 w-1.5 shrink-0 rounded-full', palette.accent)}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase text-stone-500">
                        {typeLabel(event.type)}
                      </span>
                      <span className="text-xs font-medium text-stone-600">{timeLabel}</span>
                    </div>
                    <div className="truncate text-sm font-medium text-stone-900">{event.title}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
