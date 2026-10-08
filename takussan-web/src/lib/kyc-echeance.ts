/**
 * TCK-601 (C) — l'état d'une échéance KYC (pièce du dirigeant, dossier vérifié).
 *
 * Trois états, et la direction UX du ticket en fixe le ton :
 *
 * | état | quand | rendu |
 * |---|---|---|
 * | `expired` | l'échéance est aujourd'hui ou passée | un état à traiter (`danger`) |
 * | `soon` | moins de {@link SEUIL_ECHEANCE_PROCHE_JOURS} jours | se signale sans alarmer (`attention`) |
 * | `valid` | au-delà | la date, sans pastille |
 *
 * « Aujourd'hui » est EXPIRÉ et non « bientôt » : la commande `kyc:expire-dossiers` repasse le
 * dossier en `pending` le jour même de l'échéance, et le dépôt exige une date POSTÉRIEURE à
 * aujourd'hui — une pièce qui échoit aujourd'hui n'est déjà plus recevable.
 *
 * Le seuil reprend la première relance que l'API envoie aux admins (J-30, `kyc:expire-dossiers`).
 * ⚠ Aucun libellé ne l'écrit en chiffres : un délai chiffré affiché est une promesse que
 * `promesses-de-delai.test.ts` exige d'adosser à un mécanisme.
 */
export const SEUIL_ECHEANCE_PROCHE_JOURS = 30;

export type EtatEcheance = 'expired' | 'soon' | 'valid';

const JOUR_MS = 24 * 60 * 60 * 1000;

/**
 * Le jour CIVIL d'une valeur (`YYYY-MM-DD` ou ISO 8601), en millisecondes UTC à minuit — ou
 * `null` si elle ne se lit pas. Une date seule (`2026-11-03`) est prise telle quelle, sans
 * passer par le fuseau du navigateur : `new Date('2026-11-03')` est minuit UTC, soit la VEILLE
 * au soir à l'ouest de Greenwich.
 */
function jourCivil(valeur: string): number | null {
  const seule = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (seule) return Date.UTC(Number(seule[1]), Number(seule[2]) - 1, Number(seule[3]));
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** L'état de l'échéance `valeur` vue le jour de `maintenant`, ou `null` sans échéance lisible. */
export function etatEcheance(
  valeur: string | null | undefined,
  maintenant: Date = new Date(),
): EtatEcheance | null {
  if (!valeur) return null;
  const echeance = jourCivil(valeur);
  if (echeance === null) return null;
  const aujourdhui = Date.UTC(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  const jours = Math.round((echeance - aujourdhui) / JOUR_MS);
  if (jours <= 0) return 'expired';
  if (jours < SEUIL_ECHEANCE_PROCHE_JOURS) return 'soon';
  return 'valid';
}

/** Demain, en `YYYY-MM-DD` local : la première date d'échéance que l'API accepte au dépôt. */
export function demainIso(maintenant: Date = new Date()): string {
  const d = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() + 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const jj = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${jj}`;
}
