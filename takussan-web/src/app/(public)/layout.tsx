import type { Metadata } from 'next';

/**
 * Public route group layout.
 *
 * Wraps all marketing/landing routes (home, property listing, property
 * detail, contact, etc.). Public pages render their own domain-specific
 * chrome (the marketing `Navbar` with search + category rail, the marketing
 * `Footer`) — this layout is intentionally transparent so each page stays
 * free to build its own top-level composition.
 *
 * Pages that want a minimal shell can compose with `@/components/layout/Header`
 * and `@/components/layout/Footer` — the structural skeletons are ready.
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
  return <>{children}</>;
}
