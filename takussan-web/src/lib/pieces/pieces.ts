/**
 * TCK-2614 — les pièces d'un profil d'invité (bailleur, agent, prestataire), telles que `GET /api/me/pieces` les rend
 * (`PiecesDuProfil`, TCK-2612), et ce que l'écran « Vos pièces » en fait.
 *
 * L'API dit QUELLES pièces, si elles sont requises et leur état ; le front, comment chacune se dit et se donne
 * (principe 5 du `CLAUDE.md` racine). Une pièce dont le code n'est pas connu ici n'est pas rendue : l'écran ne montre
 * jamais une ligne sans nom ni geste.
 */

/** L'état d'une pièce. `rejected` est au contrat, jamais rendu aujourd'hui (rien ne consigne le refus d'une pièce). */
export type EtatDePiece = 'missing' | 'sent' | 'verified' | 'rejected';

/** `file_and_number` : la pièce se donne aussi en numéro tapé (le NINEA du bailleur). */
export type GenreDePiece = 'file' | 'file_and_number';

export interface FichierDePiece {
  readonly name: string;
  /** En octets. */
  readonly size: number;
  readonly sent_at: string | null;
}

export interface PieceDuProfil {
  readonly code: string;
  readonly required: boolean;
  readonly kind: GenreDePiece;
  readonly state: EtatDePiece;
  /** Le fichier envoyé, servi au seul titulaire (`null` sous impersonation, sans fichier ou numéro seul). */
  readonly file?: FichierDePiece | null;
  /** Le numéro saisi, MASQUÉ (`•••• 67G2`) — jamais en clair (ADR-0070). */
  readonly number_masked?: string | null;
}

export interface MesPiecesResponse {
  readonly data: readonly PieceDuProfil[];
}

/** Les codes que l'écran sait dire, dans l'ordre où l'API les rend. */
export const CODES_DE_PIECE = ['cni', 'rib', 'ninea', 'license', 'photo', 'insurance'] as const;
export type CodeDePiece = (typeof CODES_DE_PIECE)[number];

export function pieceConnue(p: PieceDuProfil): p is PieceDuProfil & { readonly code: CodeDePiece } {
  return (CODES_DE_PIECE as readonly string[]).includes(p.code);
}

/** Le mot de l'état, sous `pieces.etats` : « À fournir », « Envoyée », « Vérifiée », « À refaire ». */
export type MotDEtat = 'aFournir' | 'envoyee' | 'verifiee' | 'aRefaire';

export function motDEtat(etat: EtatDePiece): MotDEtat {
  switch (etat) {
    case 'sent':
      return 'envoyee';
    case 'verified':
      return 'verifiee';
    case 'rejected':
      return 'aRefaire';
    default:
      return 'aFournir';
  }
}

/** Une pièce à donner : manquante, ou à refaire. Une pièce envoyée ou vérifiée ne se redonne que par « Remplacer ». */
export function aDonner(p: PieceDuProfil): boolean {
  return p.state === 'missing' || p.state === 'rejected';
}

/**
 * « 1 sur 3 » de l'en-tête : les pièces REQUISES envoyées ou vérifiées, sur les requises. Une pièce facultative
 * (l'assurance RC pro) n'entre dans aucun des deux nombres — elle ne retient pas l'étape de « Démarrer »
 * (`PiecesDuProfil::requisesEnvoyees`).
 */
export function compteDesPieces(pieces: readonly PieceDuProfil[]): { readonly envoyees: number; readonly requises: number } {
  const requises = pieces.filter((p) => p.required);
  return {
    envoyees: requises.filter((p) => p.state === 'sent' || p.state === 'verified').length,
    requises: requises.length,
  };
}

/* ──────────────────────────────────────────── Le NINEA ──────────────────────────────────────────── */

/**
 * La forme que l'API retient (`UpdateOwnerTaxIdRequest::FORMAT`) : 7 chiffres, puis un chiffre, une lettre, un chiffre.
 * Espaces tolérés, minuscule acceptée : `0 123 456 7g2` → `01234567G2`.
 */
const FORME_DU_NINEA = /^[0-9]{7}[0-9][A-Z][0-9]$/;

export function nineaCompact(saisie: string): string {
  return saisie.replace(/\s+/gu, '').toUpperCase();
}

export function nineaValide(saisie: string): boolean {
  return FORME_DU_NINEA.test(nineaCompact(saisie));
}

/* ──────────────────────────────────────────── L'envoi ──────────────────────────────────────────── */

/** Le segment du relais d'envoi (`src/app/api/me/<segment>/[id]/kyc/upload`) par type de profil. */
const SEGMENT_PAR_TYPE: Readonly<Record<string, 'owner-profiles' | 'agent-profiles' | 'profiles'>> = {
  owner: 'owner-profiles',
  agent: 'agent-profiles',
  service_provider: 'profiles',
};

export interface ProfilDesPieces {
  readonly type: 'owner' | 'agent' | 'service_provider';
  readonly id: number;
  readonly segment: 'owner-profiles' | 'agent-profiles' | 'profiles';
}

/** `owner:3` → le profil et son relais d'envoi ; un profil sans pièces (admin, client) ou illisible → `null`. */
export function profilDesPieces(idProfilActif: string | null | undefined): ProfilDesPieces | null {
  const [type, id] = (idProfilActif ?? '').split(':');
  const segment = type ? SEGMENT_PAR_TYPE[type] : undefined;
  if (!segment || id === undefined || !/^\d+$/.test(id)) return null;
  return { type: type as ProfilDesPieces['type'], id: Number(id), segment };
}

/** La pièce préparée sur cet appareil, pas encore envoyée : un fichier, ou le NINEA tapé. */
export type PiecePreparee = { readonly fichier: File } | { readonly numero: string };

/** Ce que « Envoyer mes pièces » envoie, dans l'ordre de l'écran — rien d'autre (aucune soumission, décision 7a). */
export function envoisAFaire(
  pieces: readonly PieceDuProfil[],
  preparees: Readonly<Record<string, PiecePreparee | undefined>>,
): readonly { readonly code: string; readonly prepare: PiecePreparee }[] {
  return pieces.flatMap((p) => {
    const prepare = preparees[p.code];
    return prepare ? [{ code: p.code, prepare }] : [];
  });
}
