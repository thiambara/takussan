'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { ApiError, apiRequest, messageErreurApi } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import type { PropertyDetail } from '@/types/property';
import { journaliserErreurInattendue } from '@/lib/journal-erreur-action';

/**
 * TCK-633 (lot C) — publier par `POST /api/properties/{id}/publish`, avec l'acceptation des CGU
 * (`accept_terms`) que vaut la phrase sous le formulaire. Un refus faute de coordonnées rend
 * `missing` et `contactIsSelf` : l'écran fait compléter sans quitter la publication.
 */
export type ResultatPublication =
  | { ok: true; data: PropertyDetail }
  | { ok: false; status?: number; message: string; missing: string[] | null; contactIsSelf: boolean };

export async function publishPropertyAction(
  propertyId: number,
  { acceptTerms }: { acceptTerms: boolean },
): Promise<ResultatPublication> {
  return envoyer(propertyId, cheminApi`/api/properties/${propertyId}/publish`, 'POST', { accept_terms: acceptTerms });
}

/**
 * Correction du lot C, tour 2 — `PUT …/status` vers un statut affichable REMET EN LIGNE un bien
 * public retiré par son statut, et l'API le garde comme une publication
 * (`property.publish_contact_incomplete`). Le menu « Statut » passe donc par la même boîte que
 * « Publier » ({@link usePublicationAvecCoordonnees}), qui rejoue ce geste avec `accept_terms`.
 * Un statut qui retire n'exige rien : l'API ignore alors `accept_terms`.
 */
export async function changePropertyStatusAction(
  propertyId: number,
  status: string,
  { acceptTerms }: { acceptTerms: boolean },
): Promise<ResultatPublication> {
  return envoyer(propertyId, cheminApi`/api/properties/${propertyId}/status`, 'PUT', {
    status,
    accept_terms: acceptTerms,
  });
}

async function envoyer(
  propertyId: number,
  chemin: string,
  method: 'POST' | 'PUT',
  body: Record<string, unknown>,
): Promise<ResultatPublication> {
  const token = await getToken();
  if (!token) {
    return {
      ok: false,
      status: 401,
      message: (await getTranslations('errors'))('missingToken'),
      missing: null,
      contactIsSelf: true,
    };
  }
  try {
    const res = await apiRequest<{ data: PropertyDetail }>(chemin, { method, token, body });
    revalidatePath('/app/properties');
    revalidatePath(`/app/properties/${propertyId}`);
    return { ok: true, data: res.data };
  } catch (err) {
    journaliserErreurInattendue('publish-property', err);
    const corps = err instanceof ApiError
      ? (err.data as { code?: unknown; missing?: unknown; contact_is_self?: unknown } | null)
      : null;
    const missing = corps?.code === 'property.publish_contact_incomplete' && Array.isArray(corps.missing)
      ? corps.missing.filter((m): m is string => typeof m === 'string')
      : null;
    const repli = (await getTranslations('property.form.publishContact'))('failed');
    return {
      ok: false,
      status: err instanceof ApiError ? err.status : undefined,
      message: messageErreurApi(err, await getTranslations(), repli),
      missing,
      contactIsSelf: missing !== null ? corps?.contact_is_self === true : true,
    };
  }
}
