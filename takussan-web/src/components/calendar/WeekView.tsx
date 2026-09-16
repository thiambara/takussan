'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  eventTouchesDay,
  isSameDay,
  parseServerDate,
  WEEKDAY_SHORT_KEYS,
  weekDays,
} from '@/lib/calendar-date';
import { paletteFor } from './event-colors';
import { useDatesCalendrier } from './dates';
import type { CalendarEvent } from '@/types/calendar';

export interface WeekViewProps {
  focus: Date;
  events: readonly CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}

export function WeekView({ focus, events, onSelect }: WeekViewProps) {
  const t = useTranslations('calendar');
  const dates = useDatesCalendrier();
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
      aria-label={t('gridAria.week')}
      // Revue design 2026-09-16 — sept colonnes dans 328 px faisaient des puces de 47 px où
      // l'heure elle-même était coupée. Sous `lg`, la semaine DÉFILE dans son conteneur, à
      // 6,5 rem par jour ; au-dessus, elle tient.
      className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card"
    >
      <div className="grid min-w-[45.5rem] grid-cols-7 border-b border-border bg-muted/50 lg:min-w-0">
        {days.map((day, idx) => {
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              role="columnheader"
              className="px-3 py-2 text-center"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(`weekdaysShort.${WEEKDAY_SHORT_KEYS[idx]}`)}
              </div>
              <div
                className={cn(
                  'mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-semibold',
                  isToday ? 'bg-foreground px-1.5 text-background' : 'text-foreground',
                )}
              >
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid min-w-[45.5rem] grid-cols-7 lg:min-w-0">
        {days.map((day) => {
          const dayEvents = parsed
            .filter((p) => eventTouchesDay({ start: p.start, end: p.end }, day))
            .sort((a, b) => a.start.getTime() - b.start.getTime());
          return (
            <div
              key={day.toISOString()}
              role="gridcell"
              data-testid={`calendar-day-${day.toISOString().slice(0, 10)}`}
              className="min-h-48 border-t border-l border-border p-2"
            >
              <ul className="space-y-1.5">
                {dayEvents.map(({ event, start }) => {
                  const palette = paletteFor(event);
                  const timeLabel = event.all_day
                    ? t('allDay')
                    // TCK-292 — la locale ACTIVE, plus `fr-FR` en dur. Horloge du navigateur :
                    // cf. `./dates` (le fuseau de Dakar décalait l'heure hors du Sénégal).
                    : dates.heure(start);
                  return (
                    <li key={`${event.type}-${event.id}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(event)}
                        className={cn(
                          'w-full rounded-md border px-2 py-1 text-left text-xs transition-opacity hover:opacity-90',
                          palette.pill,
                        )}
                        data-testid={`calendar-event-pill-${event.type}-${event.id}`}
                      >
                        <div className="font-medium tabular-nums">{timeLabel}</div>
                        <div className="truncate">{event.title}</div>
                      </button>
                    </li>
                  );
                })}
                {dayEvents.length === 0 && (
                  <li className="text-xs text-muted-foreground">—</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
