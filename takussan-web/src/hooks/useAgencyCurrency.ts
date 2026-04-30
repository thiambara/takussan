'use client';

import { useMemo } from 'react';
import {
  CURRENCY_METADATA,
  currencySymbol,
  formatCurrency,
  type CurrencyCode,
  type FormatCurrencyOptions,
} from '@/lib/format/currency';
import { useApiQuery } from '@/hooks/useApiQuery';

/**
 * TCK-084 — fetch (and cache) an agency's default currency, then expose a
 * pre-bound formatter so callers can render amounts without re-stating the
 * currency every time.
 *
 * The endpoint is `GET /api/agencies/{id}` with sparse fields — we only need
 * `id` and `currency`, so we pass them through `fields[agencies]` to avoid
 * the resource hauling its full payload over the wire (CLAUDE.md "API —
 * Conventions frontend" rule 1).
 *
 * If the call fails or the agency is still loading, the hook surfaces XOF as
 * a safe fallback. Callers that care about the loading state can read the
 * returned `isLoading` flag.
 */
export interface UseAgencyCurrencyResult {
  readonly currency: CurrencyCode;
  readonly symbol: string;
  readonly formatter: (amount: number | null | undefined, options?: FormatCurrencyOptions) => string;
  readonly isLoading: boolean;
}

interface AgencyCurrencyEnvelope {
  data: {
    id: number;
    currency?: string;
  };
}

function normaliseCurrency(value: string | undefined | null): CurrencyCode {
  if (!value) return 'XOF';
  const upper = value.toUpperCase();
  return (upper in CURRENCY_METADATA ? upper : 'XOF') as CurrencyCode;
}

export function useAgencyCurrency(
  agencyId: number | null | undefined,
): UseAgencyCurrencyResult {
  const enabled = typeof agencyId === 'number' && agencyId > 0;

  const query = useApiQuery<AgencyCurrencyEnvelope>(
    ['agency-currency', agencyId ?? 'none'],
    `/api/agencies/${agencyId ?? 0}`,
    {
      enabled,
      params: { fields: { agencies: 'id,currency' } },
      // The currency rarely changes; keep it cached for 5 minutes.
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: false,
    },
  );

  const currency = normaliseCurrency(query.data?.data?.currency);

  const formatter = useMemo(
    () =>
      (amount: number | null | undefined, options?: FormatCurrencyOptions) =>
        formatCurrency(amount, currency, options),
    [currency],
  );

  return {
    currency,
    symbol: currencySymbol(currency),
    formatter,
    isLoading: enabled && query.isLoading,
  };
}
