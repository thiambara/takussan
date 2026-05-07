import { fetchTagsAction } from '@/app/actions/admin-tags';
import { TagsManager } from '@/components/admin-tags/TagsManager';

export const dynamic = 'force-dynamic';

export default async function SuperAdminTagsPage() {
  const result = await fetchTagsAction({ perPage: 100 });
  const tags = result.ok && result.data ? result.data.data : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-stone-900">Tags &amp; amenités</h1>
        <p className="mt-1 text-sm text-stone-600">
          Référentiel global utilisé par toutes les agences pour qualifier biens et clients.
        </p>
      </header>
      {!result.ok ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Impossible de charger les tags : {result.message}
        </div>
      ) : (
        <TagsManager initialTags={tags} />
      )}
    </div>
  );
}
