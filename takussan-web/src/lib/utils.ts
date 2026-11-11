import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import { formatMontant } from "./format/currency"
import {
  ESPACEMENTS_DE_LETTRES,
  OMBRES,
  POINTS_DE_RUPTURE,
  TAILLES_DE_TEXTE,
  TAILLES_FIXES,
} from "./jetons-de-l-app"

/**
 * TCK-2685 — la fusion connaît les jetons de la partie connectée (`globals.css`, bloc
 * `jetons-de-l-app`). Sans eux, `text-ui` était lu comme une couleur et jeté par un
 * `text-foreground` voisin (cf. `src/lib/jetons-de-l-app.ts`).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: Object.keys(TAILLES_DE_TEXTE),
      tracking: [...ESPACEMENTS_DE_LETTRES],
      spacing: [...TAILLES_FIXES],
      shadow: [...OMBRES],
      breakpoint: [...POINTS_DE_RUPTURE],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// TCK-078 — delegate to the single currency helper. New call sites should
// import `formatMontant` from `@/lib/format/currency` directly; this
// wrapper stays for source-compat with existing imports.
export function formatPrice(amount: number, currency = 'XOF', locale = 'fr-SN'): string {
  return formatMontant(amount, currency, { locale });
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
