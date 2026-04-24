'use client';

import { cn } from '@/lib/utils';
import {
  eventTouchesDay,
  isSameDay,
  monthGrid,
  parseServerDate,
  startOfMonth,
  WEEKDAY_SHORT_FR,
} from '@/lib/calendar-date';
import { paletteFor } from './event-colors';
import type { CalendarEvent } from '@/types/calendar';

export interface MonthViewProps {
  focus: Date;
  events: readonly CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
  /**
   * Densité maximale d'events affichés par jour avant de regrouper en
   * "+N autres". AC4 du ticket : max 3 + compteur.
   */
  maxPerDay?: number;
}

type ParsedEvent = CalendarEvent & {
  _start: Date;
  _end: Date | null;
};

export function MonthView({ focus, events, onSelect, maxPerDay = 3 }: MonthViewProps) {
  const days = monthGrid(focus);
  const monthStart = startOfMonth(focus);
  const today = new Date();

  // Parse once — les comparaisons <= / >= avec des Date sont stables.
  const parsed: ParsedEvent[] = events.map((e) => ({
    ...e,
    _start: parseServerDate(e.start) ?? new Date(NaN),
    _end: parseServerDate(e.end),
  }));

  return (
    <div
      role="grid"
      aria-label="Vue mois"
      className="grid grid-cols-7 overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      {WEEKDAY_SHORT_FR.map((label) => (
        <div
          key={label}
          role="columnheader"
          className="bg-stone-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-stone-500"
        >
          {label}
        </div>
      ))}

      {days.map((day) => {
        const inMonth = day.getMonth() === monthStart.getMonth();
        const dayEvents = parsed.filter((e) => eventTouchesDay({ start: e._start, end: e._end }, day));
        const visible = dayEvents.slice(0, maxPerDay);
        const overflow = dayEvents.length - visible.length;
        const todayBadge = isSameDay(day, today);

        return (
          <div
            key={day.toISOString()}
            role="gridcell"
            data-testid={`calendar-day-${day.toISOString().slice(0, 10)}`}
            data-in-month={inMonth ? 'true' : 'false'}
            className={cn(
              'min-h-24 border-t border-l border-stone-100 p-1.5 text-left align-top',
              !inMonth && 'bg-stone-50/60 text-stone-400',
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className={cn(
                  'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium',
                  todayBadge
                    ? 'bg-app-topbar text-white'
                    : inMonth
                      ? 'text-stone-700'
                      : 'text-stone-400',
                )}
              >
                {day.getDate()}
              </span>
            </div>

            <ul className="space-y-1">
              {visible.map((event) => {
                const palette = paletteFor(event);
                return (
                  <li key={`${event.type}-${event.id}`}>
                    <button
                      type="button"
                      onClick={() => onSelect(event)}
                      className={cn(
                        'w-full truncate rounded border px-1.5 py-0.5 text-left text-xs leading-tight transition-colors hover:opacity-90',
                        palette.pill,
                      )}
                      data-testid={`calendar-event-pill-${event.type}-${event.id}`}
                      aria-label={`${event.type === 'booking' ? 'Réservation' : 'Visite'} ${event.title}`}
                    >
                      <span className="truncate">{event.title}</span>
                    </button>
                  </li>
                );
              })}
              {overflow > 0 && (
                <li className="text-xs text-stone-500">+{overflow} autre{overflow > 1 ? 's' : ''}</li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
