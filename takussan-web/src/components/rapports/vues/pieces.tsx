import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Locale } from '@/i18n/config';
import { formatDate, formatNumber } from '@/lib/format';

/**
 * TCK-2628 — les pièces des vues de « Rapports », sorties telles quelles de `overview/agent/page.tsx` et
 * `overview/owner/page.tsx` quand leurs corps sont devenus des onglets.
 */
export function BlocDeRapport({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-5">
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function LienChiffre({
  href,
  label,
  value,
  locale,
}: {
  readonly href: string;
  readonly label: string;
  readonly value: number;
  readonly locale: Locale;
}) {
  return (
    <Link
      href={href}
      className="mb-2 flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-sm outline-none transition-colors last:mb-0 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring"
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground tabular-nums">{formatNumber(value, locale)}</span>
    </Link>
  );
}

export function BlocVide({ message }: { readonly message: string }) {
  return <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{message}</p>;
}

/**
 * La période d'une vue, en clair, sous la barre d'onglets (le titre de la page est « Rapports »). TCK-2801 —
 * `periode` : la ligne de période, que la description de la tête dit dès `md` (maquette : au bureau dans la
 * tête, au téléphone dans la page) ; sans lui, un message (échec de lecture) qui se lit à toute largeur.
 */
export function PeriodeDuRapport({ children, periode = false }: { readonly children: ReactNode; readonly periode?: boolean }) {
  return <p className={`text-sm text-muted-foreground tabular-nums${periode ? ' md:hidden' : ''}`}>{children}</p>;
}

// TCK-595 (AC20 ter) — la langue de la requête et le fuseau `Africa/Dakar` de `@/lib/format`.
// `dateStyle: undefined` retire le style par défaut du helper : `Intl` refuse un style mêlé à des champs.
export function formatHeure(value: string | null, locale: Locale, repli: string): string {
  if (!value) return repli;
  return formatDate(value, locale, { dateStyle: undefined, hour: '2-digit', minute: '2-digit' }) || repli;
}

export function formatDateHeure(value: string | null, locale: Locale, repli: string): string {
  if (!value) return repli;
  return (
    formatDate(value, locale, {
      dateStyle: undefined,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }) || repli
  );
}
