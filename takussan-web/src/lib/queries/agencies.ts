import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, SpatieQueryParams } from '@/types/api';
import type { Agency } from '@/types/agency';
import type { AgencyFormPayload } from '@/lib/schemas/agency';

/**
 * Agency admin-config queries — TCK-015 / TCK-064. All reads pass the
 * canonical spatie query params. Callers must always supply a
 * `fields[agencies]` subset to avoid fetching unused columns.
 */

export const AGENCY_ADMIN_FIELDS = [
  'id',
  'name',
  'slug',
  'license_number',
  'description',
  'email',
  'phone',
  'website',
  'commission_rate',
  'status',
  // TCK-248 / TCK-256 — `kind` gates owner-invitation features in /app/owners.
  'kind',
] as const;

function buildShowParams(): SpatieQueryParams {
  return {
    fields: { agencies: AGENCY_ADMIN_FIELDS },
  };
}

/**
 * `activeProfileId` n'est PAS optionnel par confort : son absence a verrouillé des comptes.
 *
 * `apiRequest` ne lit pas le cookie lui-même — il reçoit `activeProfileId` en paramètre et ne
 * pose l'en-tête `X-Active-Profile-Hint` que s'il l'a. `getMeAction()` le passe ; cet appel-ci ne
 * le passait pas. Pour un utilisateur MULTI-AGENCES, `ResolveActiveProfile` refuse alors la
 * bascule automatique, `user.agency_id` vaut `null` côté serveur, l'agence sort de
 * `visibleAgencyIds()`, et `show()` rend 404.
 *
 * Tant que la garde tolérait `null` (`if (agency && …)`), la page s'affichait quand même. Depuis
 * qu'elle est fail-closed, ce 404 éjecte l'utilisateur des NEUF surfaces pro — en silence, car un
 * 404 est classé « réponse ». Le durcissement était juste ; c'est cet appel qui posait une
 * question incomplète.
 *
 * *Deux requêtes qui portent la même identité doivent porter le même contexte, sinon elles ne
 * parlent pas du même utilisateur.*
 */
export async function fetchAgency(
  token: string,
  agencyId: number,
  activeProfileId?: string,
): Promise<Agency> {
  const qs = buildQueryString(buildShowParams());
  const res = await apiRequest<ApiResponse<Agency>>(
    `/api/agencies/${agencyId}${qs ? `?${qs}` : ''}`,
    { token, activeProfileId },
  );
  return res.data;
}

export async function updateAgency(
  token: string,
  agencyId: number,
  payload: AgencyFormPayload,
): Promise<Agency> {
  const res = await apiRequest<ApiResponse<Agency>>(`/api/agencies/${agencyId}`, {
    method: 'PATCH',
    body: payload,
    token,
  });
  return res.data;
}

export async function uploadAgencyLogo(
  token: string,
  agencyId: number,
  file: File,
  activeProfileId?: string,
): Promise<Agency> {
  const form = new FormData();
  form.append('file', file);
  form.append('model_type', 'App\\Models\\Agency');
  form.append('model_id', String(agencyId));
  form.append('collection', 'logo');
  await apiRequest<unknown>(`/api/media`, {
    method: 'POST',
    body: form,
    token,
    formData: true,
  });
  // Refresh the agency so we get the new logo_url — avec le MÊME contexte de profil que toute
  // autre lecture d'agence, sans quoi un compte multi-agences relit un 404 après un upload
  // réussi.
  return fetchAgency(token, agencyId, activeProfileId);
}
