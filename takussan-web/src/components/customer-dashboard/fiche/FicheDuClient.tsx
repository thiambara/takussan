'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ellipsis, FilePlus2, Pencil, Phone, Plus } from 'lucide-react';

import { FilDAriane } from '@/components/console/PageHeader';
import { CustomerReferent } from '@/components/crm/CustomerReferent';
import { CustomerStageControl } from '@/components/crm/CustomerStageControl';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { CustomerTagPicker } from '@/components/customer-dashboard/CustomerTagPicker';
import { InitialesDuClient } from '@/components/customer-dashboard/liste/pieces';
import { DocumentUploadDialog } from '@/components/documents/DocumentUploadDialog';
import { EcrireA } from '@/components/messages/EcrireA';
import { SaisirUneDemande } from '@/components/bookings/SaisirUneDemande';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SheetClose } from '@/components/ui/sheet';
import { usePersonnelActif } from '@/hooks/usePersonnelActif';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { PlanifierUneVisite } from '@/components/visits/PlanifierUneVisite';
import { lecteurDuPersonnel, nomCourt, PARAMETRE_DE_SECTION } from '@/lib/crm/fiche-du-client';
import { initiales } from '@/lib/fiche-publique';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import { formaterTelephone } from '@/lib/phone';
import { useEstJoignable } from '@/lib/queries/conversations';
import { type CanalDeContactClient, useEnregistrerContactClient } from '@/lib/queries/customer-gestures';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import type { CustomerDetail, CustomerNote, CustomerRelationship } from '@/types/customer';
import type { Tag } from '@/types/tag';

import { BarreDeLaFiche } from './BarreDeLaFiche';
import { DossierDuClient } from './DossierDuClient';
import { ModifierLaFiche } from './ModifierLaFiche';
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
  /** TCK-955 — « Afficher » le numéro de pièce : l'admin (l'API tranche de toute façon). */
  readonly peutReveler: boolean;
}

/** Les dialogues des actions secondaires, ouverts depuis le ⋯ (téléphone ou bureau). */
type Dialogue = 'modifier' | 'saisir' | 'document';

const GESTE =
  'inline-flex h-12 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-2 text-corps font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring md:h-controle md:gap-1.5 md:rounded-lg md:px-3.5 md:text-sm md:font-medium';
const CONTOUR = 'border border-border bg-card text-foreground hover:bg-muted';
/** L'action d'un surtitre (« Modifier » de CHERCHE) : le lien des actions du référent. */
const LIEN = 'text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring';

/**
 * Appeler et WhatsApp : enregistrés au toucher pour le personnel (TCK-2583), sans trace sinon.
 * « Écrire » (maquette a-1, troisième geste) : le fil à deux avec le compte du client, quand il en a
 * un et que le serveur l'accepterait (`joignable`) ; il n'est pas un contact sortant, rien ne s'enregistre.
 */
function GestesDeLaFiche({ customer, nom, joignable }: { readonly customer: CustomerDetail; readonly nom: string; readonly joignable: boolean }) {
  const t = useTranslations('agentCrm.contact');
  const tFiche = useTranslations('crm.fiche');
  const enregistrement = useEnregistrerContactClient();
  const phone = customer.phone;
  const ecrire =
    joignable && customer.user_id !== null ? (
      <EcrireA
        personne={{ id: customer.user_id, nom }}
        libelle={tFiche('ecrire')}
        titre={tFiche('ecrireA', { nom })}
        data-slot="geste-ecrire"
        className={cn(GESTE, CONTOUR)}
        iconeClassName="size-icone md:size-4"
      />
    ) : null;
  if (!isReachable(phone)) return ecrire;
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
        <IconeWhatsApp className="size-icone flex-none md:size-4 md:text-success lg:size-4" />
        {t('whatsapp')}
      </a>
      {ecrire}
      {enregistrement.isError ? (
        <p role="alert" className="col-span-full text-ui text-destructive md:basis-full">
          {tFiche('gestesNonNotes')}
        </p>
      ) : null}
    </>
  );
}

/**
 * Lot D (décision 7a) — les actions secondaires au bureau : « Modifier » en bouton, puis un ⋯ pour
 * « Saisir une demande » (le personnel actif seul) et « Ajouter un document ». « Inviter à créer son
 * compte » vit dans la ligne « Compte client » du dossier.
 */
