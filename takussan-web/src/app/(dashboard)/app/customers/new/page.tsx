import type { Metadata } from 'next';


import { CustomerForm } from '@/components/customer-form';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customerNew');
  return { title: t('metaTitle') };
}

/**
 * TCK-042 — ajout d'un client CRM.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.customerNew');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CustomerForm mode="create" />
    </div>
  );
}
