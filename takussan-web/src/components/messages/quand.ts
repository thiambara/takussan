import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';

/**
 * TCK-2632 — l'heure d'une rangée de la liste, comme une messagerie de téléphone (maquette
 * `app-messagerie`, « 13:22 · Hier · lun. · 7 nov. ») : l'heure aujourd'hui, « Hier » la veille, le
 * jour de la semaine dans les six jours, la date courte au-delà (avec l'année si elle diffère).
 *
 * Le jour se juge à `Africa/Dakar`, le fuseau figé du produit, qui est UTC sans heure d'été : la
 * date ISO en UTC est donc la date de Dakar.
 */
export function quandDansLaListe(
  iso: string | null | undefined,
  locale: Locale,
  hier: string,
  maintenant: Date = new Date(),
): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const jour = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const ecart = Math.round((jour(maintenant) - jour(date)) / 86_400_000);
  if (ecart <= 0) return formatDate(date, locale, { dateStyle: undefined, hour: '2-digit', minute: '2-digit' });
  if (ecart === 1) return hier;
  if (ecart < 7) return formatDate(date, locale, { dateStyle: undefined, weekday: 'short' });
  return formatDate(date, locale, {
    dateStyle: undefined,
    day: 'numeric',
    month: 'short',
    ...(date.getUTCFullYear() !== maintenant.getUTCFullYear() ? { year: 'numeric' } : {}),
  });
}
