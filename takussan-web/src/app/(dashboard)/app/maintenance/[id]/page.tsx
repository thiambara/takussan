import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';
import { MaintenanceDetail } from '@/components/maintenance/MaintenanceDetail';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.maintenanceDetail');
  return { title: t('metaTitle') };
}

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const t = await getTranslations('dashboard.maintenanceDetail');
  const tPages = await getTranslations('dashboard.pages');
  const tConsole = await getTranslations('console.pageHeader');
  await getMeAction();
  const { id } = await params;
  const numericId = Number(id);

  // TCK-442 — la validité de l'identifiant ET l'existence de la ressource sont tranchées par
  // `[id]/layout.tsx`, strictement au-dessus du `loading.tsx` de ce segment : un `notFound()`
  // écrit ici rendrait 200, avec l'écran introuvable affiché quand même. La décision n'a pas
  // changé de nature — un identifiant illisible reste un INTROUVABLE, jamais une panne — elle
  // a changé d'étage, et elle couvre désormais aussi le 404 de l'API.

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', { id: numericId })}
        description={t('subtitle')}
        // TCK-2617 — plus de bouton « ← Retour » : la flèche de l'en-tête au téléphone, le fil dès `md`.
        fil={{
          label: tConsole('breadcrumb'),
          etapes: [{ label: tPages('maintenance.title'), href: '/app/maintenance' }, { label: t('title', { id: numericId }) }],
        }}
      />
      <MaintenanceDetail id={numericId} />
    </div>
  );
}
