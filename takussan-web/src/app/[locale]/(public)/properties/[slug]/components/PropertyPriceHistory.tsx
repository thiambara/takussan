import { useLocale, useTranslations } from 'next-intl';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { formatDate } from '@/lib/format';
import { formatMontant } from '@/lib/format/currency';
import type { PropertyPriceHistoryItem } from '@/types/property';

interface PropertyPriceHistoryProps {
  history: PropertyPriceHistoryItem[];
}

// TCK-078 — shared helper, XOF default (TCK-084 will swap for multi-currency).
function formatPrice(price: number, currency: string): string {
  return formatMontant(price, currency || 'XOF');
}

/**
 * P06.05 / TCK-721 — la date d'un changement de prix suit la langue de la page (elle était figée
 * en `'fr-FR'`). `useLocale` + `@/lib/format` plutôt que `useFormatteurs()` : ce fichier n'est pas
 * marqué `'use client'`, et cette forme se rend des deux côtés (cf. `PropertyCharacteristics`).
 *
 * ⚠ `dateStyle: undefined` est OBLIGATOIRE à côté de `day`/`month`/`year` : `formatDate` pose
 * `dateStyle: 'medium'` en défaut, et la combinaison lève `TypeError` (cf. `useFormatteurs.ts`).
 */
const DATE_DU_CHANGEMENT = {
  dateStyle: undefined,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
} as const;

export function PropertyPriceHistory({ history }: PropertyPriceHistoryProps) {
  const t = useTranslations('property.detail');
  const localeBrute = useLocale();
  const locale = isLocale(localeBrute) ? localeBrute : DEFAULT_LOCALE;

  if (history.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-foreground">{t('priceHistory')}</h2>
      <ol className="relative border-l border-border ml-2 space-y-4 pl-6">
        {history.map((item) => {
          const diff = item.new_price - item.old_price;
          const Trend = diff < 0 ? TrendingDown : diff > 0 ? TrendingUp : Minus;
          const trendClass =
            diff < 0 ? 'text-success' : diff > 0 ? 'text-destructive' : 'text-muted-foreground';

          return (
            <li key={item.id} className="relative">
              <span className="absolute -left-[29px] top-1 size-3 rounded-full bg-card border-2 border-border" />
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <time className="text-sm text-muted-foreground">{formatDate(item.changed_at, locale, DATE_DU_CHANGEMENT)}</time>
                <div className={`flex items-center gap-1 text-sm font-medium ${trendClass}`}>
                  <Trend className="size-4" aria-hidden />
                  {formatPrice(Math.abs(diff), item.currency)}
                </div>
              </div>
              <p className="text-sm text-foreground">
                <span className="line-through text-muted-foreground">
                  {formatPrice(item.old_price, item.currency)}
                </span>{' '}
                → <span className="font-semibold">{formatPrice(item.new_price, item.currency)}</span>
              </p>
              {item.reason && <p className="text-xs text-muted-foreground mt-0.5">{item.reason}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
