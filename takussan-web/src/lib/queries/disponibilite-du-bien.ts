import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';

/**
 * TCK-2432 — l'annonce d'origine d'un bien publié par le Radar a disparu : son titulaire est prié de dire si le bien est
 * toujours disponible. La question (`GET …/availability-check`, `open` vrai quand une réponse est attendue de l'appelant),
 * puis la réponse (`POST`) : `rented` et `sold` sortent le bien de la vitrine, `available` ne fait que noter la réponse.
 */

export type ReponseDeDisponibilite = 'rented' | 'sold' | 'available';

export const REPONSES_DE_DISPONIBILITE: readonly ReponseDeDisponibilite[] = ['rented', 'sold', 'available'];

export interface QuestionDeDisponibilite {
  readonly property_id: number;
  readonly open: boolean;
  readonly asked_at: string | null;
}

export interface ReponseEnregistree {
  readonly property_id: number;
  readonly answer: ReponseDeDisponibilite;
  readonly status: string;
}

export const disponibiliteDuBienKeys = {
  question: (propertyId: number) => ['property', propertyId, 'availability-check'] as const,
};

export function lireQuestionDeDisponibilite(
  token: string,
  propertyId: number,
  { locale, signal }: { readonly locale?: string; readonly signal?: AbortSignal } = {},
): Promise<ApiResponse<QuestionDeDisponibilite>> {
  return apiRequest<ApiResponse<QuestionDeDisponibilite>>(cheminApi`/api/properties/${propertyId}/availability-check`, {
    token,
    locale,
    signal,
  });
}

export function repondreQuestionDeDisponibilite(
  token: string,
  propertyId: number,
  answer: ReponseDeDisponibilite,
  locale?: string,
): Promise<ApiResponse<ReponseEnregistree>> {
  return apiRequest<ApiResponse<ReponseEnregistree>>(cheminApi`/api/properties/${propertyId}/availability-check`, {
    token,
    locale,
    method: 'POST',
    body: { answer },
  });
}
