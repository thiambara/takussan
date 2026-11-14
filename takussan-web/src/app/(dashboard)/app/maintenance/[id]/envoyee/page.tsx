import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { DemandeEnvoyee } from '@/components/maintenance/acteurs/DemandeEnvoyee';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('maintenance.locataire.envoyee');
  return { title: t('metaTitle') };
}

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

/**
 * TCK-2654 — « Demande envoyée », où mène le signalement du locataire (`SignalementDuLocataire`).
 * L'existence de la demande et la validité de l'identifiant se tranchent dans `[id]/layout.tsx`
 * (TCK-442) : un `notFound()` écrit ici, sous le `loading.tsx` du segment, rendrait 200.
 *
 * Rendue au seul demandeur : les autres lecteurs sont renvoyés à la fiche par `DemandeEnvoyee`, au
 * client — un renvoi serveur, sous ce même `loading.tsx`, rendrait 200 avec le squelette.
 */
export default async function Page({ params }: PageProps) {
  const t = await getTranslations('maintenance.locataire');
  const tConsole = await getTranslations('console.pageHeader');
  await getMeAction();
  const { id } = await params;

  return (
    <PagePleineLargeur className="space-y-6">
      {/* Au téléphone, la barre du haut de la coque porte déjà le titre. */}
      <div className="max-md:hidden">
        <PageHeader
          title={t('envoyee.titre')}
          fil={{
            label: tConsole('breadcrumb'),
            etapes: [
              { label: t('demandes.titre'), href: '/app/maintenance' },
              { label: t('signaler.titre'), href: '/app/maintenance/new' },
              { label: t('envoyee.titre') },
            ],
          }}
        />
      </div>
      <DemandeEnvoyee id={Number(id)} />
    </PagePleineLargeur>
  );
}
