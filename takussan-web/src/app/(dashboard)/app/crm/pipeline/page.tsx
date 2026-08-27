import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { PipelineKanban } from '@/components/pipeline/PipelineKanban';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.crmPipeline');
  return { title: t('metaTitle') };
}

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
  assertCanReachAgentArea(me.roles);
  const t = await getTranslations('crm.pipeline');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PipelineKanban />
    </div>
  );
}
