import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"
import type { Locale } from "@/i18n/config"
import { formatCurrency } from "./format"
import {
  DENSITE_DE_L_APP,
  ESPACEMENTS_DE_LETTRES,
  PRIMITIVES_DE_L_APP,
  OMBRES,
  POINTS_DE_RUPTURE,
  TAILLES_DE_TEXTE,
  TAILLES_FIXES,
} from "./jetons-de-l-app"

/**
 * TCK-2685 — la fusion connaît les jetons de la partie connectée (`globals.css`, bloc
 * `jetons-de-l-app`). Sans eux, `text-ui` était lu comme une couleur et jeté par un
 * `text-foreground` voisin (cf. `src/lib/jetons-de-l-app.ts`).
 * TCK-2686 — et les jetons de l'échelle de densité (`DENSITE_DE_L_APP`) : `cn('h-controle', 'h-11')`
 * rend `h-11` seul, la hauteur de l'appelant l'emporte sur celle de la portée `/app`.
 * TCK-2687 — et ceux des primitives (`PRIMITIVES_DE_L_APP`) : le repli de l'avatar.
 * TCK-2690 — et le bord/la piste des contrôles neufs (`controle-vide`), le rayon de la case (`rounded-case`).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...Object.keys(TAILLES_DE_TEXTE), ...DENSITE_DE_L_APP.text, ...PRIMITIVES_DE_L_APP.text],
      tracking: [...ESPACEMENTS_DE_LETTRES],
      spacing: [...TAILLES_FIXES, ...DENSITE_DE_L_APP.spacing, ...PRIMITIVES_DE_L_APP.spacing],
      shadow: [...OMBRES],
      breakpoint: [...POINTS_DE_RUPTURE],
      radius: [...DENSITE_DE_L_APP.radius, ...PRIMITIVES_DE_L_APP.radius],
      leading: [...DENSITE_DE_L_APP.leading],
      color: [...DENSITE_DE_L_APP.color, ...PRIMITIVES_DE_L_APP.color],
      "font-weight": [...DENSITE_DE_L_APP["font-weight"]],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// TCK-078 — delegate to the single currency helper. New call sites should
// use `useFormatteurs().montant` (`@/lib/format/useFormatteurs`); this wrapper stays for the
// property cards and the search chips.
//
// TCK-347 — la locale est OBLIGATOIRE, et c'est une `Locale` de l'application (`fr`/`en`/`wo`),
// plus une étiquette BCP-47 : le défaut `'fr-SN'` rendait chaque carte de bien en français sous
// `en`, et accepter une étiquette aurait envoyé `'wo'` brut à `Intl`, hors du repli explicite
// `wo → 'fr-SN'` d'`ETIQUETTES_INTL`. En `fr`, la chaîne est la même qu'avant, caractère pour
// caractère (`formatCurrency` → `formatMontant(…, { locale: 'fr-SN' })`).
export function formatPrice(amount: number, currency: string, locale: Locale): string {
  return formatCurrency(amount, locale, { currency });
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
