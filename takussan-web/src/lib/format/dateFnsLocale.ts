import { enUS, fr, type Locale as DateFnsLocale } from 'date-fns/locale';

import type { Locale } from '@/i18n/config';

/**
 * La correspondance locale next-intl → locale date-fns, en UN seul endroit (TCK-292, 2026-08-22).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La table vivait en privé dans `src/lib/messages/formatDayLabel.ts`, qui l'employait
 * correctement. Trois autres sites formataient des dates **en français en dur**, sans jamais la
 * voir, et deux d'entre eux échappaient au scanner de `check-i18n.mjs` — un `{ locale: fr }` n'est
 * pas un littéral de texte :
 *
 *   · `src/components/ui/date-picker.tsx`      `format(selected, 'd MMMM yyyy', { locale: fr })`
 *   · `src/components/ui/date-time-picker.tsx` idem, plus un `'à'` français DANS le motif
 *   · `src/components/dashboard/admin/AgencyRevenueSnapshot.tsx` une table de 12 mois écrite à la
 *     main (`janv.`, `févr.`, …), dont le scanner ne voyait que 3 entrées sur 12 — les seules
 *     accentuées.
 *
 * *Une table privée qui a raison n'empêche personne d'avoir tort à côté.* Elle est donc publique,
 * et c'est elle qu'on importe.
 *
 * ⚠️ **`wo` retombe sur `fr`, et ce n'est PAS un oubli** : date-fns ne fournit aucune locale
 * wolof. Un utilisateur wolophone lit donc des noms de mois français — c'est un écart RÉEL, connu,
 * et il n'est pas réparable ici. Il relève de la dette « le formatage suit la locale » ouverte
 * par TCK-347.
 */
export const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = {
  fr,
  en: enUS,
  wo: fr,
};

/**
 * La locale date-fns d'une locale de l'application.
 *
 * Le repli sur `fr` couvre l'appelant qui passe une chaîne venue d'ailleurs (un cookie trafiqué,
 * un paramètre d'URL) : `format()` lève sur une locale `undefined`, et un écran blanc coûte plus
 * cher qu'un nom de mois dans la mauvaise langue.
 */
export function localeDateFns(locale: Locale | string | undefined): DateFnsLocale {
  return DATE_FNS_LOCALES[locale as Locale] ?? fr;
}
