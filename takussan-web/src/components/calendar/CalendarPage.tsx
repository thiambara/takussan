'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  addDays,
  addMonths,
  formatISODate,
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
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }));
  }, [events]);

  const toggleType = (type: CalendarEventType) => {
    setSelectedTypes((prev) => {
      const has = prev.includes(type);
      if (has && prev.length === 1) return prev; // ne pas tout désactiver
      return has ? prev.filter((t) => t !== type) : ([...prev, type] as CalendarEventType[]);
    });
  };

  const navigate = (direction: -1 | 0 | 1) => {
    if (direction === 0) {
      setFocus(startOfDay(new Date()));
      return;
    }
    setFocus((prev) => {
      if (view === 'month') return addMonths(prev, direction);
      if (view === 'week') return addDays(prev, direction * 7);
      if (view === 'day') return addDays(prev, direction);
      return addDays(prev, direction * 30);
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

      {query.isLoading ? (
        <div className="h-96 animate-pulse rounded-xl bg-stone-100" />
      ) : query.isError ? (
        <p className="rounded-xl bg-red-50 p-6 text-sm text-red-700">
          Impossible de charger le calendrier.
        </p>
      ) : (
        <>
          {view === 'month' && (
            <MonthView focus={focus} events={events} onSelect={setSelectedEvent} />
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