function ActionsDuBureau({ personnel, onOuvrir }: { readonly personnel: boolean; readonly onOuvrir: (d: Dialogue) => void }) {
  const t = useTranslations('crm.fiche');
  const tActions = useTranslations('common.actions');
  const tSaisie = useTranslations('saisieDemande');
  const tDocuments = useTranslations('documents.actions');
  return (
    <div className="flex items-center gap-2 max-md:hidden" data-slot="actions-du-bureau">
      <Button type="button" variant="outline" onClick={() => onOuvrir('modifier')}>
        <Pencil className="size-4" aria-hidden="true" />
        {tActions('edit')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('menu.plus')}
          data-slot="plus-d-actions-bureau"
          className="inline-flex size-controle flex-none items-center justify-center rounded-lg border border-border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring aria-expanded:bg-muted"
        >
          <Ellipsis className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 p-1.5">
          {personnel ? (
            <DropdownMenuItem onClick={() => onOuvrir('saisir')} className="gap-2.5 px-2.5 py-2">
              <FilePlus2 className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
              {tSaisie('entree')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => onOuvrir('document')} className="gap-2.5 px-2.5 py-2">
            <Plus className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
            {tDocuments('add_document')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Les libellés des actions du téléphone, traduits dans l'arbre de la page. */
interface LibellesDuTelephone {
  readonly modifier: string;
  readonly saisir: string;
  readonly document: string;
}

/**
 * Les mêmes actions au téléphone, dans la feuille du ⋯ de l'en-tête de la coque : chacune la ferme.
 *
 * ⚠ AUCUN `useTranslations` ici : l'élément est déclaré par la page (`DeclarerEnTete`) mais MONTÉ
 * par la coque, sous le fournisseur de messages du layout de `/app`, qui ne porte que les espaces
 * de la coque (`src/i18n/namespaces.json`, différentiel). `useTranslations('saisieDemande')` y
 * levait MISSING_MESSAGE et la page tombait au toucher de « ⋯ » (relevé de fidélité, lot E).
 * Les libellés arrivent donc traduits, de l'arbre de la page.
 */
function ActionsDuTelephone({
  personnel,
  onOuvrir,
  libelles,
}: {
  readonly personnel: boolean;
  readonly onOuvrir: (d: Dialogue) => void;
  readonly libelles: LibellesDuTelephone;
}) {
  const action = (d: Dialogue, Icone: typeof Pencil, libelle: string) => (
    <SheetClose render={<Button type="button" variant="outline" className="h-12 w-full justify-start gap-3" />} onClick={() => onOuvrir(d)}>
      <Icone className="size-5" aria-hidden="true" />
      {libelle}
    </SheetClose>
  );
  return (
    <div className="flex flex-col items-stretch gap-2 pb-2" data-slot="actions-du-telephone">
      {action('modifier', Pencil, libelles.modifier)}
      {personnel ? action('saisir', FilePlus2, libelles.saisir) : null}
      {action('document', Plus, libelles.document)}
    </div>
  );
}

/** La tête de la fiche : fil d'Ariane (dès `md`), nom, étape, référent, puis les gestes et actions. */
function TeteDeLaFiche({
  customer,
  nom,
  personnel,
  joignable,
  onOuvrir,
}: {
  readonly customer: CustomerDetail;
  readonly nom: string;
  readonly personnel: boolean;
  readonly joignable: boolean;
  readonly onOuvrir: (d: Dialogue) => void;
}) {
  const t = useTranslations('crm.fiche');
  const tListe = useTranslations('dashboard.pages.customers');
  const tConsole = useTranslations('console.pageHeader');
  const f = useFormatteurs();
  const depuis = customer.created_at ? f.date(customer.created_at, { day: 'numeric', month: 'short', timeZone: 'Africa/Dakar' }) : null;
  const sousTitre = [customer.phone ? formaterTelephone(customer.phone) : null, customer.email, depuis ? t('depuis', { date: depuis }) : null]
    .filter(Boolean)
    .join(' · ');
  const referent = customer.referent?.name ? nomCourt(customer.referent.name) : null;
  // Au téléphone, une colonne par geste rendu (maquette a-1 : Appeler, WhatsApp, Écrire).
  const nombreDeGestes = (isReachable(customer.phone) ? 2 : 0) + (joignable && customer.user_id !== null ? 1 : 0);

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
          <div
            className={cn('grid w-full gap-2 md:flex md:w-auto md:flex-wrap', nombreDeGestes === 3 ? 'grid-cols-3' : nombreDeGestes === 1 ? 'grid-cols-1' : 'grid-cols-2')}
            data-slot="gestes-de-la-fiche"
          >
            <GestesDeLaFiche customer={customer} nom={nom} joignable={joignable} />
          </div>
          {/* Au téléphone, « Visite » est dans la barre du bas (BarreDeLaFiche). */}
          {/* Maquette a-1 : le bouton plein, à la hauteur des gestes. */}
          <PlanifierUneVisite
            variant="default"
            className="max-md:hidden md:h-controle"
            customer={{ id: customer.id, libelle: nom, telephone: customer.phone ?? null, etape: customer.pipeline_stage ?? null }}
            // TCK-2586 (AC3) — son bien d'intérêt, posé : jour, heure, Confirmer.
            property={customer.interested_property ? { id: customer.interested_property.id, libelle: customer.interested_property.title } : undefined}
          />
          <ActionsDuBureau personnel={personnel} onOuvrir={onOuvrir} />
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
          // Maquette a-1 (décision 3a) : « icône · pastilles · + Étiquette » au repos.
          forme="ligne"
        />
      </div>
    </section>
  );
}

export function FicheDuClient({ customer, relationships, suggestionsDEtiquettes, notes, peutInviter, peutReveler }: FicheDuClientProps) {
  // P220.03 (TCK-2281) — une fiche née d'un compte sans nom : son e-mail, son numéro ou `#<id>`.
  const nom = nomAffichable(customer);
  const router = useRouter();
  const { remplacer } = useVueDansLUrl();
  // TCK-2580 — « Saisir une demande » : le personnel ACTIF de l'agence seul (l'API répond 403 sinon).
  const personnel = usePersonnelActif();
  // « Écrire » : le serveur dit si le compte du client accepterait une directe de ce lecteur.
  const joignable = useEstJoignable(customer.user_id);
  // La barre du bas ouvre la saisie du fil : un jeton neuf à chaque toucher.
  const [demandeDeSaisie, setDemandeDeSaisie] = useState<DemandeDeSaisie | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const fermerSauf = (d: Dialogue) => (ouvert: boolean) => setDialogue(ouvert ? d : null);
  const tActions = useTranslations('common.actions');
  const tSaisie = useTranslations('saisieDemande');
  const tDocuments = useTranslations('documents.actions');
  const tCherche = useTranslations('crm.fiche.cherche');
  const libellesDuTelephone = { modifier: tActions('edit'), saisir: tSaisie('entree'), document: tDocuments('add_document') };

  return (
    <PagePleineLargeur data-slot="fiche-du-client" className="max-md:pb-6">
      <DeclarerEnTete forme="detail" titre={nom} repli="/app/customers" actions={<ActionsDuTelephone personnel={personnel} onOuvrir={setDialogue} libelles={libellesDuTelephone} />} />
      <div className="px-4 pt-4 md:px-0 md:pt-0">
        <TeteDeLaFiche customer={customer} nom={nom} personnel={personnel} joignable={joignable} onOuvrir={setDialogue} />
      </div>
      <div className="flex flex-col gap-4 px-4 pt-4 md:px-0 md:pt-6 xl:grid xl:grid-cols-[calc(var(--spacing)*105.56)_minmax(0,1fr)] xl:items-start xl:gap-6">
        <div className="flex min-w-0 flex-col gap-4" data-slot="resume-du-client">
          <ProchaineActionDuClient customer={customer} />
          {/* Maquette a-1 : « Modifier » au surtitre de CHERCHE ouvre la feuille d'édition, sa recherche dépliée —
              pour qui lit les critères seulement (`budget_max` servi : la règle de `showsCriteria` de
              CustomerForm) ; sans eux, la feuille n'aurait pas de section « Sa recherche ». */}
          <RechercheDuClient
            customer={customer}
            droite={
              'budget_max' in customer ? (
                <button type="button" className={LIEN} aria-label={tCherche('modifierAria')} onClick={() => setDialogue('modifier')} data-slot="modifier-la-recherche">
                  {tActions('edit')}
                </button>
              ) : undefined
            }
          />
          <OrigineDuClient customer={customer} />
          <ReferentEtEtiquettes customer={customer} relationships={relationships} suggestions={suggestionsDEtiquettes} />
        </div>
        <div className="flex min-w-0 flex-col gap-6" data-slot="fil-du-client">
          <FilDuClient customer={customer} notes={notes} demandeDeSaisie={demandeDeSaisie} />
          <DossierDuClient customer={customer} relationships={relationships} peutInviter={peutInviter} peutReveler={peutReveler} />
        </div>
      </div>
      <BarreDeLaFiche customer={customer} nom={nom} onSaisir={(mode) => setDemandeDeSaisie((d) => ({ mode, jeton: (d?.jeton ?? 0) + 1 }))} />
      <ModifierLaFiche customer={customer} open={dialogue === 'modifier'} onOpenChange={fermerSauf('modifier')} peutReveler={peutReveler} />
      {personnel ? (
        // TCK-2580 — la candidature ou l'offre qu'il vient de faire, le client prérempli.
        <SaisirUneDemande
          open={dialogue === 'saisir'}
          onOpenChange={fermerSauf('saisir')}
          client={{ id: customer.id, nom, detail: customer.phone ?? customer.email ?? null }}
        />
      ) : null}
      <DocumentUploadDialog
        open={dialogue === 'document'}
        onOpenChange={fermerSauf('document')}
        defaultDocumentable={{ type: 'customer', id: customer.id, label: nom }}
        // AC4 — les documents viennent du show serveur : la page se relit, la ligne s'ouvre.
        onUploaded={() => {
          router.refresh();
          remplacer({ [PARAMETRE_DE_SECTION]: 'documents' });
        }}
      />
    </PagePleineLargeur>
  );
}
