import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customerNew');
  return { title: t('metaTitle') };
}
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { CustomerForm } from '@/components/customer-form';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-042 — ajout d'un client CRM.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.customerNew');
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

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
