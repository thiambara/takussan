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
 *
 * ⚠ Ce hint est SOUPLE côté serveur : `ResolveActiveProfile` ignore silencieusement un
 * `active_profile_id` invalide plutôt que de rendre 403. Un cookie périmé ne peut donc pas
 * transformer un appel qui marchait en refus — et cette propriété est désormais PORTEUSE :
 * depuis que les gardes sont fail-closed, un 403 se traduirait par un `redirect('/app')`
 * silencieux. Durcir ce hint vers la sémantique de `X-Profile-Id` exigerait de reprendre
 * `classer()` d'abord.
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

/**
 * `activeProfileId` ici AUSSI — l'écriture en a plus besoin que la lecture, pas moins.
 *
 * `AgencyController::update` autorise sur `activeProfile()?->agency_id === $agency->id`. Sans le
 * hint, un `agency_admin` multi-agences qui n'est pas `primary_admin_id` CHARGEAIT bien
 * `/admin/agency` — la lecture, elle, le transmet — et recevait 403 à l'enregistrement. Le
 * correctif avait été appliqué à deux des trois appels du fichier pour lequel il a été écrit.
 *
 * *Un correctif qui s'arrête au site signalé laisse le suivant plus difficile à trouver, parce
 * qu'on croit la classe traitée.*
 */
export async function updateAgency(
  token: string,
  agencyId: number,
  payload: AgencyFormPayload,
  activeProfileId?: string,
): Promise<Agency> {
  const res = await apiRequest<ApiResponse<Agency>>(`/api/agencies/${agencyId}`, {
    method: 'PATCH',
    body: payload,
    token,
    activeProfileId,
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
  // Le hint va sur l'ÉCRITURE aussi, et c'est elle qui en a le plus besoin.
  //
  // Le paramètre avait été ajouté à cette fonction… puis transmis uniquement à la relecture
  // ci-dessous. Le POST partait donc toujours sans `X-Active-Profile-Hint`. C'était sans effet
  // visible tant que `MediaController::authorizeAttach` refusait tout le monde faute de policy
  // pour `Agency` — TCK-290 a livré `AgencyPolicy::update`, alignée sur
  // `AgencyController::update` et donc sur `activeProfile()`. Ce hint est maintenant CHARGÉ :
  // sans lui, un compte multi-agences (pas d'auto-bascule, par sécurité) n'a aucun profil actif
  // résolu et se reprend un 403 — l'upload paraîtrait réparé partout sauf là où ça compte.
  //
  // *Un paramètre ajouté à une signature n'est pas transmis ; on croit l'avoir fait parce qu'on
  // l'a écrit dans l'en-tête.*
  await apiRequest<unknown>(`/api/media`, {
    method: 'POST',
    body: form,
    token,
    formData: true,
    activeProfileId,
  });
  // Refresh the agency so we get the new logo_url — avec le MÊME contexte de profil que toute
  // autre lecture d'agence, sans quoi un compte multi-agences relit un 404 après un upload
  // réussi.
  return fetchAgency(token, agencyId, activeProfileId);
}
