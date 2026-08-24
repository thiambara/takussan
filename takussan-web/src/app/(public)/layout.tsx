import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { CompareProvider } from '@/context/CompareContext';
import { CompareFloatingBar } from '@/components/compare/CompareFloatingBar';
import { ToastProvider, Toaster } from '@/components/ui/toast';

/**
 * Public route group layout.
 *
 * Wraps all marketing/landing routes (home, property listing, property
 * detail, contact, etc.). Public pages render their own domain-specific
 * chrome (the marketing `Navbar` with search + category rail, the marketing
 * `Footer`) — this layout is intentionally transparent so each page stays
 * free to build its own top-level composition.
 *
 * Wraps children in:
 * - `ToastProvider` + `Toaster` — feedback surface (TCK-082 "max 4" toast).
 * - `CompareProvider` + `CompareFloatingBar` — the property comparator
 *   selection store (TCK-082). The floating bar is rendered here so it
 *   follows the user across every public page.
 *
 * i18n (TCK-337) : ce layout est une FRONTIÈRE de dictionnaire. Il sert le sous-ensemble cumulé
 * du groupe `(public)` — le sien plus le socle racine —, et non les 60 espaces de noms du
 * produit. La table est dérivée du graphe d'imports par `scripts/check-i18n-namespaces.mjs` ;
 * ⚠ le provider imbriqué REMPLACE celui du parent, d'où l'ensemble cumulé (cf. `IntlProvider`).
 *
 * SEO: indexable by default; individual pages override `metadata` as needed.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.home');
  return {
    title: {
      template: '%s — Takussan',
      default: t('title'),
    },
    description: t('description'),
    robots: { index: true, follow: true },
  };
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={await messagesPour('(public)')}>
      <ToastProvider>
        <CompareProvider>
          {children}
          <CompareFloatingBar />
          <Toaster />
        </CompareProvider>
      </ToastProvider>
    </IntlProvider>
  );
}
