'use client';

import { useFormatter, useLocale } from 'next-intl';
import { useCallback } from 'react';
import type { Locale } from './config';

/**
 * Format a date as `dd/MM/yyyy` in the active locale with Africa/Dakar timezone
 * (configured by `next-intl` provider). Returns an empty string for falsy
 * inputs so it's safe to call with API values that may be null.
 */
export function useFormatDate() {
  const formatter = useFormatter();
  return useCallback(
    (value: Date | string | number | null | undefined) => {
      if (value === null || value === undefined || value === '') return '';
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return formatter.dateTime(date, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    },
    [formatter],
  );
}

/**
 * Format a number using the active locale (space as thousands separator for
 * French/Wolof, comma for English — both driven by the ICU locale rules).
 *
 * Pass `{ currency: 'XOF' }` to format as a currency. Defaults to decimal.
 */
export function useFormatNumber() {
  const formatter = useFormatter();
  return useCallback(
    (
      value: number | null | undefined,
      options?: { currency?: string; maximumFractionDigits?: number },
    ) => {
      if (value === null || value === undefined || Number.isNaN(value)) return '';
      if (options?.currency) {
        return formatter.number(value, {
          style: 'currency',
          currency: options.currency,
          maximumFractionDigits: options.maximumFractionDigits ?? 0,
        });
      }
      return formatter.number(value, {
        maximumFractionDigits: options?.maximumFractionDigits ?? 0,
      });
    },
    [formatter],
  );
}

export function useCurrentLocale(): Locale {
  return useLocale() as Locale;
}
