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
