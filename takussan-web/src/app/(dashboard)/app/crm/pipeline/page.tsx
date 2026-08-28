import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

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
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.
  const t = await getTranslations('crm.pipeline');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PipelineKanban />
    </div>
  );
}
