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

export function useCurrentLocale(): Locale {
  return useLocale() as Locale;
}
