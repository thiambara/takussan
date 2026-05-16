import { format, isSameDay, isSameYear, subDays } from 'date-fns';
import { enUS, fr, type Locale as DateFnsLocale } from 'date-fns/locale';
import type { Locale } from '@/i18n/config';

const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = {
  fr,
  en: enUS,
  wo: fr,
};

export type DayLabelLabels = {
  today: string;
  yesterday: string;
};

function capitalize(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Formats a date as a chat day-separator label.
 *
 * - same day as `now` → `labels.today`
 * - one day before `now` → `labels.yesterday`
 * - same calendar year → e.g. `Lun. 3 mai`
 * - otherwise → e.g. `3 mai 2025`
 */
export function formatDayLabel(
  date: Date,
  locale: Locale,
  labels: DayLabelLabels,
  now: Date = new Date(),
): string {
  if (isSameDay(date, now)) return labels.today;
  if (isSameDay(date, subDays(now, 1))) return labels.yesterday;

  const dfLocale = DATE_FNS_LOCALES[locale] ?? fr;

  if (isSameYear(date, now)) {
    return capitalize(format(date, 'EEE d MMM', { locale: dfLocale }));
  }

  return capitalize(format(date, 'd MMMM yyyy', { locale: dfLocale }));
}
