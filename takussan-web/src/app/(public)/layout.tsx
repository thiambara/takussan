import type { Metadata } from 'next';

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
 * SEO: indexable by default; individual pages override `metadata` as needed.
 */
export const metadata: Metadata = {
  title: {
    template: '%s — Takussan',
    default: 'Takussan — Immobilier au Sénégal',
  },
  robots: { index: true, follow: true },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CompareProvider>
        {children}
        <CompareFloatingBar />
        <Toaster />
      </CompareProvider>
    </ToastProvider>
  );
}
