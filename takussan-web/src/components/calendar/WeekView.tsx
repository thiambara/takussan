'use client';

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  eventTouchesDay,
  isSameDay,
  parseServerDate,
  WEEKDAY_SHORT_KEYS,
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
  const t = useTranslations('calendar');
  const locale = useLocale() as Locale;
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
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="grid grid-cols-7 border-b border-border bg-muted/50">
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
                  isToday ? 'bg-foreground text-primary-foreground px-1.5' : 'text-foreground',
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
              className="min-h-48 border-t border-l border-border p-2"
            >
              <ul className="space-y-1.5">
                {dayEvents.map(({ event, start }) => {
                  const palette = paletteFor(event);
                  const timeLabel = event.all_day
                    ? t('allDay')
                    // TCK-292 — la locale ACTIVE, plus `fr-FR` en dur.
                    : formatDate(start, locale, {
                        dateStyle: undefined,
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
