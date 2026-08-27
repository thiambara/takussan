import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customerNew');
  return { title: t('metaTitle') };
}
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { CustomerForm } from '@/components/customer-form';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

/**
 * TCK-042 — ajout d'un client CRM.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.customerNew');
  const user = await getMeAction();
  if (!(isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles))) {
    forbidden();
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CustomerForm mode="create" />
    </div>
  );
}
