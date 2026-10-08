import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { isAdmin, isAgent } from '@/lib/roles';
import { ExportForm } from './ExportForm';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.exports');
  return { title: t('metaTitle') };
}

/**
 * TCK-032 P2 — download centre. Agency staff + owners see all entities; owners
 * are restricted to their scope on the backend.
 */
export default async function ExportsPage() {
  const t = await getTranslations('dashboard.pages.exports');
  const user = await getMeAction();
  // TCK-426 — le refus de rôle est REMONTÉ dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la vue interdite.

  // TCK-587 — le personnel voit les exports dont il tient la capacité (lue par `ExportForm`) ; le
  // bailleur, ceux de ses propres données.
  const staff = isAdmin(user.roles) || isAgent(user.roles);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ExportForm staff={staff} />
    </div>
  );
}
