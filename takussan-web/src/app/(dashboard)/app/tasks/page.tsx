import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { MyTasks } from '@/components/crm/MyTasks';
import { TASK_DUE_FILTERS } from '@/lib/queries/agent-crm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('agentCrm.myTasks');
  return { title: t('metaTitle') };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** TCK-591 §3 — « Mes tâches ». `?filter[due]=today` est la cible de la tuile « Tâches du jour ». */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('agentCrm.myTasks');
  const params = await searchParams;
  const raw = params['filter[due]'];
  const due = TASK_DUE_FILTERS.find((f) => f === raw) ?? null;
  // TCK-1733 (P167.04) — la portée de la tuile « Tâches du jour » : les tâches qui me sont assignées.
  const assignedToMe = params['filter[assigned_to]'] === 'me';

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <MyTasks initialDue={due} initialAssignedToMe={assignedToMe} />
    </div>
  );
}
