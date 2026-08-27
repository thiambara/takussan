import { TIMEZONE, type Locale } from '@/i18n/config';
import { formatCurrency as formatCurrencyCustom } from './format/currency';

/**
 * Locale-aware formatters wrapping {@link Intl.DateTimeFormat} and
 * {@link Intl.NumberFormat}. Always default to `Africa/Dakar` for dates and
 * to XOF (CFA franc) for currency — the Senegal defaults — while letting
 * callers override when needed.
 *
 * Kept dependency-light: the currency helper lives in ./format/currency.
 * Both Server and Client Components import this module safely.
 */

/**
 * La correspondance « locale de l'application → étiquette BCP-47 des API `Intl` », en UN seul
 * endroit — et c'est le point du module.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI `wo` REND DU `fr-SN`, ET CE QUE LE COMMENTAIRE PRÉCÉDENT AFFIRMAIT DE FAUX
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce fichier portait DEUX tables — une pour les nombres et les dates, une pour les montants — et
 * elles ne disaient pas la même chose de `wo`. Celle des nombres passait `['wo', 'fr-SN']` sous ce
 * docblock :
 *
 *   > « Wolof (`wo`) isn't shipped in CLDR for most runtimes […] Passing an array lets us force an
 *   >   explicit fallback to `fr-SN`. »
 *
 * **Mesuré le 2026-08-27 sur Node v24.18.0, les deux moitiés sont fausses** :
 *
 *     Intl.NumberFormat.supportedLocalesOf(['wo'])              → ["wo"]
 *     new Intl.NumberFormat(['wo','fr-SN']).resolvedOptions()   → { locale: 'wo', … }
 *
 * `wo` EST servi par l'ICU embarqué, donc le tableau n'atteint **jamais** son second élément : un
 * tableau n'est pas une chaîne de repli, c'est une liste de préférences, et la première prise est
 * la bonne. *Un mécanisme de repli qui n'est jamais atteint ne se voit pas rougir : il se voit à
 * l'écran, des mois plus tard.*
 *
 * Ce que rendait réellement `wo`, et pourquoi c'était un défaut visible plutôt qu'une nuance :
 *
 *                       `wo` (ICU réel)     `fr-SN`            source
 *     nombre            1.234.567,89        1 234 567,89       toIntlLocale  ← divergeait
 *     montant XOF       F CFA 150.000       150 000 F CFA      toCurrencyLocale (déjà `fr-SN`)
 *     date `medium`     14 Mar, 2026        14 mars 2026       toIntlLocale  ← divergeait
 *     mois de l'axe     —                   mars               date-fns (`DATE_FNS_LOCALES`)
 *
 * Trois modules, trois conventions, **dans la même carte**. Le défaut dormait tant que les tableaux
 * de bord passaient `'fr'` EN DUR ; TCK-374 les a portés sur la locale ACTIVE, et l'a réveillé.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LE CHOIX, ET CE QUI L'IMPOSE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `wo` → `fr-SN`, aligné sur `toCurrencyLocale` (qui avait raison) et sur `DATE_FNS_LOCALES`
 * (`wo: fr`). Ce n'est pas « le plus simple », c'est le seul choix ATTEIGNABLE :
 *
 *   1. **date-fns ne fournit AUCUNE locale wolof** (cf. `./format/dateFnsLocale.ts`). Un `wo` réel
 *      côté `Intl` ne peut donc pas être suivi par les dates de `date-picker`, `date-time-picker`
 *      ni de `AgencyRevenueSnapshot` : il produirait une incohérence de plus, pas une de moins.
 *   2. **Les données CLDR de `wo` ne sont pas sénégalaises sur ce qui compte ici** : séparateur de
 *      milliers `.` (Sénégal écrit l'espace), et une date `medium` de forme anglaise
 *      (`14 Mar, 2026`), à quoi `wo-SN` ne change rien — mesuré, il rend exactement la même chose.
 *   3. **`wo` n'est pas garanti par le runtime.** Sa présence dépend de la build ICU : un Node
 *      `small-icu` ou un navigateur ancien replie sur la racine (formatage anglais), là où `fr-SN`
 *      est servi partout où le français l'est. Le rendu SERVEUR et le rendu CLIENT de Next
 *      cesseraient alors de coïncider — et une divergence d'hydratation sur un montant est le genre
 *      de défaut qu'on ne reproduit jamais sur la machine qui l'a écrit.
 *
 * ⚠️ **Ce n'est pas une décision définitive, c'est la dette déjà ouverte.** Un utilisateur
 * wolophone lit des noms de mois français : c'est un écart RÉEL, connu, et il est porté par
 * TCK-347 (« le formatage suit la locale »), pas réparable ici. Le jour où il se traite, il se
 * traite dans les TROIS modules à la fois — c'est précisément ce que deux tables séparées
 * rendaient impossible.
 */
