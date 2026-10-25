import { apiRequest } from './api';
import { cheminApi } from './chemin-api';

/** P220.07 (TCK-2281) — le nom que l'agence a saisi à l'invitation, à confirmer par le compte. */
export interface NomsPreremplis {
  readonly prenom: string;
  readonly nom: string;
}

/**
 * `GET /api/invitations/{token}/prefill`, avec la session : le prénom et le nom de l'invitation
 * quand le compte connecté en est le destinataire et n'a pas de nom, `null` sinon. Un échec de
 * lecture rend aussi `null` — l'écran garde alors son seul bouton, et c'est l'acceptation qui dira
 * une invitation close.
 */
export async function lireNomsPreremplis(jeton: string, session: string): Promise<NomsPreremplis | null> {
  try {
    const res = await apiRequest<{ data?: { first_name?: unknown; last_name?: unknown } | null }>(
      cheminApi`/api/invitations/${jeton}/prefill`,
      { token: session },
    );
    if (!res?.data) return null;
    const texte = (v: unknown) => (typeof v === 'string' ? v : '');
    return { prenom: texte(res.data.first_name), nom: texte(res.data.last_name) };
  } catch {
    return null;
  }
}
