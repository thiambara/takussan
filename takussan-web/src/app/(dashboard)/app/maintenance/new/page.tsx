import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { MaintenanceNewLauncher } from '@/components/maintenance/MaintenanceNewLauncher';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { SignalementDuLocataire } from '@/components/maintenance/acteurs/SignalementDuLocataire';
import { formulaireDuSignalement } from '@/lib/maintenance/signalement';
import { profilLieDeLaCoque, resoudrePersona, typeDuProfilActif } from '@/lib/navigation/personas';
import { getActiveProfileId } from '@/lib/session';

interface PageProps {
  readonly searchParams: Promise<{ property?: string; lease?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.maintenanceNew');
  return { title: t('metaTitle') };
}

/**
 * TCK-174 — la page rend toujours le launcher, qui charge les baux du
 * customer connecté, expose un selector `Bien concerné` et instancie le
 * formulaire de signalement une fois le bien choisi. Les params
 * `?property=` / `?lease=` continuent de fonctionner mais sont validés
 * contre la liste des baux du user (les ids étrangers sont ignorés).
 */
export default async function Page({ searchParams }: PageProps) {
  const t = await getTranslations('dashboard.pages.maintenanceNew');
  const user = await getMeAction();
  const { property, lease } = await searchParams;

  const propertyId = property ? Number(property) : NaN;
  const leaseId = lease ? Number(lease) : NaN;
  const bienDeLUrl = Number.isInteger(propertyId) && propertyId > 0 ? propertyId : null;

  // TCK-2654 — le locataire signale photo d'abord ; tout autre persona garde le formulaire du personnel
  // (`formulaireDuSignalement`). Le persona est celui de la coque (`app/layout.tsx`).
  const persona = resoudrePersona({
    roles: user.roles,
    typeProfilActif: typeDuProfilActif(profilLieDeLaCoque(await getActiveProfileId(), user)),
  });
  if (formulaireDuSignalement(persona) === 'locataire') {
    const tL = await getTranslations('maintenance.locataire.signaler');
    // Le fil nomme la liste comme la barre du locataire : « Interventions ».
    const tDemandes = await getTranslations('maintenance.locataire.demandes');
    const tConsole = await getTranslations('console.pageHeader');
    // Pleine largeur (TCK-2691) : au téléphone, la page porte sa marge (`SignalementDuLocataire`, 16 px
    // comme la maquette) au lieu des 24 px de l'enveloppe de la coque.
    return (
      <PagePleineLargeur className="space-y-6">
        {/* Au téléphone, la barre du haut de la coque porte déjà le titre (maquette : aucun en-tête de page). */}
        <div className="max-md:hidden">
          <PageHeader
            title={tL('titre')}
            description={tL('sousTitre')}
            fil={{
              label: tConsole('breadcrumb'),
              etapes: [{ label: tDemandes('titre'), href: '/app/maintenance' }, { label: tL('titre') }],
            }}
          />
        </div>
        <SignalementDuLocataire initialPropertyId={bienDeLUrl} />
      </PagePleineLargeur>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <MaintenanceNewLauncher
        initialPropertyId={bienDeLUrl}
        initialLeaseId={Number.isInteger(leaseId) && leaseId > 0 ? leaseId : null}
      />
    </div>
  );
}
