'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Phone } from 'lucide-react';

import { FilDAriane } from '@/components/console/PageHeader';
import { CustomerReferent } from '@/components/crm/CustomerReferent';
import { CustomerStageControl } from '@/components/crm/CustomerStageControl';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { InviterACreerSonCompte } from '@/components/crm/InviterACreerSonCompte';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { CustomerTagPicker } from '@/components/customer-dashboard/CustomerTagPicker';
import { InitialesDuClient } from '@/components/customer-dashboard/liste/pieces';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { EntreeSaisieDemande } from '@/components/bookings/EntreeSaisieDemande';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { PlanifierUneVisite } from '@/components/visits/PlanifierUneVisite';
import { lecteurDuPersonnel, nomCourt } from '@/lib/crm/fiche-du-client';
import { initiales } from '@/lib/fiche-publique';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import { formaterTelephone } from '@/lib/phone';
import { type CanalDeContactClient, useEnregistrerContactClient } from '@/lib/queries/customer-gestures';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { CustomerDetail, CustomerNote, CustomerRelationship } from '@/types/customer';
import type { Tag } from '@/types/tag';

import { BarreDeLaFiche } from './BarreDeLaFiche';
import { FilDuClient, type DemandeDeSaisie } from './FilDuClient';
import { OrigineDuClient, ProchaineActionDuClient, RechercheDuClient } from './ResumeDuClient';

/**
 * TCK-2589 — la fiche client (`/app/customers/[id]`, maquette `app-clients-fiche` a, « Résumé + fil »).
 *
 *  · Téléphone : la tête (initiales, nom, étape, référent), les gestes, la prochaine action, sa
 *    recherche, son origine, puis le fil.
 *  · Bureau (dès `xl`) : deux colonnes — le résumé (380 px de maquette) et le fil. Sous `xl`, une
 *    seule colonne : aucune piste fixe à côté du contenu (ADR-0106 § 4, AC-F6).
 *
 * UN SEUL DOM pour toutes les largeurs : la tête, son étape et ses gestes n'existent qu'une fois
 * (AC3 : un seul contrôle d'étape dans la page). L'étape passe à la ligne sous le nom au téléphone,
 * à côté de lui au bureau.
 */
export interface FicheDuClientProps {
  readonly customer: CustomerDetail;
  readonly relationships: readonly CustomerRelationship[];
  readonly suggestionsDEtiquettes: readonly Pick<Tag, 'id' | 'name' | 'color'>[];
  /** Toutes les notes de la fiche, lues par la page : les épinglées du fil (2b). */
  readonly notes: readonly CustomerNote[];
  /** P15.01 (TCK-2351) — « Inviter à créer son compte », un geste du personnel (rôle du lecteur). */
  readonly peutInviter: boolean;
  /** Sous le fil, les onglets qui restent jusqu'au lot D de TCK-2589 (le dossier). */
  readonly children: ReactNode;
}

const GESTE =
  'inline-flex h-12 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-2 text-corps font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring md:h-controle md:rounded-lg md:px-3 md:text-sm md:font-medium';
const CONTOUR = 'border border-border bg-card text-foreground hover:bg-muted';

/** Appeler et WhatsApp : enregistrés au toucher pour le personnel (TCK-2583), sans trace sinon. */
function GestesDeLaFiche({ customer, nom }: { readonly customer: CustomerDetail; readonly nom: string }) {
  const t = useTranslations('agentCrm.contact');
  const tFiche = useTranslations('crm.fiche');
  const enregistrement = useEnregistrerContactClient();
  const phone = customer.phone;
  if (!isReachable(phone)) return null;
  const noter = (channel: CanalDeContactClient) => {
    if (lecteurDuPersonnel(customer)) enregistrement.mutate({ id: customer.id, channel });
  };
  const prenom = customer.first_name?.trim() || nom;
  return (
    <>
      <a href={telHref(phone)} onClick={() => noter('call')} aria-label={t('callAria', { name: nom })} data-slot="geste-appeler" className={cn(GESTE, CONTOUR)}>
        <Phone className="size-icone flex-none md:size-4" strokeWidth={1.75} aria-hidden="true" />
        {t('call')}
      </a>
      <a
        href={whatsappHref(phone, t('whatsappMessage', { firstName: prenom }))}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => noter('whatsapp')}
        aria-label={t('whatsappAria', { name: nom })}
        data-slot="geste-whatsapp"
        className={cn(GESTE, 'bg-success text-success-foreground hover:bg-success/90', 'md:border md:border-border md:bg-card md:text-foreground md:hover:bg-muted')}
      >
        <IconeWhatsApp className="size-icone flex-none md:size-4 md:text-success" />
        {t('whatsapp')}
      </a>
      {enregistrement.isError ? (
        <p role="alert" className="col-span-full text-ui text-destructive md:basis-full">
          {tFiche('gestesNonNotes')}
        </p>
      ) : null}
    </>
  );
}

