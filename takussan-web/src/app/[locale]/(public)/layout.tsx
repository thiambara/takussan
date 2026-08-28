import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { CompareProvider } from '@/context/CompareContext';
import { CompareFloatingBar } from '@/components/compare/CompareFloatingBar';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { isLocale } from '@/i18n/config';

type LocaleParams = { readonly params: Promise<{ locale: string }> };

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
 *
 * i18n d'URL (TCK-434, ADR-0026) : ce groupe vit sous `src/app/[locale]/`. La langue est le premier
 * segment du chemin, TOUJOURS présent — `/fr/properties/<slug>`, `/en/…`, `/wo/…` — et elle ne
 * l'est QUE sur cette surface : la console (`/app`, `/admin`, `/super-admin`), `/auth`,
 * `/onboarding`, `/publish` et le BFF `/api/**` gardent leurs URL et lisent le cookie.
 */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
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

export default async function PublicLayout({
  children,
  params,
}: LocaleParams & { children: React.ReactNode }) {
  // ⚠️ **`[locale]` est un segment DYNAMIQUE : il accepte n'importe quoi.** Sans cette garde,
  // `/zz/properties` rendrait la page publique entière en français sous une URL qui annonce une
  // langue inexistante — une page indexable de plus par valeur inventée. `notFound()` est le
  // comportement juste : cette URL n'existe pas.
  //
  // `setRequestLocale` double l'en-tête posé par `src/proxy.ts` : si le proxy ne tourne pas (son
  // `matcher` évolue, un rendu statique le contourne), la langue reste celle de l'URL.
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  return (
    <IntlProvider messages={await messagesPour('[locale]/(public)')}>
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
