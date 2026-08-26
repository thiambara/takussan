import { getTranslations } from 'next-intl/server';
import { fetchTagsAction } from '@/app/actions/admin-tags';
import { TagsManager } from '@/components/admin-tags/TagsManager';
import { PageHeader } from '@/components/console';

export const dynamic = 'force-dynamic';

export default async function SuperAdminTagsPage() {
  const t = await getTranslations('superAdmin.pages.tags');
  const result = await fetchTagsAction({ perPage: 100 });
  const tags = result.ok && result.data ? result.data.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      {!result.ok ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {t('loadError')} {result.message}
        </div>
      ) : (
        <TagsManager initialTags={tags} />
      )}
    </div>
  );
}
