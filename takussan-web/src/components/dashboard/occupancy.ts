import { formatPercent } from '@/lib/format';
import type { Locale } from '@/i18n/config';

/**
 * P93.05 (TCK-1114) — le taux d'occupation longue durée arrive en points (0..100), ou `null`
 * quand le périmètre n'a aucun bien éligible : il n'a alors pas de dénominateur, comme
 * `short_stay_percent` (TCK-595). « Rien à occuper » s'affiche en tiret, jamais en « 0 % »,
 * qui dirait « tout est vacant ».
 */
export function formatOccupancyRate(ratePercent: number | null | undefined, locale: Locale): string {
  return ratePercent === null || ratePercent === undefined ? '—' : formatPercent(ratePercent / 100, locale);
}
