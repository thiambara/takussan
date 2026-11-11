import type { PaymentHistoryRow } from '@/types/invoice';

/**
 * TCK-2659 — la lecture PURE d'une ligne d'encaissement : la période qu'elle règle, son jour, le
 * groupement par jour du téléphone. Sans rendu ni traduction : les composants passent la clé rendue
 * ici à `useTranslations('admin.finances.argent.periode')`.
 */

/** Les types d'échéance de bail qui règlent UN mois (« Loyer de novembre »). */
const TYPES_MENSUELS = new Set(['rent', 'charges', 'penalty']);
/** Les autres types de bail, nommés sans mois. */
const TYPES_DE_BAIL = new Set(['deposit', 'deposit_refund', 'regularization']);
/** Les types d'un paiement de réservation (`BookingPaymentType`). */
const TYPES_DE_RESERVATION = new Set(['deposit', 'advance', 'fee']);

export interface PeriodeLue {
  /** La clé sous `admin.finances.argent.periode`. */
  readonly cle: string;
  /** Le mois réglé (date ISO de son premier jour), quand la clé en prend un. */
  readonly mois?: string;
}

/**
 * « Loyer de novembre », « Caution », « Réservation · acompte » : ce que la ligne règle, lu de
 * `source`, `payment_type` et `period_start` — jamais de l'identifiant d'une entité (« Bail #8 »).
 */
export function periodeDe(row: Pick<PaymentHistoryRow, 'source' | 'payment_type' | 'period_start' | 'due_date'>): PeriodeLue {
  const type = row.payment_type ?? '';
  if (row.source === 'booking') {
    return { cle: TYPES_DE_RESERVATION.has(type) ? `reservation.${type}` : 'reservation.autre' };
  }
  if (TYPES_MENSUELS.has(type)) {
    const debut = row.period_start ?? row.due_date ?? null;
    return debut ? { cle: `${type}Du`, mois: debut } : { cle: type };
  }
  if (TYPES_DE_BAIL.has(type)) return { cle: type };
  return { cle: 'autre' };
}

/** Le jour (`AAAA-MM-JJ`) d'une ligne, au fuseau de Dakar (UTC+0) : celui de `date`. */
export function jourDe(row: Pick<PaymentHistoryRow, 'date' | 'paid_at'>): string | null {
  const brut = row.date ?? row.paid_at;
  return brut ? brut.slice(0, 10) : null;
}

/**
 * Aujourd'hui et hier (`AAAA-MM-JJ`), au fuseau de Dakar (UTC+0, sans heure d'été) : ce qui nomme
 * « Aujourd'hui » et « Hier » dans le registre. Appelé PENDANT le rendu (le registre, la ligne) : le
 * serveur et le client peuvent donc lire deux jours différents autour de minuit, et la phrase changer à
 * l'hydratation — accepté, le mot suit le jour réel du lecteur. `maintenant` sert aux tests.
 */
export function joursRecents(maintenant: Date = new Date()): { readonly aujourdhui: string; readonly hier: string } {
  return {
    aujourdhui: maintenant.toISOString().slice(0, 10),
    hier: new Date(maintenant.getTime() - 86_400_000).toISOString().slice(0, 10),
  };
}

/** Une ligne portée par l'API à minuit pile n'a pas d'heure : ne pas en inventer une (« 00:00 »). */
export function aUneHeure(valeur: string | null | undefined): boolean {
  if (!valeur || valeur.length <= 10) return false;
  return !/T00:00:00(\.0+)?(Z|[+-]00:?00)?$/.test(valeur);
}

export interface JourDEncaissements {
  readonly jour: string | null;
  readonly lignes: readonly PaymentHistoryRow[];
  /**
   * Le total ENCAISSÉ du jour (`paid_amount` des lignes), ou `null` quand la page ne porte peut-être
   * pas tout le jour : le premier jour d'une page qui n'est pas la première, le dernier d'une page
   * qui a une suite. Un total partiel affiché comme celui du jour serait faux sans le dire.
   */
  readonly total: number | null;
}

export function grouperParJour(
  rows: readonly PaymentHistoryRow[],
  page: { readonly courante: number; readonly derniere: number },
): readonly JourDEncaissements[] {
  const groupes: { jour: string | null; lignes: PaymentHistoryRow[] }[] = [];
  for (const row of rows) {
    const jour = jourDe(row);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === jour) dernier.lignes.push(row);
    else groupes.push({ jour, lignes: [row] });
  }
  return groupes.map((g, i) => {
    const coupeAvant = i === 0 && page.courante > 1;
    const coupeApres = i === groupes.length - 1 && page.courante < page.derniere;
    return {
      ...g,
      total: coupeAvant || coupeApres ? null : g.lignes.reduce((s, l) => s + (l.paid_amount ?? 0), 0),
    };
  });
}

/**
 * La variation de l'encaissé sur le mois d'avant, en FRACTION (0,082 → « +8,2 % »), ou `null` quand
 * le mois d'avant n'a rien encaissé : une hausse « infinie » ne se dit pas en pourcentage.
 */
export function variationSurLeMoisPrecedent(montant: number, precedent: number): number | null {
  if (!(precedent > 0)) return null;
  return (montant - precedent) / precedent;
}

/** Les initiales d'un nom affiché (« Aïda Diop » → « AD », « Sahel Transit SARL » → « ST »). */
export function initialesDuNom(nom: string | null | undefined): string {
  const mots = (nom ?? '').trim().split(/\s+/).filter(Boolean);
  const lettres = mots.slice(0, 2).map((m) => Array.from(m)[0] ?? '');
  return lettres.join('').toLocaleUpperCase('fr') || '·';
}