/** La tête de la fiche : fil d'Ariane (dès `md`), nom, étape, référent, puis les gestes et actions. */
function TeteDeLaFiche({ customer, nom, peutInviter }: { readonly customer: CustomerDetail; readonly nom: string; readonly peutInviter: boolean }) {
  const t = useTranslations('crm.fiche');
  const tListe = useTranslations('dashboard.pages.customers');
  const tConsole = useTranslations('console.pageHeader');
  const f = useFormatteurs();
  const depuis = customer.created_at ? f.date(customer.created_at, { day: 'numeric', month: 'short', timeZone: 'Africa/Dakar' }) : null;
  const sousTitre = [customer.phone ? formaterTelephone(customer.phone) : null, customer.email, depuis ? t('depuis', { date: depuis }) : null]
    .filter(Boolean)
    .join(' · ');
  const referent = customer.referent?.name ? nomCourt(customer.referent.name) : null;

  return (
    <header data-slot="tete-de-la-fiche">
      <FilDAriane label={tConsole('breadcrumb')} etapes={[{ label: tListe('title'), href: '/app/customers' }, { label: nom }]} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3 lg:flex-1">
          <span className="md:hidden">
            <InitialesDuClient texte={initiales(nom)} taille={52} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 truncate font-display text-affiche-22 leading-tight font-semibold tracking-titre text-foreground max-md:basis-full md:text-2xl">
                {nom}
              </h1>
              {customer.pipeline_stage ? <CustomerStageControl customerId={customer.id} name={nom} stage={customer.pipeline_stage} forme="puce" /> : null}
              {referent ? <span className="min-w-0 truncate text-sm text-muted-foreground md:hidden">{t('referentCourt', { nom: referent })}</span> : null}
            </div>
            {sousTitre ? <p className="mt-1 text-sm text-pretty text-muted-foreground max-md:hidden">{sousTitre}</p> : null}
          </div>
        </div>
        {/* Au bureau, les actions se rangent à droite et passent à la ligne : le nom garde sa place. */}
        <div className="flex flex-wrap items-center gap-2 lg:max-w-3/5 lg:justify-end">
          <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap" data-slot="gestes-de-la-fiche">
            <GestesDeLaFiche customer={customer} nom={nom} />
          </div>
          {/* Au téléphone, « Visite » est dans la barre du bas (BarreDeLaFiche). */}
          <PlanifierUneVisite
            className="max-md:hidden"
            customer={{ id: customer.id, libelle: nom, telephone: customer.phone ?? null, etape: customer.pipeline_stage ?? null }}
            // TCK-2586 (AC3) — son bien d'intérêt, posé : jour, heure, Confirmer.
            property={customer.interested_property ? { id: customer.interested_property.id, libelle: customer.interested_property.title } : undefined}
          />
          {/* TCK-2580 — la candidature ou l'offre qu'il vient de faire, le client prérempli. */}
          <EntreeSaisieDemande variante="fiche" client={{ id: customer.id, nom, detail: customer.phone ?? customer.email ?? null }} />
          <AddDocumentButton documentableType="customer" documentableId={customer.id} displayLabel={nom} />
          {peutInviter && customer.user_id === null ? <InviterACreerSonCompte customerId={customer.id} /> : null}
        </div>
      </div>
    </header>
  );
}

/** Référent et étiquettes, en une carte (maquette, bureau). */
function ReferentEtEtiquettes({
  customer,
  relationships,
  suggestions,
  className,
}: {
  readonly customer: CustomerDetail;
  readonly relationships: readonly CustomerRelationship[];
  readonly suggestions: readonly Pick<Tag, 'id' | 'name' | 'color'>[];
  readonly className?: string;
}) {
  const router = useRouter();
  return (
    <section className={cn('divide-y divide-border rounded-xl border border-border bg-card', className)}>
      <CustomerReferent customerId={customer.id} agencyId={customer.agency_id} relationships={relationships} forme="carte" />
      <div className="p-4">
        <CustomerTagPicker
          customerId={customer.id}
          initialTags={customer.tags ?? []}
          suggestions={[...suggestions]}
          onTagClick={(name) => router.push(`/app/customers?tags=${encodeURIComponent(name)}`)}
        />
      </div>
    </section>
  );
}

export function FicheDuClient({ customer, relationships, suggestionsDEtiquettes, notes, peutInviter, children }: FicheDuClientProps) {
  // P220.03 (TCK-2281) — une fiche née d'un compte sans nom : son e-mail, son numéro ou `#<id>`.
  const nom = nomAffichable(customer);
  // La barre du bas ouvre la saisie du fil : un jeton neuf à chaque toucher.
  const [demandeDeSaisie, setDemandeDeSaisie] = useState<DemandeDeSaisie | null>(null);

  return (
    <PagePleineLargeur data-slot="fiche-du-client" className="max-md:pb-6">
      <DeclarerEnTete forme="detail" titre={nom} repli="/app/customers" />
      <div className="px-4 pt-4 md:px-0 md:pt-0">
        <TeteDeLaFiche customer={customer} nom={nom} peutInviter={peutInviter} />
      </div>
      <div className="flex flex-col gap-4 px-4 pt-4 md:px-0 md:pt-6 xl:grid xl:grid-cols-[calc(var(--spacing)*105.56)_minmax(0,1fr)] xl:items-start xl:gap-6">
        <div className="flex min-w-0 flex-col gap-4" data-slot="resume-du-client">
          <ProchaineActionDuClient customer={customer} />
          <RechercheDuClient customer={customer} />
          <OrigineDuClient customer={customer} />
          <ReferentEtEtiquettes customer={customer} relationships={relationships} suggestions={suggestionsDEtiquettes} />
        </div>
        <div className="flex min-w-0 flex-col gap-6" data-slot="fil-du-client">
          <FilDuClient customer={customer} notes={notes} demandeDeSaisie={demandeDeSaisie} />
          {children}
        </div>
      </div>
      <BarreDeLaFiche customer={customer} nom={nom} onSaisir={(mode) => setDemandeDeSaisie((d) => ({ mode, jeton: (d?.jeton ?? 0) + 1 }))} />
    </PagePleineLargeur>
  );
}
