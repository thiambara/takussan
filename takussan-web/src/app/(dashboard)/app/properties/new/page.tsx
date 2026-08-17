import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.propertyNew');
  return { title: t('metaTitle') };
}
import { fetchTagsAction } from '@/app/actions/admin-tags';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { PropertyForm } from '@/components/property-form';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.propertyNew');
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' }, perPage: 200 });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <PropertyForm mode="create" tags={tags} />
    </div>
  );
}
