'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { apiRequest, buildQueryString, type ApiError } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Booking } from '@/types/booking';
import type { PropertyUnavailability } from '@/types/property-calendar';
import { lireToutesLesPages, PAR_PAGE_MAX } from './toutes-les-pages';

/**
 * TCK-2877 — les lectures de la carte « Nuits du bien · {mois} » de la fiche d'un séjour (maquette
 * `app-reservations` a, e5, bureau) : les SÉJOURS du bien en attente ou confirmés (toutes les pages :
 * l'index n'a pas de filtre de dates, et une seule page perdait les séjours au-delà du 100ᵉ — même
 * défaut que TCK-1369), et ses nuits bloquées sur le mois. Sous `['bookings', 'list', …]` : toute
 * décision sur une réservation invalide aussi la carte.
 */
export function useSejoursDuBien(propertyId: number) {
  const locale = useLocale();
  const { token } = useAuth();

  return useQuery<PaginatedResponse<Booking>, ApiError>({
    queryKey: ['bookings', 'list', 'nuits-du-bien', propertyId],
    queryFn: ({ signal }) =>
      lireToutesLesPages((page) =>
        apiRequest<PaginatedResponse<Booking>>(
          cheminApi`/api/bookings${requete(
            buildQueryString({
              fields: { bookings: ['id', 'status', 'start_date', 'end_date', 'property_id'] },
              filter: { property_id: propertyId, status: 'pending,confirmed', kind: 'stay' },
              sort: ['start_date'],
              page,
              per_page: PAR_PAGE_MAX,
            }),
          )}`,
          { token: token ?? undefined, locale, signal },
        ),
      ),
  });
}

/**
 * Les nuits bloquées du bien sur `[from, to)` (`PropertyPolicy::update`) : un lecteur qui ne gère pas
 * le bien reçoit un 403, et la carte compte alors sans elles. Pas de nouvel essai sur un refus.
 */
export function useNuitsBloqueesDuBien(propertyId: number, from: string, to: string) {
  const locale = useLocale();
  const { token } = useAuth();

  return useQuery<ApiResponse<PropertyUnavailability[]>, ApiError>({
    queryKey: ['properties', propertyId, 'calendar', 'unavailabilities', from, to],
    queryFn: ({ signal }) =>
      apiRequest<ApiResponse<PropertyUnavailability[]>>(
        cheminApi`/api/properties/${propertyId}/unavailabilities${requete(buildQueryString({ extra: { from, to } }))}`,
        { token: token ?? undefined, locale, signal },
      ),
    retry: false,
  });
}
