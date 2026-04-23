import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { fetchTagsAction } from '@/app/actions/admin-tags';
import { isAdmin } from '@/lib/roles';
import { TagsManager } from '@/components/admin-tags/TagsManager';

/**
 * Admin — tags & amenities page (TCK-066).
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }

  const result = await fetchTagsAction({ perPage: 100 });
  const tags = result.ok && result.data ? result.data.data : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-app-ink">Tags &amp; amenités</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Gérez le référentiel des caractéristiques, commodités et étiquettes utilisés
          sur les fiches biens.
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
