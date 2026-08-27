import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';

import { fetchTagsAction } from '@/app/actions/admin-tags';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { PropertyForm } from '@/components/property-form';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.propertyNew');
  return { title: t('metaTitle') };
}

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('dashboard.pages.propertyNew');
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' }, perPage: 200 });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PropertyForm mode="create" tags={tags} />
    </div>
  );
}
