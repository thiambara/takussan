'use client';

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  eventTouchesDay,
  isSameDay,
  monthGrid,
  parseServerDate,
  startOfMonth,
  WEEKDAY_SHORT_KEYS,
} from '@/lib/calendar-date';
import { paletteFor } from './event-colors';
import type { CalendarEvent } from '@/types/calendar';

export interface MonthViewProps {
  focus: Date;
  events: readonly CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
  selectedDay?: Date;
  onDaySelect?: (day: Date) => void;
  /**
   * Densité maximale d'events affichés par jour avant de regrouper en
   * "+N autres". TCK-190 réduit le bruit visuel en vue portefeuille.
   */
  maxPerDay?: number;
}

type ParsedEvent = CalendarEvent & {
  _start: Date;
  _end: Date | null;
};

export function MonthView({
  focus,
  events,
  onSelect,
  selectedDay,
  onDaySelect,
  maxPerDay = 2,
}: MonthViewProps) {
  const t = useTranslations('calendar');
  const locale = useLocale() as Locale;
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
      aria-label={t('gridAria.month')}
      className="grid grid-cols-7 overflow-hidden rounded-xl border border-stone-200 bg-white"
    >
      {WEEKDAY_SHORT_KEYS.map((key) => (
        <div
          key={key}
          role="columnheader"
          className="bg-stone-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-stone-500"
        >
          {t(`weekdaysShort.${key}`)}
        </div>
      ))}

      {days.map((day) => {
        const inMonth = day.getMonth() === monthStart.getMonth();
        const dayEvents = parsed.filter((e) => eventTouchesDay({ start: e._start, end: e._end }, day));
        const visible = dayEvents.slice(0, maxPerDay);
        const overflow = dayEvents.length - visible.length;
        const todayBadge = isSameDay(day, today);
        const selected = selectedDay ? isSameDay(day, selectedDay) : false;

        return (
          <div
            key={day.toISOString()}
            role="gridcell"
            data-testid={`calendar-day-${day.toISOString().slice(0, 10)}`}
            data-in-month={inMonth ? 'true' : 'false'}
            className={cn(
              'min-h-24 border-t border-l border-stone-100 p-1.5 text-left align-top',
              !inMonth && 'bg-stone-50/60 text-stone-400',
              selected && 'bg-amber-50/70 ring-1 ring-inset ring-amber-300',
            )}
          >
            <div className="mb-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onDaySelect?.(day)}
                className={cn(
                  'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium transition-colors hover:bg-stone-100',
                  todayBadge
                    ? 'bg-foreground text-white'
                    : inMonth
                      ? 'text-stone-700'
                      : 'text-stone-400',
                  selected && !todayBadge && 'bg-amber-200 text-amber-950 hover:bg-amber-200',
                )}
                aria-label={t('dayDetailAria', {
                  // TCK-292 — la locale ACTIVE, plus `fr-FR` en dur : le lecteur
                  // d'écran d'un anglophone annonçait la date en français.
                  date: formatDate(day, locale, {
                    dateStyle: undefined,
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  }),
                })}
              >
                {day.getDate()}
              </button>
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
                      aria-label={t('eventPillAria', {
                        type: event.type === 'booking' ? t('eventType.booking') : t('eventType.visit'),
                        title: event.title,
                      })}
                    >
                      <span className="truncate">{event.title}</span>
                    </button>
                  </li>
                );
              })}
              {overflow > 0 && (
                <li>
                  <button
                    type="button"
                    onClick={() => onDaySelect?.(day)}
                    className="text-xs font-medium text-stone-600 underline-offset-2 hover:underline"
                    data-testid={`calendar-day-overflow-${day.toISOString().slice(0, 10)}`}
                  >
                    {t('moreEvents', { count: overflow })}
                  </button>
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