const ETIQUETTES_INTL: Record<Locale, string> = {
  fr: 'fr-SN',
  en: 'en-GB',
  wo: 'fr-SN',
};

/** L'étiquette de repli, pour une locale venue d'ailleurs (cookie trafiqué, paramètre d'URL). */
const ETIQUETTE_PAR_DEFAUT = 'fr-SN';

/**
 * L'étiquette BCP-47 d'une locale de l'application.
 *
 * ⚠️ Le type dit `Locale`, le runtime ne le garantit pas : la valeur descend d'un cookie et d'une
 * URL. Le `??` couvre le cas où la clé n'est pas dans la table — sans lui, `Intl` recevrait
 * `undefined` et suivrait la locale de la MACHINE, ce qui est le défaut que
 * `scripts/check-locale-figee.mjs` refuse partout ailleurs.
 */
function toIntlLocale(locale: Locale): string {
  return ETIQUETTES_INTL[locale] ?? ETIQUETTE_PAR_DEFAUT;
}

export interface FormatDateOptions extends Intl.DateTimeFormatOptions {
  /** BCP-47 timezone. Defaults to {@link TIMEZONE}. */
  readonly timeZone?: string;
}

/**
 * Format a date value using the given locale. Accepts Date, ISO string or
 * epoch millis. Returns an empty string for `null`/`undefined` so callers
 * can drop it straight into JSX.
 */
export function formatDate(
  value: Date | string | number | null | undefined,
  locale: Locale,
  options: FormatDateOptions = {},
): string {
  if (value === null || value === undefined || value === '') return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const { timeZone = TIMEZONE, ...rest } = options;
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: 'medium',
    timeZone,
    ...rest,
  }).format(date);
}

/**
 * Format a date and time (defaults to medium date + short time).
 */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale: Locale,
  options: FormatDateOptions = {},
): string {
  return formatDate(value, locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  });
}

/**
 * Format a number using the given locale. Leaves `null`/`undefined`
 * untouched so callers can guard in the JSX.
 */
export function formatNumber(
  value: number | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return new Intl.NumberFormat(toIntlLocale(locale), options).format(value);
}

/**
 * Format a monetary amount in F CFA (XOF) by default, using the Senegalese
 * French number conventions. Delegates to the multi-currency helper so the
 * output matches the UX spec contract (e.g. "150 000 F CFA").
 *
 * For non-XOF currencies, import {@link formatCurrencyCustom} directly.
 */
export function formatCurrency(
  value: number | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  const currency = typeof options.currency === 'string' ? options.currency : 'XOF';
  return formatCurrencyCustom(value, currency, {
    locale: toIntlLocale(locale),
    minimumFractionDigits: options.minimumFractionDigits as number | undefined,
    maximumFractionDigits: options.maximumFractionDigits as number | undefined,
  });
}

/**
 * Format a percentage using the given locale. Expects a fraction (`0.12`
 * → `12 %` in French locale).
 */
export function formatPercent(
  value: number | null | undefined,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return formatNumber(value, locale, {
    style: 'percent',
    maximumFractionDigits: 2,
    ...options,
  });
}
