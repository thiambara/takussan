/**
 * TCK-2671 — la vérification de l'agence : UN état, UNE phrase, UNE action.
 *
 * L'état se lit du dossier tel que l'API le rend (`GET /api/agencies/{agency}/kyc`), jamais de ce que
 * l'écran a envoyé. Cinq états, dans l'ordre où l'admin les rencontre :
 *
 * | état | quand | l'action |
 * |---|---|---|
 * | `a_fournir` | `pending`, une pièce manque ou celle du dirigeant est échue | ajouter la première pièce qui manque |
 * | `pret` | `pending`, les trois pièces sont là et valables | « Soumettre le dossier » |
 * | `en_examen` | `submitted` | aucune — la décision arrive par e-mail et notification |
 * | `verifiee` | `verified`, échéance au-delà de la fenêtre | aucune — le badge, la prochaine échéance |
 * | `refusee` | `rejected` | « Corriger » — le motif d'abord |
 * | `a_renouveler` | la pièce du dirigeant est échue (dossier passé par une échéance) ou entre dans la fenêtre de renouvellement d'un dossier vérifié | « Remplacer la pièce d'identité » |
 */

import { etatEcheance } from '@/lib/kyc-echeance';
import type { KycDocument, KycDossier } from '@/types/super-admin';

export type TypeDePiece = 'rccm' | 'ninea' | 'director_id';

/** L'ordre des pièces à l'écran, et celui dans lequel on demande la première qui manque. */
export const PIECES: readonly TypeDePiece[] = ['rccm', 'ninea', 'director_id'];

/** Les pièces qui portent un numéro, recopié dans les mentions légales (ADR-0104 § 2). */
export const PIECES_NUMEROTEES: readonly TypeDePiece[] = ['rccm', 'ninea'];

export type EtatDeLaVerification = 'a_fournir' | 'pret' | 'en_examen' | 'verifiee' | 'refusee' | 'a_renouveler';

/** La DERNIÈRE pièce déposée de chaque type (l'API les rend toutes, la plus récente en dernier). */
export function piecesDuDossier(dossier: KycDossier): Partial<Record<TypeDePiece, KycDocument>> {
  const parType: Partial<Record<TypeDePiece, KycDocument>> = {};
  for (const doc of dossier.documents) {
    if ((PIECES as readonly string[]).includes(doc.document_type)) parType[doc.document_type as TypeDePiece] = doc;
  }
  return parType;
}

/** Le jour civil local, `AAAA-MM-JJ` — la forme de `renewal.opens_on`. */
function jourCivil(maintenant: Date): string {
  const mm = String(maintenant.getMonth() + 1).padStart(2, '0');
  const jj = String(maintenant.getDate()).padStart(2, '0');
  return `${maintenant.getFullYear()}-${mm}-${jj}`;
}

/**
 * Le dossier vérifié accepte-t-il la nouvelle pièce du dirigeant ? L'API le dit
 * (`KycDossierResource::renewal`, TCK-2671) : le jour d'ouverture de la fenêtre, calculé par
 * `KycWorkflowService::renewalOpensOn()` — la règle même qu'elle juge au dépôt. Le front n'en
 * recopie ni la durée ni la pièce. Sans `renewal` (dossier non vérifié, ou sans échéance), fermé.
 */
export function renouvellementOuvert(dossier: KycDossier, maintenant: Date = new Date()): boolean {
  if (dossier.status !== 'verified' || !dossier.renewal) return false;
  return jourCivil(maintenant) >= dossier.renewal.opens_on;
}

/** La pièce du dirigeant est-elle échue (ou absente de date) ? Une pièce qui échoit aujourd'hui l'est déjà. */
function pieceDuDirigeantEchue(piece: KycDocument | undefined, maintenant: Date): boolean {
  if (!piece) return false;
  return etatEcheance(piece.document_expires_at, maintenant) === 'expired';
}

/** Les pièces à fournir encore : absentes, ou celle du dirigeant échue. Dans l'ordre de {@link PIECES}. */
export function piecesManquantes(dossier: KycDossier, maintenant: Date = new Date()): TypeDePiece[] {
  const pieces = piecesDuDossier(dossier);
  return PIECES.filter((type) => !pieces[type] || (type === 'director_id' && pieceDuDirigeantEchue(pieces[type], maintenant)));
}

export function etatDeLaVerification(dossier: KycDossier, maintenant: Date = new Date()): EtatDeLaVerification {
  const pieces = piecesDuDossier(dossier);
  const echue = pieceDuDirigeantEchue(pieces.director_id, maintenant);
  switch (dossier.status) {
    case 'verified':
      return renouvellementOuvert(dossier, maintenant) ? 'a_renouveler' : 'verifiee';
    case 'submitted':
      return 'en_examen';
    case 'rejected':
      return 'refusee';
    default: {
      // Un dossier repassé `pending` par l'échéance (`metadata.expired_at`) dont la pièce reste
      // échue : c'est un renouvellement, pas un premier dépôt — la conséquence se dit.
      const passeParUneEcheance = typeof dossier.metadata?.expired_at === 'string';
      if (passeParUneEcheance && echue) return 'a_renouveler';
      return piecesManquantes(dossier, maintenant).length === 0 ? 'pret' : 'a_fournir';
    }
  }
}

/**
 * La pièce du dirigeant peut-elle partir ? Hors d'un dossier vérifié, toujours (l'API attache la
 * pièce) — sauf pendant l'examen, où l'écran ne l'offre pas : la décision porte sur ce qui a été
 * envoyé. Sur un dossier vérifié, seulement dans la fenêtre de renouvellement.
 */
export function pieceRemplacable(dossier: KycDossier, type: TypeDePiece, maintenant: Date = new Date()): boolean {
  if (dossier.status === 'submitted') return false;
  if (dossier.status === 'verified') return type === dossier.renewal?.document_type && renouvellementOuvert(dossier, maintenant);
  return true;
}

/** Une ligne de l'historique : la date ISO et sa clé de libellé. Les plus récentes d'abord. */
export interface EvenementDuDossier {
  readonly date: string;
  readonly cle: 'ouvert' | 'envoye' | 'verifie' | 'refuse' | 'expire';
}

/**
 * L'historique se lit des seules dates que l'API rend (`created_at`, `submitted_at`, `reviewed_at`,
 * `metadata.expired_at`) — aucun détail n'est inventé (qui a ouvert le dossier, quels rappels).
 */
export function historiqueDuDossier(dossier: KycDossier): EvenementDuDossier[] {
  const evenements: EvenementDuDossier[] = [];
  if (dossier.created_at) evenements.push({ date: dossier.created_at, cle: 'ouvert' });
  if (dossier.submitted_at) evenements.push({ date: dossier.submitted_at, cle: 'envoye' });
  if (dossier.reviewed_at && (dossier.status === 'verified' || dossier.status === 'rejected')) {
    evenements.push({ date: dossier.reviewed_at, cle: dossier.status === 'rejected' ? 'refuse' : 'verifie' });
  }
  const expire = dossier.metadata?.expired_at;
  if (typeof expire === 'string') evenements.push({ date: expire, cle: 'expire' });
  return evenements.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}
