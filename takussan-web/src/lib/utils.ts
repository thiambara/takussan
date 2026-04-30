import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatCurrency } from "./format/currency"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// TCK-078 — delegate to the single currency helper. New call sites should
// import `formatCurrency` from `@/lib/format/currency` directly; this
// wrapper stays for source-compat with existing imports.
export function formatPrice(amount: number, currency = 'XOF', locale = 'fr-SN'): string {
  return formatCurrency(amount, currency, { locale });
}

export function formatDate(date: string | Date, locale = 'fr-SN'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatRelativeDate(date: string | Date): string {
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  const diffMs = new Date(date).getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (Math.abs(diffDays) < 1) return "aujourd'hui";
  if (Math.abs(diffDays) < 7) return rtf.format(diffDays, 'day');
  if (Math.abs(diffDays) < 30) return rtf.format(Math.round(diffDays / 7), 'week');
  return rtf.format(Math.round(diffDays / 30), 'month');
}
