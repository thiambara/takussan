import { forbidden } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { PipelineKanban } from '@/components/pipeline/PipelineKanban';
import { PageHeader } from '@/components/console';

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
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PipelineKanban />
    </div>
  );
}
