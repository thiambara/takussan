/**
 * TCK-2601 (AC3) — l'annonce commencée sans compte, versée au brouillon SERVEUR quand elle ne peut pas
 * être publiée d'ici : un espace d'agence `standard`, plusieurs espaces, ou un profil bailleur seul.
 * L'assistant connecté (`/app/properties/new?brouillon=publication`) la reprend à la dernière étape,
 * avec ses champs d'agence (bailleur, frais, quota, proposition).
 *
 * ⚠ **Une clé à part** (décision de la session du 2026-11-13, option a) : un brouillon serveur
 * antérieur du compte (`property-create-wizard`, une autre annonce commencée connecté) n'est ni écrasé
 * ni effacé (AC4). La route n'admet que `[A-Za-z0-9._:-]{1,255}`.
 */
import { cheminApi } from '@/lib/chemin-api';

export const CLE_BROUILLON_DE_PUBLICATION = 'property-create-wizard:publication';

/** Le paramètre d'URL qui fait reprendre cette clé à l'assistant connecté. */
export const PARAMETRE_DE_REPRISE = 'brouillon';
export const LIEN_DE_REPRISE = `/app/properties/new?${PARAMETRE_DE_REPRISE}=publication`;

export type IssueDuVersement =
  | { readonly ok: true }
  /** `plafond` : 20 brouillons au compte (`MAX_BROUILLONS`) ; `taille` : plus de 256 Ko ; `echec` : le reste. */
  | { readonly ok: false; readonly raison: 'plafond' | 'taille' | 'echec' };

/**
 * `PUT /api/me/wizard-drafts/{clé}` (relais BFF). Un refus laisse l'annonce dans ce navigateur : rien
 * n'est effacé ici, et l'appelant le dit.
 */
export async function verserAuBrouillonServeur(
  etape: number,
  valeurs: Readonly<Record<string, unknown>>,
  transport: typeof fetch = fetch,
): Promise<IssueDuVersement> {
  try {
    const res = await transport(cheminApi`/api/me/wizard-drafts/${CLE_BROUILLON_DE_PUBLICATION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ step: etape, data: valeurs }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 422) {
      // Le CHAMP fait foi, pas le message (traduisible) : `key` pour le plafond, `data` pour la taille
      // (`UpsertWizardDraftRequest::after`, `WizardDraftBornesTest`).
      const corps = (await res.json().catch(() => null)) as { errors?: Record<string, unknown> } | null;
      if (corps?.errors && 'key' in corps.errors) return { ok: false, raison: 'plafond' };
      if (corps?.errors && 'data' in corps.errors) return { ok: false, raison: 'taille' };
    }
    return { ok: false, raison: 'echec' };
  } catch {
    return { ok: false, raison: 'echec' };
  }
}
