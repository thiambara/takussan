'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';

import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  type FormatDateOptions,
} from '@/lib/format';

/**
 * Les formatteurs de `@/lib/format`, liés à la locale ACTIVE (TCK-364).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `@/lib/format` était déjà là, déjà correct, et déjà piloté par la locale — et la console
 * super-admin ne l'appelait nulle part. Elle portait **18 formatages `'fr-FR'` écrits en dur dans
 * 13 fichiers** (mesuré le 2026-08-27), sous la forme de petites fonctions module-level
 * (`function formatDate(value)`) que rien ne reliait à next-intl. Un super-admin en `en` ou en `wo`
 * lisait donc des dates françaises.
 *
 * *Un utilitaire partagé qui a raison n'empêche personne d'avoir tort à côté* — même motif que
 * `dateFnsLocale.ts` (TCK-292). La cause n'est pas l'absence d'utilitaire, c'est qu'il exige une
 * locale en argument : un helper module-level n'en a pas, et l'auteur écrit `'fr-FR'`.
 *
 * Ce hook supprime l'argument. `const fmt = useFormatteurs()` dans le composant, puis `fmt.date(…)`
 * partout — y compris depuis les tables de colonnes construites dans le corps du composant, qui
 * étaient précisément les sites où le littéral prospérait.
 *
 * ⚠️ La partie pure est {@link formatteursPour} : c'est elle qui se teste sur les trois locales
 * sans rendu. Le hook n'est que la résolution de la locale.
 */

/** Ce qu'on affiche à la place d'une valeur absente — la convention déjà tenue par les 13 helpers. */
export const VALEUR_ABSENTE = '—';

/**
 * `15 janv. 2026` — le format court des tables et des cartes de la console.
 *
 * Il vaut mieux qu'un `dateStyle` : quatre sites l'écrivaient déjà à l'identique, et une table
 * partagée est le seul moyen qu'ils bougent ensemble.
 */
export const DATE_COURTE: FormatDateOptions = { day: '2-digit', month: 'short', year: 'numeric' };

export interface Formatteurs {
  /** La locale effectivement employée, après validation. */
  readonly locale: Locale;
  /** Date seule. `dateStyle: 'medium'` par défaut. */
  readonly date: (
    value: Date | string | number | null | undefined,
    options?: FormatDateOptions,
  ) => string;
  /** Date + heure. `dateStyle: 'medium'` + `timeStyle: 'short'` par défaut. */
  readonly dateTime: (
    value: Date | string | number | null | undefined,
    options?: FormatDateOptions,
  ) => string;
  /** Nombre décimal. */
  readonly nombre: (value: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  /**
   * Montant. Délègue à `formatCurrency` de `@/lib/format`, donc au contrat UX du dépôt
   * (« 150 000 F CFA »), et non à `Intl.NumberFormat({ style: 'currency' })`.
   *
   * ⚠️ Mesuré le 2026-08-27 : sur XOF les deux rendent la MÊME chaîne en `fr`
   * (`Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' })` → `150 000 F CFA`).
   * L'écart n'apparaît que sur les autres devises de l'enum backend (`USD` place le symbole
   * devant), et sur les décimales — d'où le `0` par défaut, qui reconduit le
   * `maximumFractionDigits: 0` des sites remplacés.
   */
  readonly montant: (
    value: number | null | undefined,
    currency?: string | null,
    options?: Intl.NumberFormatOptions,
  ) => string;
}

/**
 * Les champs « composants » d'`Intl.DateTimeFormat` — ceux qui s'excluent mutuellement avec
 * `dateStyle` / `timeStyle`.
 *
 * ⚠️ **Le piège qui a fait rougir `AgencyModerationCard` :** `formatDate` de `@/lib/format` pose
 * `dateStyle: 'medium'` en défaut PUIS étale les options de l'appelant. Passer `{ day, month,
 * year }` produit donc `{ dateStyle: 'medium', day, month, year }` — combinaison que la norme
 * INTERDIT, et qui lève `TypeError: Invalid option : option` à l'exécution. Ni `tsc` ni ESLint ne
 * la voient : les deux formes sont typées sur le même `Intl.DateTimeFormatOptions`.
 *
 * Mesuré le 2026-08-27 : un `dateStyle: undefined` EXPLICITE est traité comme absent
 * (`GetOption` de la norme), pas comme une valeur invalide. C'est ce qui permet d'annuler le
 * défaut sans toucher à `@/lib/format`.
 */
const CHAMPS_COMPOSANTS = [
  'weekday', 'era', 'year', 'month', 'day',
  'hour', 'minute', 'second', 'dayPeriod', 'fractionalSecondDigits',
] as const satisfies readonly (keyof Intl.DateTimeFormatOptions)[];

function sansStyleParDefaut(options?: FormatDateOptions): FormatDateOptions | undefined {
  if (!options) return options;
  if (!CHAMPS_COMPOSANTS.some((champ) => options[champ] !== undefined)) return options;
  return { dateStyle: undefined, timeStyle: undefined, ...options };
}

/**
 * La partie PURE — construit les formatteurs d'une locale donnée.
 *
 * Testable sans rendu ni provider, ce qui est le seul moyen d'écrire l'assertion qui compte :
 * la même date rendue dans `fr`, `en` et `wo` donne **trois chaînes différentes**.
 */
export function formatteursPour(locale: Locale): Formatteurs {
  return {
    locale,
    date: (value, options) => {
      const sortie = formatDate(value, locale, sansStyleParDefaut(options));
      return sortie === '' ? VALEUR_ABSENTE : sortie;
    },
    dateTime: (value, options) => {
      const sortie = formatDateTime(value, locale, sansStyleParDefaut(options));
      return sortie === '' ? VALEUR_ABSENTE : sortie;
    },
    nombre: (value, options) => {
      const sortie = formatNumber(value, locale, options);
      return sortie === '' ? VALEUR_ABSENTE : sortie;
    },
    montant: (value, currency, options) => {
      const sortie = formatCurrency(value, locale, {
        currency: currency ?? 'XOF',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        ...options,
      });
      return sortie === '' ? VALEUR_ABSENTE : sortie;
    },
  };
}

/**
 * Les formatteurs liés à la locale next-intl active.
 *
 * Le repli sur {@link DEFAULT_LOCALE} couvre l'appelant dont la locale vient d'ailleurs (cookie
 * trafiqué, paramètre d'URL) : `@/lib/format` retomberait de toute façon sur `fr-SN`, autant que
 * le type le dise.
 */
export function useFormatteurs(): Formatteurs {
  const locale = useLocale();
  return useMemo(
    () => formatteursPour(isLocale(locale) ? locale : DEFAULT_LOCALE),
    [locale],
  );
}
