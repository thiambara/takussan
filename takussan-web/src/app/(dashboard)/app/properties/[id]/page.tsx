import type { Metadata } from 'next';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

import { fetchTagsAction } from '@/app/actions/admin-tags';
import { getMeAction } from '@/app/actions/auth';
import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { getToken } from '@/lib/session';
import { lireBienDuRendu } from '@/lib/detail/ressource-de-detail';
import { ApiError } from '@/lib/api';
import { PropertyMatchingCustomers } from '@/components/crm/PropertyMatchingCustomers';
import { PropertyDetailTabs } from '@/components/property-dashboard/PropertyDetailTabs';
import { CarteOccupation } from '@/components/property-dashboard/fiche/CarteOccupation';
import { BlocResponsable } from '@/components/property-dashboard/fiche/PiecesDeLaLocation';
import { PhotosDuBien } from '@/components/property-dashboard/fiche/PhotosDuBien';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PropertyHeaderActions } from '@/components/property-dashboard/PropertyHeaderActions';
import { PARAMETRE_BOOSTER } from '@/components/boost/parametre-booster';
import { ProprietaireEtResponsable } from '@/components/property-dashboard/ProprietaireEtResponsable';
import { ChangerLeTitulaire } from '@/components/property-dashboard/ChangerLeTitulaire';
import { PlanifierUneVisite } from '@/components/visits/PlanifierUneVisite';
import { agenceDuBien } from '@/lib/visites/agence-du-bien';
import { PropertyStatusBadge } from '@/components/property-dashboard/PropertyStatusBadge';
import { PropertyVisibilityBadge } from '@/components/property-dashboard/PropertyVisibilityBadge';
import { PropertyModerationBanner } from '@/components/property-form/PropertyModerationBanner';
import { QuestionDeDisponibilite } from '@/components/property-dashboard/QuestionDeDisponibilite';
import { PROPERTY_ENUM_NAMESPACES, enumLabel } from '@/components/property-form/options';
import { contractTypeValues, propertyTypeValues } from '@/lib/schemas/property';
import { getTranslations } from 'next-intl/server';
import { PageHeader, StatusBadge } from '@/components/console';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { ouvreLaFicheDuBailleur } from '@/lib/owners/fiche-accessible';
import { isAdmin, isAgent } from '@/lib/roles';
import { cn } from '@/lib/utils';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.propertyDetail');
  return { title: t('metaTitle') };
}

