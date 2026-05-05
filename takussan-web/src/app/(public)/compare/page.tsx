import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { CompareClient } from '@/components/compare/CompareClient';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.compare');
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: true },
  };
}

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
