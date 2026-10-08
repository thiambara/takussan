'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Booking } from '@/types/booking';
import type { PropertyCalendarFeed, PropertyUnavailability } from '@/types/property-calendar';

/**
 * TCK-596 §3B (ADR-0041) — le calendrier d'hôte d'un bien : réservations confirmées, dates bloquées
 * (manuelles et importées), flux iCal importés et lien d'export. Les droits sont ceux de
 * `PropertyPolicy::update`, jugés par l'API.
 */

const key = (propertyId: number) => ['properties', propertyId, 'calendar'] as const;

export function usePropertyUnavailabilities(propertyId: number, from: string, to: string) {
  return useApiQuery<ApiResponse<PropertyUnavailability[]>>(
    [...key(propertyId), 'unavailabilities', from, to],
    `/api/properties/${propertyId}/unavailabilities`,
    { params: { extra: { from, to } } },
  );
}

export function usePropertyConfirmedStays(propertyId: number) {
  return useApiQuery<PaginatedResponse<Booking>>(
    [...key(propertyId), 'stays'],
    '/api/bookings',
    {
      params: {
        fields: { bookings: ['id', 'reference_number', 'status', 'start_date', 'end_date', 'property_id'] },
        filter: { property_id: propertyId, status: 'confirmed' },
        sort: ['start_date'],
        per_page: 100,
      },
    },
  );
}

export type CreateUnavailabilityPayload = {
  starts_on: string;
  ends_on: string;
  reason?: string;
};

export function useCreateUnavailability(propertyId: number) {
  return useApiMutation<ApiResponse<PropertyUnavailability>, CreateUnavailabilityPayload>(
    { path: `/api/properties/${propertyId}/unavailabilities`, method: 'POST' },
    { invalidate: [key(propertyId)] },
  );
}

export function useDeleteUnavailability(propertyId: number) {
  return useApiMutation<unknown, { id: number }>(
    { path: ({ id }) => `/api/property-unavailabilities/${id}`, method: 'DELETE', body: () => undefined },
    { invalidate: [key(propertyId)] },
  );
}

export function useCalendarFeeds(propertyId: number) {
  return useApiQuery<ApiResponse<PropertyCalendarFeed[]>>(
    [...key(propertyId), 'feeds'],
    `/api/properties/${propertyId}/calendar-feeds`,
  );
}

export type CreateCalendarFeedPayload = { url: string; label?: string };

export function useCreateCalendarFeed(propertyId: number) {
  return useApiMutation<ApiResponse<PropertyCalendarFeed>, CreateCalendarFeedPayload>(
    { path: `/api/properties/${propertyId}/calendar-feeds`, method: 'POST' },
    { invalidate: [key(propertyId)] },
  );
}

export function useSyncCalendarFeed(propertyId: number) {
  return useApiMutation<ApiResponse<PropertyCalendarFeed>, { id: number }>(
    { path: ({ id }) => `/api/property-calendar-feeds/${id}/sync`, method: 'POST', body: () => undefined },
    { invalidate: [key(propertyId)] },
  );
}

export function useDeleteCalendarFeed(propertyId: number) {
  return useApiMutation<unknown, { id: number }>(
    { path: ({ id }) => `/api/property-calendar-feeds/${id}`, method: 'DELETE', body: () => undefined },
    { invalidate: [key(propertyId)] },
  );
}

/** Régénère le jeton : l'URL n'est rendue qu'ici, une fois, et l'ancienne cesse de répondre. */
export function useGenerateIcalLink(propertyId: number) {
  return useApiMutation<ApiResponse<{ url: string }>, void>({
    path: `/api/properties/${propertyId}/ical-token`,
    method: 'POST',
  });
}
