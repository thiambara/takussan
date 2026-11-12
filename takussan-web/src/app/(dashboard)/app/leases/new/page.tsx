import type { Metadata } from 'next';
import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';
import { CreateLeaseForm } from '@/components/leases/CreateLeaseForm';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { buttonVariants } from '@/components/ui/button';
import { isAdmin, isAgent, isSuperAdmin } from '@/lib/roles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.leaseNew');
  return { title: t('metaTitle') };
}

/**
 * P48.03 (TCK-2352) — `?booking_id=…` : le bail tiré d'une candidature, prérempli.
 * TCK-2643 — `?property=…` : le bien préchoisi, venu de sa fiche ; `?customer=…` : le locataire
 * préchoisi (la fiche client, famille 5). Même lecture : un entier positif.
 */
function identifiantDemande(valeur: string | string[] | undefined): number | undefined {
  const brut = Array.isArray(valeur) ? valeur[0] : valeur;
  const id = Number(brut);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * TCK-2643 — la création d'un bail : quatre étapes au téléphone, une page au bureau
 * (`CreateLeaseForm`). Au téléphone, l'en-tête de la coque porte le titre et l'étape (plein écran,
 * « ✕ ») : l'en-tête de page ne s'y montre pas.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations('dashboard.pages.leaseNew');
  const tListe = await getTranslations('dashboard.pages.leases');
  const tConsole = await getTranslations('console.pageHeader');
  const tCommon = await getTranslations('common');
  const user = await getMeAction();

  // TCK-115 — comme la liste des baux : un super-admin sans agence n'a aucun bien où créer un bail.
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  const parametres = await searchParams;
  const bookingId = identifiantDemande(parametres.booking_id);
  const propertyId = identifiantDemande(parametres.property);
  const customerId = identifiantDemande(parametres.customer);
  // Décision 8 — la création rapide du locataire est un geste du personnel de l'agence.
  const personnel = isAgent(user.roles) || isAdmin(user.roles) || isSuperAdmin(user.roles);
  const retour = propertyId ? `/app/properties/${propertyId}` : '/app/leases';

  return (
    <div className="space-y-6">
      <PageHeader
        className="max-md:hidden"
        title={t('title')}
        description={t('subtitle')}
        fil={{ label: tConsole('breadcrumb'), etapes: [{ label: tListe('title'), href: '/app/leases' }, { label: t('title') }] }}
        actions={
          <Link href={retour} className={buttonVariants({ variant: 'ghost' })}>
            {tCommon('actions.cancel')}
          </Link>
        }
      />
      <CreateLeaseForm
        bookingId={bookingId}
        propertyId={propertyId}
        customerId={customerId}
        personnel={personnel}
        retour={retour}
      />
    </div>
  );
}
