import { getTranslations } from 'next-intl/server';
import { fetchTagsAction } from '@/app/actions/admin-tags';
import { TagsManager } from '@/components/admin-tags/TagsManager';

export const dynamic = 'force-dynamic';

export default async function SuperAdminTagsPage() {
  const t = await getTranslations('superAdmin.pages.tags');
  const result = await fetchTagsAction({ perPage: 100 });
  const tags = result.ok && result.data ? result.data.data : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
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
