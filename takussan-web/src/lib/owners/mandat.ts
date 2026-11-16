import type { OwnerProfileDetail, ReglagesDuMandatPayload } from '@/lib/queries/owners';

/**
 * TCK-2910 — les réglages du mandat tels que le formulaire de la fiche les tient (des chaînes, `''` ou
 * `AUCUN` pour « non précisé »), et ce qui en part : SEULES les clés changées (`PATCH /api/owners/{id}`
 * n'écrit que les clés envoyées ; un corps vide serait un 422).
 */
export const AUCUN = 'aucun';

/** Les moyens de versement de l'API (`PaymentMethod`, celui des reversements). */
export const MOYENS_DE_VERSEMENT = ['bank_transfer', 'wave', 'orange_money', 'free_money', 'mobile_money', 'cash', 'check', 'card'] as const;

export interface ValeursDuMandat {
  readonly seuil: number | null;
  readonly moyen: string;
  /** Le champ numérique peut rendre un nombre (ou `NaN` vidé) : tout se relit par `String()`. */
  readonly jour: string | number;
  readonly debut: string;
  readonly fin: string;
  readonly referent: string;
}

export function valeursDuMandat(owner: OwnerProfileDetail): ValeursDuMandat {
  const m = owner.mandate;
  return {
    seuil: owner.works_approval_threshold,
    moyen: m?.payout_method ?? AUCUN,
    jour: m?.payout_day != null ? String(m.payout_day) : '',
    debut: m?.starts_on ?? '',
    fin: m?.ends_on ?? '',
    referent: m?.referent ? String(m.referent.id) : AUCUN,
  };
}

const chaine = (v: string | number | null | undefined): string | null => {
  const texte = v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) ? '' : String(v).trim();
  return texte === '' || texte === AUCUN ? null : texte;
};
const entier = (v: string | number): number | null => {
  const texte = chaine(v);
  return texte === null ? null : Number(texte);
};

/** Les clés qui ont changé, prêtes à partir ; `{}` si rien n'a changé. */
export function changementsDuMandat(avant: ValeursDuMandat, apres: ValeursDuMandat): ReglagesDuMandatPayload {
  const corps: Record<string, string | number | null> = {};
  if ((avant.seuil ?? null) !== (apres.seuil ?? null)) corps.works_approval_threshold = apres.seuil ?? null;
  if (chaine(avant.moyen) !== chaine(apres.moyen)) corps.payout_method = chaine(apres.moyen);
  if (entier(avant.jour) !== entier(apres.jour)) corps.payout_day = entier(apres.jour);
  if (chaine(avant.debut) !== chaine(apres.debut)) corps.mandate_starts_on = chaine(apres.debut);
  if (chaine(avant.fin) !== chaine(apres.fin)) corps.mandate_ends_on = chaine(apres.fin);
  if (entier(avant.referent) !== entier(apres.referent)) corps.referent_agent_id = entier(apres.referent);
  return corps as ReglagesDuMandatPayload;
}

/** Le jour de versement : un entier de 1 à 28 (« avant le N du mois »), ou vide. */
export function jourValide(jour: string | number): boolean {
  const texte = chaine(jour);
  if (texte === null) return true;
  const n = Number(texte);
  return Number.isInteger(n) && n >= 1 && n <= 28;
}
