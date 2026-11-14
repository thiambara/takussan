import type { Locale } from '@/i18n/config';
import { formatDate } from '@/lib/format';

/**
 * TCK-2801 — la période de « Rapports » en mois longs (« Du 1 au 30 novembre 2026 », maquette `PERIODE`), là
 * où la page écrivait « Du 1 nov. 2026 au 30 nov. 2026 ». Dans un même mois, la première borne se réduit à
 * son jour ; sinon chacune est entière. Le fuseau est celui de `formatDate` (Africa/Dakar).
 */
export function bornesLisibles(debut: string, fin: string, locale: Locale): { readonly debut: string; readonly fin: string } {
  const long = { dateStyle: undefined, day: 'numeric', month: 'long', year: 'numeric' } as const;
  const memeMois = formatDate(debut, locale, { dateStyle: undefined, month: 'numeric', year: 'numeric' }) === formatDate(fin, locale, { dateStyle: undefined, month: 'numeric', year: 'numeric' });
  return {
    debut: memeMois ? formatDate(debut, locale, { dateStyle: undefined, day: 'numeric' }) : formatDate(debut, locale, long),
    fin: formatDate(fin, locale, long),
  };
}

/**
 * Le mois en cours au fuseau de Dakar (UTC+0, sans heure d'été) : celui que les lectures de la vue d'ensemble
 * rendent dans `period` (`startOfMonth`/`endOfMonth` côté API). La tête de page, commune à tous les onglets,
 * le dit sans relire un tableau de bord.
 */
export function moisCourant(maintenant: Date = new Date()): { readonly debut: string; readonly fin: string } {
  const a = maintenant.getUTCFullYear();
  const m = maintenant.getUTCMonth();
  const dernier = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  const mm = String(m + 1).padStart(2, '0');
  return { debut: `${a}-${mm}-01`, fin: `${a}-${mm}-${String(dernier).padStart(2, '0')}` };
}

/**
 * TCK-2791 — la période servie par les tableaux de bord (`period` de l'API) : le mois en cours, ou le mois dernier.
 * Une liste FERMÉE : l'adresse (`?period=…`) n'est jamais transmise telle quelle, toute autre valeur vaut le mois
 * en cours — l'API rendrait 422, et la vue d'ensemble n'en rattrape aucun.
 */
export type PeriodeDesRapports = 'current_month' | 'last_month';

export const PERIODES_DES_RAPPORTS: readonly PeriodeDesRapports[] = ['current_month', 'last_month'];

export function periodeTransmise(valeur: string | string[] | null | undefined): PeriodeDesRapports {
  return valeur === 'last_month' ? 'last_month' : 'current_month';
}

/** L'adresse de la vue d'ensemble avec sa période : le mois en cours n'écrit rien (l'adresse d'avant). */
export function avecLaPeriode(href: string, periode: PeriodeDesRapports): string {
  if (periode === 'current_month') return href;
  return `${href}${href.includes('?') ? '&' : '?'}period=${periode}`;
}

/**
 * TCK-2791 — le mois EN COURS (`AAAA-MM`) vu par la réponse, et non par l'horloge du navigateur : sous le mois en
 * cours, celui de `period.start` ; sous « Mois dernier », le mois qui le suit. C'est lui qui n'est pas clos — la
 * variation ne se calcule jamais sur lui —, quel que soit le mois servi.
 */
export function moisEnCoursDeLaReponse(periode: { readonly start: string; readonly key?: string }): string {
  const servi = periode.start.slice(0, 7);
  if (periode.key !== 'last_month') return servi;
  const [a, m] = servi.split('-').map(Number);
  const suivant = new Date(Date.UTC(a!, m!, 1));
  return `${suivant.getUTCFullYear()}-${String(suivant.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Le mois dernier au fuseau de Dakar (UTC+0) : celui que `period=last_month` rend dans `period`. */
export function moisPrecedent(maintenant: Date = new Date()): { readonly debut: string; readonly fin: string } {
  return moisCourant(new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - 1, 1)));
}
