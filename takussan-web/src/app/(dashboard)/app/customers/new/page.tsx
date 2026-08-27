import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';

import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { CustomerForm } from '@/components/customer-form';
import { getTranslations } from 'next-intl/server';

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
  const user = await getMeAction();
  if (!(isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles))) {
    forbidden();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <CustomerForm mode="create" />
    </div>
  );
}
