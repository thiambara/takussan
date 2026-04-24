'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import type { CalendarResponse, CalendarEventType } from '@/types/calendar';

/**
 * TCK-072 — React Query hook pour `/api/calendar`.
 *
 * L'endpoint Laravel n'est PAS un endpoint spatie (il fait sa propre
 * agrégation bookings + visites). On passe donc les query params en
 * clair via l'escape hatch `extra`, sauf pour `types[]` qui doit être
 * répété — on construit une querystring dédiée et on l'accole au path.
 *
 * Les fields sparse conventions s'appliquent néanmoins côté agrégateur :
 * le controller ne retourne que les colonnes nécessaires au calendrier
 * (id, title, start, end, status, type, resource_url, ...).
 */

export type UseCalendarParams = {
  /** `YYYY-MM-DD` */
  start_date: string;
  /** `YYYY-MM-DD` */
  end_date: string;
  property_id?: number | null;
  /** Si vide ou absent → les deux types sont retournés côté back. */
  types?: readonly CalendarEventType[];
  /** Désactive la requête (utile le temps que le range soit calculé). */
  enabled?: boolean;
};

function buildCalendarPath(params: UseCalendarParams): string {
  const qs = new URLSearchParams();
  qs.set('start_date', params.start_date);
  qs.set('end_date', params.end_date);
  if (params.property_id) qs.set('property_id', String(params.property_id));
  if (params.types && params.types.length > 0) {
    for (const t of params.types) qs.append('types[]', t);
  }
  return `/api/calendar?${qs.toString()}`;
}

export const calendarQueryKeys = {
  range: (params: UseCalendarParams) => ['calendar', 'range', params] as const,
};

export function useCalendar(params: UseCalendarParams) {
  const { enabled, ...rest } = params;
  return useApiQuery<CalendarResponse>(
    calendarQueryKeys.range(rest),
    buildCalendarPath(rest),
    {
      enabled: enabled ?? true,
      staleTime: 30_000,
    },
  );
}
