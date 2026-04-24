import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CompareClient } from '@/components/compare/CompareClient';

export const metadata: Metadata = {
  title: 'Comparer des biens — Takussan',
  description:
    'Comparez jusqu’à 4 biens côte à côte : prix, surface, pièces, amenités et localisation.',
  robots: { index: false, follow: true },
};

/**
 * TCK-082 — `/compare` page. Server component entry; the actual comparison
 * UI is a client component because it needs `useSearchParams`, hydration
 * of the local store, and the single client-side fetch contract imposed
 * by the ticket.
 */
export default function ComparePage() {
  return (
    <Suspense>
      <CompareClient />
    </Suspense>
  );
}
