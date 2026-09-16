'use client';

import { ArrowRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { formatCurrency, formatDate } from '@/lib/format';
import type { PropertyPriceHistoryItem } from '@/types/property';

/** Les codes de `PriceChangeReason` (API) — ceux-là seuls ont un libellé. */
const RAISONS_NOMMEES = new Set([
  'market_adjustment',
  'negotiation',
  'renovation',
  'urgent_sale',
  'seasonal',
  'correction',
]);

interface Props {
  readonly entries: readonly PropertyPriceHistoryItem[];
  /** Libellé d'une date absente — déjà traduit par l'appelant, dont l'espace de noms diffère. */
  readonly unknownDateLabel: string;
}

/**
 * Une évolution de prix par ligne — partagée par l'aperçu (5 dernières) et l'onglet Historique.
 *
 * Les deux listes étaient recopiées l'une de l'autre et rendaient la date en ISO brut
 * (`2026-09-02`) et la raison en CODE (`market_adjustment`) : l'API émet des codes, le front
 * possède le texte. Les montants restent en `fr`, comme dans la liste des biens ; chiffres en
 * `tabular-nums` pour qu'ils s'alignent d'une ligne à l'autre.
 */
export function PropertyPriceHistoryList({ entries, unknownDateLabel }: Props) {
  const tReason = useTranslations('property.priceChangeReasons');
  const brute = useLocale();
  const locale = isLocale(brute) ? brute : DEFAULT_LOCALE;

  return (
    <ol className="mt-4 divide-y divide-muted text-sm">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
        >
          <span className="text-muted-foreground tabular-nums">
            {entry.changed_at ? formatDate(entry.changed_at, locale) : unknownDateLabel}
          </span>
          <span className="inline-flex flex-wrap items-center justify-end gap-x-1.5 font-medium text-foreground tabular-nums">
            <span className="whitespace-nowrap text-muted-foreground">
              {formatCurrency(entry.old_price, 'fr', { currency: entry.currency })}
            </span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">→</span>
            <span className="whitespace-nowrap">
              {formatCurrency(entry.new_price, 'fr', { currency: entry.currency })}
            </span>
          </span>
          {entry.reason ? (
            <span className="basis-full text-xs text-muted-foreground">
              {RAISONS_NOMMEES.has(entry.reason) ? tReason(entry.reason) : entry.reason}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
