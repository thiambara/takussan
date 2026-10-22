'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, buildQueryString, type ApiError } from '@/lib/api';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Booking } from '@/types/booking';
import type { PropertyCalendarFeed, PropertyUnavailability } from '@/types/property-calendar';
import { cheminApi, requete } from '@/lib/chemin-api';
import { lireToutesLesPages, PAR_PAGE_MAX } from './toutes-les-pages';

/**
 * TCK-596 §3B (ADR-0041) — le calendrier d'hôte d'un bien : réservations confirmées, dates bloquées
 * (manuelles et importées), flux iCal importés et lien d'export. Les droits sont ceux de
 * `PropertyPolicy::update`, jugés par l'API.
 */

const key = (propertyId: number) => ['properties', propertyId, 'calendar'] as const;

export function usePropertyUnavailabilities(propertyId: number, from: string, to: string) {
  return useApiQuery<ApiResponse<PropertyUnavailability[]>>(
    [...key(propertyId), 'unavailabilities', from, to],
    cheminApi`/api/properties/${propertyId}/unavailabilities`,
    { params: { extra: { from, to } } },
  );
}

/**
 * TCK-1369 (P135.03) — TOUS les séjours confirmés du bien, page par page. Aucun séjour ne passe à
 * `completed` : une seule page de 100, triée par `start_date` croissant, perdait au 101ᵉ les
 * séjours les plus récents, donc ceux à venir, et le calendrier montrait libres des nuits réservées.
 */
export function usePropertyConfirmedStays(propertyId: number) {
  const locale = useLocale();
  const { token } = useAuth();

  return useQuery<PaginatedResponse<Booking>, ApiError>({
    queryKey: [...key(propertyId), 'stays'],
    queryFn: ({ signal }) =>
      lireToutesLesPages((page) =>
        apiRequest<PaginatedResponse<Booking>>(
          cheminApi`/api/bookings${requete(buildQueryString({
            fields: { bookings: ['id', 'reference_number', 'status', 'start_date', 'end_date', 'property_id'] },
            filter: { property_id: propertyId, status: 'confirmed' },
            sort: ['start_date'],
            page,
            per_page: PAR_PAGE_MAX,
          }))}`,
          { token: token ?? undefined, locale, signal },
        ),
      ),
  });
}

export type CreateUnavailabilityPayload = {
  starts_on: string;
  ends_on: string;
  reason?: string;
};

export function useCreateUnavailability(propertyId: number) {
  return useApiMutation<ApiResponse<PropertyUnavailability>, CreateUnavailabilityPayload>(
    { path: cheminApi`/api/properties/${propertyId}/unavailabilities`, method: 'POST' },
    { invalidate: [key(propertyId)] },
  );
}

export function useDeleteUnavailability(propertyId: number) {
  return useApiMutation<unknown, { id: number }>(
    { path: ({ id }) => cheminApi`/api/property-unavailabilities/${id}`, method: 'DELETE', body: () => undefined },
    { invalidate: [key(propertyId)] },
  );
}

export function useCalendarFeeds(propertyId: number) {
  return useApiQuery<ApiResponse<PropertyCalendarFeed[]>>(
    [...key(propertyId), 'feeds'],
    cheminApi`/api/properties/${propertyId}/calendar-feeds`,
  );
}

export type CreateCalendarFeedPayload = { url: string; label?: string };

export function useCreateCalendarFeed(propertyId: number) {
  return useApiMutation<ApiResponse<PropertyCalendarFeed>, CreateCalendarFeedPayload>(
    { path: cheminApi`/api/properties/${propertyId}/calendar-feeds`, method: 'POST' },
    { invalidate: [key(propertyId)] },
  );
}

export function useSyncCalendarFeed(propertyId: number) {
  return useApiMutation<ApiResponse<PropertyCalendarFeed>, { id: number }>(
    { path: ({ id }) => cheminApi`/api/property-calendar-feeds/${id}/sync`, method: 'POST', body: () => undefined },
    { invalidate: [key(propertyId)] },
  );
}

export function useDeleteCalendarFeed(propertyId: number) {
  return useApiMutation<unknown, { id: number }>(
    { path: ({ id }) => cheminApi`/api/property-calendar-feeds/${id}`, method: 'DELETE', body: () => undefined },
    { invalidate: [key(propertyId)] },
  );
}

/** Régénère le jeton : l'URL n'est rendue qu'ici, une fois, et l'ancienne cesse de répondre. */
export function useGenerateIcalLink(propertyId: number) {
  return useApiMutation<ApiResponse<{ url: string }>, void>({
    path: cheminApi`/api/properties/${propertyId}/ical-token`,
    method: 'POST',
  });
}
