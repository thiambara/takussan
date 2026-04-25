import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { PipelineKanban } from '@/components/pipeline/PipelineKanban';

/**
 * TCK-083 — CRM prospect pipeline kanban.
 *
 * Server-side guard: only agents / owners / admins can see the pipeline.
 * The kanban itself is fully client-side because drag-drop, optimistic
 * mutations and per-column live counts all need browser state.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const me = await getMeAction();
  if (!(isAgent(me.roles) || isOwner(me.roles) || isAdmin(me.roles))) {
    forbidden();
  }
  const t = await getTranslations('crm.pipeline');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-app-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-app-ink-muted">{t('subtitle')}</p>
      </header>
      <PipelineKanban />
    </div>
  );
}