/**
 * TCK-041 — page d'édition d'un bien existant.
 */

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ params, searchParams }: { params: Params; searchParams?: SearchParams }) {
  const t = await getTranslations('dashboard.pages.propertyDetail');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  const { id } = await params;
  // TCK-633 — `?booster=1` : le « Booster » du message de confirmation de publication y mène.
  const ouvrirBoost = (await searchParams)?.[PARAMETRE_BOOSTER] === '1';
  const token = await getToken();
  // TCK-426 — NARROWING DE TYPE, PAS UNE DÉCISION. Le `layout.tsx` de ce segment a déjà refusé
  // l'absence de jeton, au-dessus de la frontière de suspension ; et `getMeAction()` redirige
  // vers `/auth/login` bien avant, depuis `(dashboard)/layout.tsx`. Cette branche est donc
  // inatteignable — mais `getToken()` rend `string | null` et le typage exige qu'on le dise.
  // *Ce qu'elle ne fait SURTOUT pas, c'est rediriger : sous un `loading.tsx`, un `redirect()` de
  // page rend 200 + le squelette au lieu du 307.*
  if (!token) return null;

  let property;
  try {
    // TCK-1384 (P138.04) — la lecture que la sonde du layout a déjà faite : une requête par rendu.
    property = await lireBienDuRendu(token, Number(id));
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      // TCK-442 — **un panneau RENDU, plus un `redirect('/app')`.** Le ticket demandait de dire
      // lequel des deux était un choix : deux pages sœurs répondaient différemment au même 403,
      // `customers/[id]` par un panneau et celle-ci par une redirection muette. C'est la
      // redirection qui était l'oubli, pour deux raisons qui vont dans le même sens.
      //
      // · Sous le `loading.tsx` de ce segment, un `redirect()` de PAGE rend **200 + le squelette**
      //   au lieu du 307 (tableau mesuré de TCK-426) : l'utilisateur atterrissait sur `/app`, mais
      //   toute sonde lisait un succès. Le remonter dans le layout n'est pas possible ici — le
      //   refus vient de la RÉPONSE de l'API, pas de l'utilisateur.
      // · Et surtout, il ne DISAIT rien : on quittait la page sans savoir pourquoi. Le panneau
      //   nomme le refus et propose le retour, comme `CustomerDetailUnavailable`.
      return (
        <PropertyDetailUnavailable
          title={t('forbidden_title')}
          message={t('forbidden_message')}
          backLabel={t('back_cta')}
        />
      );
    }
    throw e;
  }

  // Le front possède le texte affiché (principe n° 5) : `type_label`, `contract_type_label` et
  // `status_label` arrivent de l'API en anglais sous une interface française (« Rented ·
  // Studio · For Rent », mesuré le 2026-09-16). Les codes se traduisent ici, comme dans la liste.
  const tType = await getTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const typeLabel = property.type
    ? enumLabel(tType, propertyTypeValues, property.type)
    : property.type_label;
  const tContract = await getTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const contractLabel = property.contract_type
    ? enumLabel(tContract, contractTypeValues, property.contract_type)
    : property.contract_type_label;

  // TCK-591 §5 — le rapprochement est un outil du personnel ; le bailleur n'en voit pas l'entrée
  // (l'API le lui refuse aussi). `getMeAction` est mémoïsé : le layout l'a déjà appelé.
  const { id: currentUserId, roles } = await getMeAction();
  const staff = isAgent(roles) || isAdmin(roles);
  // TCK-2639 — le nom du bailleur mène à sa fiche (`/app/owners/{id}`) pour qui cette page s'ouvre,
  // par le prédicat de sa garde (d1 : `isAdmin` l'offrait au super-admin, que la page renvoie vers
  // `/app`). L'API rend `owner_profile_id` au super-admin, à qui `GET /api/owners/{id}` est ouvert.
  const lienVersLeBailleur = ouvreLaFicheDuBailleur(roles);

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' } });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];

  const planifier = (placeReservee: boolean) => (
    <PlanifierUneVisite
      property={{
        id: property.id,
        libelle: property.title,
        photo: property.main_photo_url ?? null,
        detail: property.reference_number ?? null,
      }}
      agencyId={agenceDuBien(property)}
      // TCK-2639 (AC5) — le personnel le sait au serveur : sa place est tenue pendant la lecture des profils.
      placeReservee={placeReservee}
    />
  );
  const changerLeTitulaire =
    // TCK-999 — l'API dit à qui le geste est offert (l'admin, bien tenu par le personnel).
    property.abilities?.transfer_owner && property.agency ? (
      <ChangerLeTitulaire propertyId={property.id} agencyId={property.agency.id} />
    ) : null;

  const tFiche = await getTranslations('property.dashboard.fiche.identite');
  const tListe = await getTranslations('dashboard.properties');
  const tConsole = await getTranslations('console.pageHeader');
  // TCK-2639 — l'identité du bien (maquette `app-biens` a-2) : « Villa · 320 m² · TK-51720 », puis ses
  // pastilles — statut, visibilité, mise en ligne. La même ligne au téléphone (sous la photo) et au
  // bureau (sous le titre). Le contrat et la ville y restent (« Rien ne se perd » : l'en-tête d'avant
  // disait « type · contrat · ville »).
  const identite = [
    typeLabel,
    contractLabel,
    property.area ? tFiche('surface', { area: property.area }) : null,
    property.location?.city ?? null,
    property.reference_number,
  ]
    .filter(Boolean)
    .join(' · ');
  const pastilles = (
    <>
      <PropertyStatusBadge status={property.status} />
      <PropertyVisibilityBadge visibility={property.visibility} />
      {property.is_online === undefined ? null : (
        <StatusBadge tone="neutral" label={tFiche(property.is_online ? 'enLigne' : 'horsLigne')} />
      )}
    </>
  );
  // TCK-2639 (TCK-603) — un bien en location nomme son bailleur et son agent responsable dans l'onglet
  // Location (« Mandat ») et, au bureau, dans la colonne de droite : la ligne « Propriétaire · Agent
  // responsable » de l'en-tête ne s'y répète pas. Un bien hors location la garde partout.
  const occupation = property.occupancy ?? null;
  const locatif = occupation !== null && !(occupation.state === 'not_rental' && !occupation.lease);
  const proprietaireEtResponsable = (className?: string) => (
    <ProprietaireEtResponsable property={property} currentUserId={currentUserId} as="span" className={className} />
  );
  // TCK-1000 — le bien saisi pour un bailleur invité lui passe à l'acceptation.
  const enAttenteDe = property.pending_owner ? t('pendingOwner', { name: property.pending_owner.name }) : null;

  return (
    // TCK-2639 (TCK-2691, C1) — pleine largeur au téléphone : la photo va bord à bord sous l'en-tête de
    // la coque, chaque bloc pose sa marge (`max-md:px-4`).
    <PagePleineLargeur className="space-y-6 max-md:space-y-3 max-md:pb-6">
      {/* TCK-2639 — au téléphone, les gestes de l'en-tête passent dans « ⋯ » (la feuille de l'en-tête
          de la coque) : aucune rangée de boutons ne précède le titre ni l'occupation (AC5). */}
      <DeclarerEnTete
        actions={
          <div className="flex flex-col items-stretch gap-2 pb-2" data-slot="autres-gestes-du-bien">
            {planifier(false)}
            {changerLeTitulaire}
            {/* « Ajouter un document » : ici au téléphone, dans l'onglet Documents partout (AC3). */}
            <PropertyHeaderActions property={property} ajouterUnDocument />
          </div>
        }
      />
      {/* TCK-2639 — le téléphone : le bandeau photo (200 px), puis l'identité ; le titre est celui de
          l'en-tête de la coque. `PageHeader` reste lu par les lecteurs d'écran (`sr-only`) : cette
          copie visible leur est tue, pour ne pas la dire deux fois. */}
      <div className="md:hidden" data-slot="identite-du-bien">
        <PhotosDuBien property={property} forme="bandeau" />
        <div className="px-4 pt-3" aria-hidden="true">
          <p className="text-ui text-muted-foreground">{identite}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{pastilles}</div>
          {locatif ? null : proprietaireEtResponsable('mt-2 block whitespace-normal')}
          {enAttenteDe ? <p className="mt-2 text-xs text-muted-foreground">{enAttenteDe}</p> : null}
        </div>
      </div>
      <PageHeader
        className="max-md:sr-only"
        fil={{ label: tConsole('breadcrumb'), etapes: [{ label: tListe(staff ? 'titleAgency' : 'title'), href: '/app/properties' }, { label: property.title }] }}
        title={property.title}
        description={
          <>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {identite}
              {pastilles}
            </span>
            {/* TCK-603 — la fiche, comme la liste, nomme le propriétaire ET l'agent responsable. */}
            {proprietaireEtResponsable(cn('mt-1 block whitespace-normal', locatif && 'xl:hidden'))}
            {enAttenteDe ? (
              <span className="block text-xs text-muted-foreground" data-testid="bailleur-en-attente">
                {enAttenteDe}
              </span>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2 max-md:hidden" data-slot="gestes-de-l-en-tete">
            {planifier(staff)}
            {changerLeTitulaire}
            <PropertyHeaderActions property={property} ouvrirBoost={ouvrirBoost} />
          </div>
        }
      />

      <div className="space-y-6 empty:hidden max-md:px-4">
        <PropertyModerationBanner property={property} />
        {/* TCK-2432 — l'annonce d'origine d'un bien publié par le Radar a disparu : la question à son titulaire. */}
        <QuestionDeDisponibilite propertyId={property.id} />
      </div>

      {/* TCK-2639 — deux colonnes au bureau (`xl`, la maquette 1280-1440) : la photo, les onglets et leur
          contenu à gauche ; la carte collante « Occupation » à droite, sur tous les onglets (AC6). */}
      <div className="xl:flex xl:items-start xl:gap-6">
        <div className="min-w-0 flex-1 space-y-6 max-md:px-4">
          <PhotosDuBien property={property} forme="grille" className="max-md:hidden" />
          <PropertyDetailTabs property={property} tags={tags} personnel={staff} lienVersLeBailleur={lienVersLeBailleur} />
          {staff ? <PropertyMatchingCustomers propertyId={property.id} /> : null}
        </div>
        <aside className="hidden flex-none space-y-4 xl:sticky xl:top-6 xl:block xl:w-100" data-slot="colonne-occupation">
          <CarteOccupation property={property} personnel={staff} lienVersLeBailleur={lienVersLeBailleur} />
          {locatif ? <BlocResponsable property={property} /> : null}
        </aside>
      </div>
    </PagePleineLargeur>
  );
}

/**
 * L'écran d'un 403 sur la fiche d'un bien — le pendant de `CustomerDetailUnavailable`.
 *
 * `EmptyState` et non `ErrorState` : ce n'est pas une panne, il n'y a rien à réessayer. La seule
 * action utile est le retour à la liste.
 */
function PropertyDetailUnavailable({
  title,
  message,
  backLabel,
}: {
  readonly title: string;
  readonly message: string;
  readonly backLabel: string;
}) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-8" aria-hidden="true" />}
      title={title}
      description={message}
      action={
        <Link href="/app/properties" className={buttonVariants()}>
          {backLabel}
        </Link>
      }
    />
  );
}
