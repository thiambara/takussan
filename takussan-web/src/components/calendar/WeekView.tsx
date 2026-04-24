'use client';

import { cn } from '@/lib/utils';
import {
  eventTouchesDay,
  isSameDay,
  parseServerDate,
  WEEKDAY_SHORT_FR,
  weekDays,
} from '@/lib/calendar-date';
import { paletteFor } from './event-colors';
import type { CalendarEvent } from '@/types/calendar';

export interface WeekViewProps {
  focus: Date;
  events: readonly CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}

export function WeekView({ focus, events, onSelect }: WeekViewProps) {
  const days = weekDays(focus);
  const today = new Date();

  const parsed = events.map((e) => ({
    event: e,
    start: parseServerDate(e.start) ?? new Date(NaN),
    end: parseServerDate(e.end),
  }));

  return (
    <div
      role="grid"
      aria-label="Vue semaine"
      className="overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      <div className="grid grid-cols-7 border-b border-stone-200 bg-stone-50">
        {days.map((day, idx) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              role="columnheader"
              className="px-3 py-2 text-center"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                {WEEKDAY_SHORT_FR[idx]}
              </div>
              <div
                className={cn(
                  'mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-semibold',
                  isToday ? 'bg-app-topbar text-white px-1.5' : 'text-stone-900',
                )}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = parsed
            .filter((p) => eventTouchesDay({ start: p.start, end: p.end }, day))
            .sort((a, b) => a.start.getTime() - b.start.getTime());
          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              data-testid={`calendar-day-${day.toISOString().slice(0, 10)}`}
              className="min-h-48 border-t border-l border-stone-100 p-2"
            >
              <ul className="space-y-1.5">
                {dayEvents.map(({ event, start }) => {
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
                        className={cn(
                          'w-full rounded border px-2 py-1 text-left text-xs transition-colors hover:opacity-90',
                          palette.pill,
                        )}
                        data-testid={`calendar-event-pill-${event.type}-${event.id}`}
                      >
                        <div className="font-medium">{timeLabel}</div>
                        <div className="truncate">{event.title}</div>
                      </button>
                    </li>
                  );
                })}
                {dayEvents.length === 0 && (
                  <li className="text-xs text-stone-400">—</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
