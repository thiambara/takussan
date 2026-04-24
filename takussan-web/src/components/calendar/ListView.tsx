'use client';

import { cn } from '@/lib/utils';
import { parseServerDate, startOfDay } from '@/lib/calendar-date';
import { paletteFor, typeLabel } from './event-colors';
import type { CalendarEvent } from '@/types/calendar';

export interface ListViewProps {
  events: readonly CalendarEvent[];
  onSelect: (event: CalendarEvent) => void;
}

type Group = { key: string; label: string; items: { event: CalendarEvent; start: Date }[] };

export function ListView({ events, onSelect }: ListViewProps) {
  const groups: Group[] = (() => {
    const byDay = new Map<string, Group>();
    for (const e of events) {
      const start = parseServerDate(e.start);
      if (!start) continue;
      const key = startOfDay(start).toISOString();
      if (!byDay.has(key)) {
        byDay.set(key, {
          key,
          label: start.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
          items: [],
        });
      }
      byDay.get(key)!.items.push({ event: e, start });
    }
    return Array.from(byDay.values()).sort((a, b) => a.key.localeCompare(b.key));
  })();

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
        Aucun événement dans la période affichée.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key}>
          <h3 className="mb-2 text-sm font-semibold capitalize text-stone-700">{group.label}</h3>
          <ul className="overflow-hidden rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
            {group.items
              .sort((a, b) => a.start.getTime() - b.start.getTime())
              .map(({ event, start }) => {
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
                      data-testid={`calendar-list-row-${event.type}-${event.id}`}
                    >
                      <span
                        className={cn('h-8 w-1.5 shrink-0 rounded-full', palette.accent)}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold uppercase text-stone-500">
                            {typeLabel(event.type)}
                          </span>
                          <span className="text-xs font-medium text-stone-600">{timeLabel}</span>
                        </div>
                        <div className="truncate text-sm font-medium text-stone-900">
                          {event.title}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
