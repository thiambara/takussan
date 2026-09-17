import type { Locale } from '@/i18n/config';
import { formatDate } from '@/lib/format';

/** Ce que l'API rend pour un mois de série temporelle : `2025-10`. */
const MOIS_ISO = /^(\d{4})-(\d{2})$/;

/**
 * Une abscisse `AAAA-MM` rendue en mois abrégé + année, dans la locale ACTIVE (TCK-532).
 *
 * ⚠ Trouvé par la vérification adverse de TCK-532 (2026-09-16) : les trois `LineChart` de
 * `/app/overview` affichaient les mois tels que l'API les rend — `2025-10` — dans toutes les
 * locales. Le formatage passe par `@/lib/format` (`check-locale-figee`) : `oct. 2025` en `fr` et
 * en `wo` (même étiquette Intl, cf. `ETIQUETTES_INTL`), `Oct 2025` en `en`.
 *
 * Le 15 à midi UTC plutôt que le 1er à minuit : aucun fuseau ne fait basculer ce jour-là dans le
 * mois voisin. `dateStyle: undefined` annule le défaut de `formatDate`, incompatible avec
 * `month`/`year` (cf. `useFormatteurs.ts`). Une valeur qui n'a pas la forme `AAAA-MM` est rendue
 * telle quelle — l'axe n'invente pas une date.
 */
export function etiquetteMois(valeur: string, locale: Locale): string {
  const m = MOIS_ISO.exec(valeur);
  if (!m) return valeur;
  const mois = Number(m[2]);
  if (mois < 1 || mois > 12) return valeur;
  return formatDate(new Date(Date.UTC(Number(m[1]), mois - 1, 15, 12)), locale, {
    dateStyle: undefined,
    month: 'short',
    year: 'numeric',
  });
}
