'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  addDays,
  addMonths,
  eventTouchesDay,
  formatISODate,
  parseServerDate,
  startOfDay,
  visibleRange,
} from '@/lib/calendar-date';
import { useCalendar } from '@/lib/queries/calendar';
import type { CalendarEvent, CalendarEventType, CalendarView } from '@/types/calendar';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { ListView } from './ListView';
import { EventDetailSheet } from './EventDetailSheet';

const VIEW_LABELS: Record<CalendarView, string> = {
  month: 'Mois',
  week: 'Semaine',
  day: 'Jour',
  list: 'Liste',
};

const TYPE_OPTIONS: { value: CalendarEventType; label: string }[] = [
  { value: 'booking', label: 'Réservations' },
  { value: 'visit', label: 'Visites' },
];

const LEGEND_ITEMS: {
  type: CalendarEventType;
  label: string;
  helper: string;
  className: string;
}[] = [
  {
    type: 'booking',
    label: 'Réservations',
    helper: 'Séjours et demandes courte durée confirmés',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  {
    type: 'visit',
    label: 'Visites',
    helper: 'Créneaux de visite programmés',
    className: 'bg-violet-100 text-violet-800 border-violet-300',
  },
  {
    type: 'lease',
    label: 'Baux',
    helper: 'Périodes longues quand exposées par le calendrier',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
];

export interface CalendarPageProps {
  /** Date initiale focus (défaut = aujourd'hui). */
  initialFocus?: Date;
}

export function CalendarPage({ initialFocus }: CalendarPageProps) {
  const [view, setView] = useState<CalendarView>('month');
  const [focus, setFocus] = useState<Date>(() => startOfDay(initialFocus ?? new Date()));
  const [selectedTypes, setSelectedTypes] = useState<readonly CalendarEventType[]>([
    'booking',
    'visit',
  ]);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date>(() => startOfDay(initialFocus ?? new Date()));
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const range = useMemo(() => visibleRange(view, focus), [view, focus]);

  const query = useCalendar({
    start_date: formatISODate(range.start),
    end_date: formatISODate(range.end),
    property_id: propertyId ?? undefined,
    types: selectedTypes.length > 0 ? selectedTypes : undefined,
  });

  const events = useMemo(() => query.data?.data ?? [], [query.data]);

  // Liste des biens présents dans les événements — alimente le dropdown.
  // Dérivée client-side car le backend ne nous donne pas `/api/calendar/properties`.
  // Reste honnête aux conventions spatie : aucun re-filtrage côté client
  // sur les `events` eux-mêmes, juste l'extraction d'une liste distincte.
  const propertyOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const e of events) {
      if (e.property_id && !seen.has(e.property_id)) {
        seen.set(e.property_id, e.title);
      }
    }
    if (propertyId && !seen.has(propertyId)) {
      seen.set(propertyId, `Bien #${propertyId}`);
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [events, propertyId]);

  const selectedPropertyLabel =
    propertyOptions.find((option) => option.id === propertyId)?.label ?? null;

  const selectedDayEvents = useMemo(
    () => eventsForDay(events, selectedDay),
    [events, selectedDay],
  );

  const toggleType = (type: CalendarEventType) => {
    setSelectedTypes((prev) => {
      const has = prev.includes(type);
      if (has && prev.length === 1) return prev; // ne pas tout désactiver
      return has ? prev.filter((t) => t !== type) : ([...prev, type] as CalendarEventType[]);
    });
  };

  const navigate = (direction: -1 | 0 | 1) => {
    if (direction === 0) {
      const today = startOfDay(new Date());
      setFocus(today);
      setSelectedDay(today);
      return;
    }
    setFocus((prev) => {
      const next =
        view === 'month'
          ? addMonths(prev, direction)
          : view === 'week'
            ? addDays(prev, direction * 7)
            : view === 'day'
              ? addDays(prev, direction)
              : addDays(prev, direction * 30);
      setSelectedDay(next);
      return next;
    });
  };

  const focusLabel = useMemo(() => {
    if (view === 'month') {
      return focus.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    if (view === 'week') {
      return `Semaine du ${range.start.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      })}`;
    }
    if (view === 'day') {
      return focus.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
    return '30 prochains jours';
  }, [view, focus, range.start]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} aria-label="Précédent">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(0)}>
            Aujourd&apos;hui
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(1)} aria-label="Suivant">
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-2 text-lg font-semibold capitalize text-stone-900" data-testid="calendar-focus-label">
            {focusLabel}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Segmented control vues */}
          <div
            role="radiogroup"
            aria-label="Vue du calendrier"
            className="inline-flex overflow-hidden rounded-lg border border-stone-200 bg-white"
          >
            {(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                data-testid={`calendar-view-${v}`}
                onClick={() => setView(v)}
                className={cn(
                  'px-3 py-1.5 text-sm transition-colors',
                  view === v
                    ? 'bg-app-topbar text-white'
                    : 'text-stone-700 hover:bg-stone-50',
                )}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {/* Segmented control types */}
          <div
            aria-label="Filtrer par type d'événement"
            className="inline-flex overflow-hidden rounded-lg border border-stone-200 bg-white"
          >
            {TYPE_OPTIONS.map((opt) => {
              const active = selectedTypes.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={active}
                  data-testid={`calendar-type-toggle-${opt.value}`}
                  onClick={() => toggleType(opt.value)}
                  className={cn(
                    'px-3 py-1.5 text-sm transition-colors',
                    active
                      ? opt.value === 'booking'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-violet-100 text-violet-800'
                      : 'text-stone-500 hover:bg-stone-50',
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Filtre bien — visible seulement s'il y a des biens à afficher */}
          {propertyOptions.length > 0 && (
            <select
              data-testid="calendar-property-filter"
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700"
              value={propertyId ?? ''}
              onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Tous les biens</option>
              {propertyOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </header>

      <CalendarLegend />

      {(propertyId || selectedTypes.length < TYPE_OPTIONS.length) && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
          data-testid="calendar-active-filters"
        >
          <span className="font-semibold">Filtres actifs</span>
          {propertyId && (
            <button
              type="button"
              onClick={() => setPropertyId(null)}
              className="rounded-md bg-white px-2 py-1 text-amber-900 shadow-sm hover:bg-amber-100"
            >
              Bien : {selectedPropertyLabel ?? `#${propertyId}`} x
            </button>
          )}
          {selectedTypes.length < TYPE_OPTIONS.length && (
            <span className="rounded-md bg-white px-2 py-1 shadow-sm">
              Types : {TYPE_OPTIONS.filter((type) => selectedTypes.includes(type.value)).map((type) => type.label).join(', ')}
            </span>
          )}
        </div>
      )}

      {query.isLoading ? (
        <div className="h-96 animate-pulse rounded-xl bg-stone-100" />
      ) : query.isError ? (
        <p className="rounded-xl bg-red-50 p-6 text-sm text-red-700">
          Impossible de charger le calendrier.
        </p>
      ) : (
        <>
          {view === 'month' && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <MonthView
                focus={focus}
                events={events}
                onSelect={setSelectedEvent}
                selectedDay={selectedDay}
                onDaySelect={(day) => setSelectedDay(startOfDay(day))}
              />
              <SelectedDayPanel
                day={selectedDay}
                events={selectedDayEvents}
                onSelect={setSelectedEvent}
                onOpenDay={() => {
                  setFocus(selectedDay);
                  setView('day');
                }}
              />
            </div>
          )}
          {view === 'week' && (
            <WeekView focus={focus} events={events} onSelect={setSelectedEvent} />
          )}
          {view === 'day' && (
            <DayView focus={focus} events={events} onSelect={setSelectedEvent} />
          )}
          {view === 'list' && (
            <ListView events={events} onSelect={setSelectedEvent} />
          )}
        </>
      )}

      <EventDetailSheet
        event={selectedEvent}
        open={Boolean(selectedEvent)}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      />
    </div>
  );
}

function CalendarLegend() {
  return (
    <section
      aria-label="Légende du calendrier"
      className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-3"
      data-testid="calendar-legend"
    >
      {LEGEND_ITEMS.map((item) => (
        <div key={item.type} className="flex items-start gap-2">
          <span
            className={cn('mt-0.5 h-3 w-3 shrink-0 rounded-full border', item.className)}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-900">{item.label}</p>
            <p className="text-xs text-stone-500">{item.helper}</p>
          </div>
        </div>
      ))}
      <div className="flex items-start gap-2 sm:col-span-3">
        <span className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-stone-300 bg-stone-100" aria-hidden="true" />
        <p className="text-xs text-stone-500">
          Les événements en gris indiquent une demande ou une signature encore en attente.
        </p>
      </div>
    </section>
  );
}

function SelectedDayPanel({
  day,
  events,
  onSelect,
  onOpenDay,
}: {
  day: Date;
  events: readonly { event: CalendarEvent; start: Date }[];
  onSelect: (event: CalendarEvent) => void;
  onOpenDay: () => void;
}) {
  const label = day.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <aside className="rounded-xl border border-stone-200 bg-white" data-testid="calendar-selected-day">
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold capitalize text-stone-900">{label}</h3>
          <p className="text-xs text-stone-500">
            {events.length} événement{events.length > 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenDay}
          className="rounded-md border border-stone-200 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
        >
          Vue jour
        </button>
      </header>
      {events.length === 0 ? (
        <p className="p-4 text-sm text-stone-500">Aucun événement sur cette journée.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {events.map(({ event, start }) => {
            const timeLabel = event.all_day
              ? 'Journée'
              : start.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
            const palette = LEGEND_ITEMS.find((item) => item.type === event.type);
            return (
              <li key={`${event.type}-${event.id}`}>
                <button
                  type="button"
                  onClick={() => onSelect(event)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-stone-50"
                  data-testid={`calendar-selected-day-row-${event.type}-${event.id}`}
                >
                  <span
                    className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full border', palette?.className)}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-stone-500">{timeLabel}</span>
                    <span className="block truncate text-sm font-medium text-stone-900">{event.title}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function eventsForDay(events: readonly CalendarEvent[], day: Date) {
  return events
    .map((event) => ({
      event,
      start: parseServerDate(event.start) ?? new Date(NaN),
      end: parseServerDate(event.end),
    }))
    .filter(({ start, end }) => eventTouchesDay({ start, end }, day))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map(({ event, start }) => ({ event, start }));
}
