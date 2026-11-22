import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-2949 — le résumé chiffré du panneau « {agence} vous attend » de l'étape du numéro
 * (`GET /api/me/profiles/{alias}:{id}/invite-summary`, TCK-2939, ADR-0094 amendé le 2026-11-15 § 6).
 *
 * L'API ne répond qu'au titulaire d'un profil ACTIF, sinon 404 : un profil encore en brouillon, une session expirée,
 * une API muette rendent `null`, et le panneau retombe sur ses lignes sans chiffres. Le `catch` vit ICI, une fois :
 * aucune page ne peut l'oublier, et l'étape du numéro ne casse jamais pour une lecture d'agrément.
 */
export interface ResumeDInvite {
  readonly role: 'owner' | 'agent' | 'service_provider' | string;
  /** Biens suivis par l'agence ; `null` pour le prestataire. */
  readonly properties_count: number | null;
  /** Les titres des biens du bailleur, trois au plus ; `[]` pour les autres rôles. */
  readonly titles: readonly string[];
  /** Le dernier loyer reçu (bailleur) ; `null` sinon. */
  readonly last_rent: { readonly amount: number; readonly paid_at: string | null } | null;
  /** Pièces obligatoires encore à envoyer. */
  readonly missing_documents: number;
}

export type AliasDeProfilDInvite = 'owner' | 'agent' | 'service_provider';

export async function fetchResumeDInvite(
  token: string,
  alias: AliasDeProfilDInvite,
  profileId: number,
): Promise<ResumeDInvite | null> {
  try {
    const res = await apiRequest<{ data: ResumeDInvite | null }>(
      cheminApi`/api/me/profiles/${alias}:${profileId}/invite-summary`,
      { token },
    );
    return res?.data ?? null;
  } catch {
    return null;
  }
}
