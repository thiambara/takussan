'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Banknote,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  FolderOpen,
  LogOut,
  MoreHorizontal,
  PenLine,
  Plus,
  RefreshCw,
  ScrollText,
  Send,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { PageHeader, StatusBadge, type StatusTone } from '@/components/console';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { whatsappHref } from '@/components/crm/contact';
import { BoutonTelechargement } from '@/components/documents/BoutonTelechargement';
import { DocumentUploadDialog } from '@/components/documents/DocumentUploadDialog';
import { ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { PayOnlineButton } from '@/components/payments/PayOnlineButton';
import { detailMontantDu } from '@/components/payments/montant-du';
import { LeaveReviewCta } from '@/components/reviews/LeaveReviewCta';
import { canLeaseLeaveReview } from '@/components/reviews/reviewEligibility';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { IconeDeLigne, LigneDeListe } from '@/components/ui/ligne-de-liste';
import { SheetClose } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initialesDe, nomCompletDe } from '@/lib/identite';
import { useDocumentsGeneres } from '@/lib/queries/documents';
import { useGenerateSchedule, useLease, useLeasePayments, type LeaseWithRelations } from '@/lib/queries/leases';
import { cn } from '@/lib/utils';
import type { LeasePayment, LeaseStatus } from '@/types/lease';

import { DepositRefundBanner } from './DepositRefundBanner';
import { EarlyTerminationBanner } from './EarlyTerminationBanner';
import { EarlyTerminationDialog } from './EarlyTerminationDialog';
import { GuarantorSection } from './GuarantorSection';
import { LeaseChainTimeline } from './LeaseChainTimeline';
import { LeasePaymentDialog } from './LeasePaymentDialog';
import { LeaseRenewalDialog } from './LeaseRenewalDialog';
import { LeaseSchedule, ordreDeLEcheancier } from './LeaseSchedule';
import { LeaseSignaturePanel } from './LeaseSignaturePanel';
import { AbandonnerLeBrouillon } from './fiche/AbandonnerLeBrouillon';
import { CarteCaution, CarteDuree, CarteLoyer } from './fiche/CartesDuBail';
import { FeuilleDeRevision } from './fiche/FeuilleDeRevision';
import { OngletDocumentsDuBail, OngletHistoriqueDuBail } from './fiche/OngletsDuBail';
import { Carte, Partie, TitreBloc, type PartieDuBail } from './fiche/PiecesDuBail';
import {
  echeanceAPayer,
  estLeLocataireDuBail,
  gestePrincipal,
  gestesSecondaires,
  raisonDAbandonEmpeche,
  type GestePrincipal,
  type GesteSecondaire,
  type RaisonDAbandonEmpeche,
} from './fiche/gestes';

/**
 * TCK-2645 — LA FICHE D'UN BAIL, « dossier du bail » (maquette `app-baux` a, écran « Fiche »).
 *
 * « Bail de {locataire} » (« Mon bail » pour le locataire), le bien en lien, statut · type · référence ;
 * les parties avec Appeler / WhatsApp (seulement un numéro que l'API sert) ; les cartes Loyer, Durée,
 * Caution ; le dossier (échéancier, état des lieux, contrat, conditions, documents) ; un geste
 * principal et la feuille « Gestes ». Au bureau (dès `xl`, comme la maquette), deux colonnes : le
 * dossier à gauche, « Parties » et « Actions » à droite ; onglets Dossier · Documents · Historique.
 *
 * ⚠ AUCUN geste, aucun texte ne dépend de `user.roles` (P2 de l'audit) : tout suit `abilities`,
 * `can_sign_as` et `can_request_signature` (`./fiche/gestes.ts`), et rien n'est offert avant eux.
 * « Le lecteur est le locataire » se lit sur `abilities.give_notice` (décision 12).
 *
 * Rien ne se perd (contraintes du ticket) : chaîne des baux, signature par code et voie papier,
 * bannières de résiliation et de restitution, garants, invitation à l'avis, alerte des retards, et
 * tous les dialogues (paiement reçu, renouvellement, préavis ou résiliation, restitution, dépôt).
 */

const KNOWN_LEASE_TYPES = new Set(['residential_rent', 'commercial_rent', 'seasonal_rent', 'sale']);

const TON_DU_BAIL: Record<LeaseStatus, StatusTone> = {
  draft: 'neutral',
  pending_signature: 'attention',
  active: 'success',
  terminating: 'attention',
  terminated: 'neutral',
  expired: 'neutral',
  renewed: 'neutral',
};

type Onglet = 'dossier' | 'documents' | 'historique';
/** Les gestes qu'un lien peut ouvrir (`?geste=`) : seulement ceux que la fiche offre à CE lecteur. */
const GESTES_PAR_LIEN: readonly GesteSecondaire[] = ['reviser', 'restituer', 'renouveler'];
/** Au bureau comme au téléphone : les N prochaines échéances, puis « Les n échéances » (décision 4 a). */
const ECHEANCES_VISIBLES = 6;

interface LeaseDetailProps {
  readonly leaseId: number;
  /** L'onglet « Historique » : la piste d'audit s'ouvre à ce lecteur (décision 11, lue par la page). */
  readonly historique?: boolean;
}

export function LeaseDetail({ leaseId, historique = false }: LeaseDetailProps) {
  const tLease = useTranslations('lease');
  const tCommon = useTranslations('common');
  const leaseQuery = useLease(leaseId);
  const { data, isLoading, isError } = leaseQuery;
  const { data: paymentsData } = useLeasePayments(leaseId);
  const lease = data?.data;
  const paiements = paymentsData?.data;
  const locataire = lease ? estLeLocataireDuBail(lease) : false;
  const aPayer = locataire && paiements ? echeanceAPayer(paiements) : null;
  const { providers, isLoading: fournisseursEnLecture } = usePaymentProviders('lease-payments', aPayer?.id ?? null);
  const { params, remplacer } = useVueDansLUrl();

  // TCK-1189 (P101.02) — le seul titre de la page est celui du bail : les écrans de chargement
  // et d'erreur gardent un h1, comme `BookingDetail`.
  const titreDeRepli = <h1 className="sr-only">{tLease('fallbackReference', { id: String(leaseId) })}</h1>;
  if (isLoading) {
    return (
      <div className="space-y-4 px-4 pt-4 md:px-0" aria-busy="true">
        {titreDeRepli}
        <Skeleton className="h-16 w-64 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }
  if (isError || !lease) {
    return (
      <>
        {titreDeRepli}
        <ErrorState message={tLease('detail.error')} onRetry={() => void leaseQuery.refetch()} retryLabel={tCommon('actions.retry')} />
      </>
    );
  }

  // Tant que les fournisseurs se lisent, le locataire qui doit n'a pas encore son geste : ni
  // « Payer » qui disparaîtrait, ni le contrat qui lui céderait la place.
  const paiementsDesGestes = locataire && aPayer && fournisseursEnLecture ? undefined : paiements;
  const principal = gestePrincipal(lease, { paiements: paiementsDesGestes, paiementEnLigne: providers.length > 0 });
  const secondaires = gestesSecondaires(lease, paiements);
  const ongletDemande = params.get('onglet');
  const onglet: Onglet = ongletDemande === 'documents' || (ongletDemande === 'historique' && historique) ? ongletDemande : 'dossier';
  const gesteDemande = params.get('geste') as GesteSecondaire | null;
  const gesteDeLUrl = gesteDemande && GESTES_PAR_LIEN.includes(gesteDemande) && secondaires.includes(gesteDemande) ? gesteDemande : null;

  return (
    <FicheDuBail
      lease={lease}
      paiements={paiements}
      locataire={locataire}
      principal={principal}
      secondaires={secondaires}
      onglet={onglet}
      historique={historique}
      gesteDeLUrl={gesteDeLUrl}
      fournisseurs={providers}
      remplacer={remplacer}
    />
  );
}

interface FicheDuBailProps {
  readonly lease: LeaseWithRelations;
  readonly paiements: readonly LeasePayment[] | undefined;
  readonly locataire: boolean;
  readonly principal: GestePrincipal | null;
  readonly secondaires: readonly GesteSecondaire[];
  readonly onglet: Onglet;
  readonly historique: boolean;
  readonly gesteDeLUrl: GesteSecondaire | null;
  readonly fournisseurs: ReturnType<typeof usePaymentProviders>['providers'];
  readonly remplacer: ReturnType<typeof useVueDansLUrl>['remplacer'];
}

function FicheDuBail({ lease, paiements, locataire, principal, secondaires, onglet, historique, gesteDeLUrl, fournisseurs, remplacer }: FicheDuBailProps) {
  const tLease = useTranslations('lease');
  const t = useTranslations('lease.fiche');
  const tStatus = useTranslations('lease.status');
  // Maquette a-1 : le type court (« Habitation »), pas le libellé long de la liste (« Bail d'habitation »).
  const tTypes = useTranslations('lease.fiche.types');
  const tPages = useTranslations('dashboard.pages');
  const tConsole = useTranslations('console.pageHeader');
  const messageErreur = useMessageErreurApi();
  const generer = useGenerateSchedule(lease.id);
  const [gesteOuvert, setGesteOuvert] = useState<GesteSecondaire | null>(null);
  const [encaisser, setEncaisser] = useState<{ readonly paiement: number | null } | null>(null);
  const [feuilleGestes, setFeuilleGestes] = useState(false);
  const [erreurEcheancier, setErreurEcheancier] = useState<string | null>(null);
  // TCK-2645 (lot 3) — « Les n échéances » est l'action de la carte (maquette a-1) : la fiche tient l'état.
  const [toutesLesEcheances, setToutesLesEcheances] = useState(false);
  const ouvert = gesteOuvert ?? gesteDeLUrl;

  const reference = lease.reference_number || tLease('fallbackReference', { id: String(lease.id) });
  const nomLocataire = nomCompletDe(lease.tenant);
  const titre = locataire ? t('monBail') : nomLocataire ? t('titre', { nom: nomLocataire }) : reference;
  const a = lease.abilities;
  // TCK-2764 — une échéance saisie ou un état des lieux empêche l'abandon : il n'est pas offert, sa raison l'est.
  const empeche = raisonDAbandonEmpeche(lease, paiements);
  const peutTelechargerLeContrat = a?.download_contract === true;
  const peutDeposer = a?.add_document === true;
  const lignes = paiements ? ordreDeLEcheancier(paiements) : [];
  const type = lease.type ? (KNOWN_LEASE_TYPES.has(lease.type) ? tTypes(lease.type) : lease.type) : null;

  const fermerLeGeste = () => {
    setGesteOuvert(null);
    if (gesteDeLUrl) remplacer({ geste: null });
  };
  const lancer = (geste: GesteSecondaire) => {
    setFeuilleGestes(false);
    if (geste === 'generer') {
      setErreurEcheancier(null);
      // P228.01 (TCK-2210) — le refus de « Générer l'échéancier » se dit (ADR-0019).
      generer.mutate({}, { onError: (erreur) => setErreurEcheancier(messageErreur(erreur)) });
      return;
    }
    setGesteOuvert(geste);
  };
  const choisirOnglet = (o: Onglet) => remplacer({ onglet: o === 'dossier' ? null : o });

  const parties: PartieDuBail[] = [
    !locataire && lease.tenant
      ? { qualite: 'locataire' as const, nom: nomLocataire ?? reference, initiales: initialesDe(lease.tenant), telephone: lease.tenant.phone ?? null }
      : null,
    lease.landlord
      ? { qualite: 'bailleur' as const, nom: lease.landlord.full_name ?? nomCompletDe(lease.landlord) ?? '—', initiales: initialesDe(lease.landlord), telephone: lease.landlord.phone ?? null }
      : null,
    lease.agent
      ? { qualite: 'agent' as const, nom: lease.agent.full_name ?? nomCompletDe(lease.agent) ?? '—', initiales: initialesDe(lease.agent), telephone: lease.agent.phone ?? null }
      : null,
  ].filter((p): p is PartieDuBail => p !== null);

  const contrat = peutTelechargerLeContrat ? (
    <BoutonTelechargement chemin={`/api/leases/${lease.id}/contract/pdf`} nomFichier={`bail-${lease.reference_number ?? lease.id}.pdf`} variant="outline">
      <Download className="size-4" strokeWidth={1.75} aria-hidden="true" />
      {t('gestes.contratPdf')}
    </BoutonTelechargement>
  ) : null;

  // Maquette a-1, bureau : « Villa … · LS-… », puis le statut et le type. Le retard ne s'y dit pas : il
  // vit à la carte « Loyer » et à la ligne « Échéancier » du dossier.
  const sousTitre = (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      {lease.property ? (
        locataire ? (
          <span className="font-medium text-foreground">{lease.property.title}</span>
        ) : (
          <Link href={`/app/properties/${lease.property.id}`} className="font-medium text-primary hover:underline">
            {lease.property.title}
          </Link>
        )
      ) : null}
      <span className="tabular-nums">{lease.property ? `· ${reference}` : reference}</span>
      <StatusBadge tone={TON_DU_BAIL[lease.status] ?? 'neutral'} label={tStatus(lease.status)} />
      {type ? <StatusBadge tone="neutral" label={type} /> : null}
    </span>
  );

  // Maquette a-1, téléphone : le bien sur sa ligne (15 px, lien et chevron), puis statut, type et référence.
  const sousTitreDuTelephone = (
    <div className="px-4 pt-4 md:hidden">
      {lease.property ? (
        locataire ? (
          <p className="text-corps font-semibold text-foreground">{lease.property.title}</p>
        ) : (
          <Link
            href={`/app/properties/${lease.property.id}`}
            className="-my-1 inline-flex max-w-full items-center gap-1 py-1 text-corps font-semibold text-primary"
            data-testid="bien-du-bail-telephone"
          >
            <span className="truncate">{lease.property.title}</span>
            <ChevronRight className="size-4 flex-none" aria-hidden="true" />
          </Link>
        )
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={TON_DU_BAIL[lease.status] ?? 'neutral'} label={tStatus(lease.status)} />
        {type ? <StatusBadge tone="neutral" label={type} /> : null}
        <span className="pl-1 text-ui tabular-nums text-muted-foreground">{reference}</span>
      </div>
    </div>
  );

  // Le « ⋯ » de l'en-tête du téléphone (maquette a-1) : ce que l'en-tête du bureau offre et que le dossier
  // n'a pas — « Ajouter un document ». Rendu par la coque, hors de la frontière i18n des baux : le
  // libellé part traduit d'ici.
  const actionsDeLEnTete = peutDeposer ? (
    <div className="flex flex-col items-stretch gap-2 pb-2" data-slot="actions-du-telephone">
      <SheetClose render={<Button type="button" variant="outline" className="h-12 w-full justify-start gap-3" />} onClick={() => lancer('document')}>
        <Plus className="size-5" aria-hidden="true" />
        {t('gestes.document')}
      </SheetClose>
    </div>
  ) : undefined;

  const cartes = (
    <div className="grid gap-3 md:grid-cols-3 md:gap-4">
      <CarteLoyer lease={lease} paiements={paiements} aRegler={locataire && principal?.type === 'contrat' && aRegler(paiements)} />
      <CarteDuree lease={lease} />
      <CarteCaution lease={lease} paiements={paiements} />
    </div>
  );

  const dossier = (
    <DossierDuBail
      lease={lease}
      lignes={lignes}
      peutTelechargerLeContrat={peutTelechargerLeContrat}
      onDocuments={() => choisirOnglet('documents')}
    />
  );

  const echeancier = (
    <Carte
      id="echeancier"
      titre={
        lignes.length > ECHEANCES_VISIBLES && !toutesLesEcheances
          ? // Au téléphone, « Échéancier » seul : avec « Les n échéances » à côté, la suite était coupée (bail 36, 390 px).
            t.rich('echeancier.prochaines', { n: ECHEANCES_VISIBLES, l: (c) => <span className="max-md:hidden">{c}</span> })
          : t('echeancier.titre')
      }
      action={
        lignes.length > ECHEANCES_VISIBLES ? (
          <button
            type="button"
            aria-expanded={toutesLesEcheances}
            onClick={() => setToutesLesEcheances((v) => !v)}
            className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
          >
            {toutesLesEcheances ? t('echeancier.moins') : t('echeancier.toutes', { n: lignes.length })}
          </button>
        ) : undefined
      }
      className="scroll-mt-20 overflow-hidden"
    >
      {lease.status === 'draft' ? <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">{tLease('detail.activateBeforeSchedule')}</p> : null}
      <LeaseSchedule
        leaseId={lease.id}
        agencyId={lease.agency_id ?? null}
        landlordId={lease.landlord_id}
        canManage={a?.update === true}
        canRecordPayment={a?.record_payment === true}
        locataire={locataire}
        limite={ECHEANCES_VISIBLES}
        toutes={toutesLesEcheances}
        onEncaisser={(id) => setEncaisser({ paiement: id })}
      />
    </Carte>
  );

  const principalProps = { lease, geste: principal, fournisseurs, onEncaisser: (id: number | null) => setEncaisser({ paiement: id }) };

  return (
    <PagePleineLargeur data-slot="fiche-du-bail" className="max-md:pb-6">
      <DeclarerEnTete forme="detail" titre={titre} repli="/app/leases" actions={actionsDeLEnTete} />

      <div className="max-md:hidden">
        <PageHeader
          fil={{ label: tConsole('breadcrumb'), etapes: [{ label: tPages('leases.title'), href: '/app/leases' }, { label: titre }] }}
          title={titre}
          description={sousTitre}
          actions={
            <>
              {contrat}
              {peutDeposer ? (
                <Button type="button" variant="outline" onClick={() => lancer('document')}>
                  <Plus className="size-4" aria-hidden="true" />
                  {t('gestes.document')}
                </Button>
              ) : null}
            </>
          }
          dessous={
            <Tabs value={onglet} onValueChange={(v) => choisirOnglet(v as Onglet)}>
              <TabsList variant="line" aria-label={t('onglets.libelle')}>
                <TabsTrigger value="dossier">{t('onglets.dossier')}</TabsTrigger>
                <TabsTrigger value="documents">{t('onglets.documents')}</TabsTrigger>
                {historique ? <TabsTrigger value="historique">{t('onglets.historique')}</TabsTrigger> : null}
              </TabsList>
            </Tabs>
          }
        />
      </div>

      {/* Au téléphone, l'en-tête de la coque porte le titre ; le bien, le statut et la référence ici. */}
      {sousTitreDuTelephone}

      {onglet !== 'dossier' ? (
        <div className="space-y-3 px-4 pt-4 md:px-0 md:pt-6">
          <Button type="button" variant="ghost" className="-ml-2 md:hidden" onClick={() => choisirOnglet('dossier')}>
            {t('onglets.retour')}
          </Button>
          {onglet === 'documents' ? <OngletDocumentsDuBail lease={lease} nom={titre} /> : <OngletHistoriqueDuBail lease={lease} />}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 pt-4 md:px-0 md:pt-6 xl:grid xl:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*94.44)] xl:items-start xl:gap-6">
          <div className="contents xl:block xl:space-y-5">
            <div className="order-1 space-y-3 empty:hidden">
              <LeaseChainTimeline leaseId={lease.id} currentId={lease.id} />
              {/* TCK-596 §4B (ADR-0042) — la signature par code remplace l'« Activer » sans preuve. */}
              {/* Le panneau ne se rend qu'avant l'activation : vide, son ancre empêcherait `empty:hidden` (maquette a-1 : +13,5 px). */}
              {lease.status === 'draft' || lease.status === 'pending_signature' ? (
                <div id="signature" className="scroll-mt-20">
                  <LeaseSignaturePanel lease={lease} />
                </div>
              ) : null}
              {principal?.type === 'envoyer-signature' && principal.bloque ? (
                <p className="text-sm text-muted-foreground" data-testid="signature-bloquee">
                  {t(`gestes.bloque.${principal.bloque}`)}
                </p>
              ) : null}
              <EarlyTerminationBanner lease={lease} canCancel={a?.request_early_termination === true} locataire={locataire} />
              <DepositRefundBanner
                lease={lease}
                canRefund={a?.refund_deposit === true}
                ouvert={ouvert === 'restituer'}
                onOuvertChange={(o) => (o ? setGesteOuvert('restituer') : fermerLeGeste())}
              />
              {erreurEcheancier ? (
                <p role="alert" className="text-sm text-destructive">
                  {erreurEcheancier}
                </p>
              ) : null}
            </div>
            <div className="order-3">{cartes}</div>
            <div className="order-5 xl:hidden">
              <TitreBloc className="pt-2 pb-2">{t('dossier.titre')}</TitreBloc>
              {dossier}
            </div>
            <div className="order-6">{echeancier}</div>
            <div className="max-xl:hidden">{dossier}</div>
            <div className="order-7">
              <GuarantorSection leaseId={lease.id} canManage={a?.update === true} />
            </div>
            {/* P201.02 (TCK-2035) — l'avis n'est offert qu'au locataire du bail (`abilities.leave_review`). */}
            {a?.leave_review === true && canLeaseLeaveReview(lease) && lease.property?.slug ? (
              <div className="order-8">
                <LeaveReviewCta
                  slug={lease.property.slug}
                  context={lease.status === 'active' ? tLease('detail.reviewContextActive') : tLease('detail.reviewContextEnded')}
                  propertyTitle={lease.property.title}
                />
              </div>
            ) : null}
          </div>

          <aside className="contents xl:sticky xl:top-6 xl:block xl:space-y-4">
            {parties.length > 0 ? (
              <Carte titre={t('parties.titre')} enteteClassName="max-md:hidden" className="order-2 divide-y divide-border">
                {parties.map((p) => (
                  // Maquette a-1 : au téléphone, la carte nomme le locataire et le bailleur ; l'agent, au bureau.
                  <Partie key={p.qualite} partie={p} className={p.qualite === 'agent' ? 'max-md:hidden' : undefined} />
                ))}
              </Carte>
            ) : null}
            {principal || secondaires.length > 0 || empeche ? (
              <Carte titre={t('gestes.actions')} className="order-4 max-md:hidden" data-testid="carte-actions">
                <div className="space-y-2 p-4">
                  {principal ? <BoutonPrincipal {...principalProps} pleineLargeur /> : null}
                  {principal?.type === 'envoyer-signature' && principal.bloque ? (
                    <p className="text-ui text-muted-foreground">{t(`gestes.bloque.${principal.bloque}`)}</p>
                  ) : null}
                  <ListeDesGestes lease={lease} gestes={secondaires} onGeste={lancer} enCours={generer.isPending} forme="boutons" abandonEmpeche={empeche} />
                </div>
              </Carte>
            ) : null}
          </aside>
        </div>
      )}

      {principal || secondaires.length > 0 || empeche ? (
        <BarreDAction taille="action" secondaire={principal ? 'premier' : undefined}>
          {secondaires.length > 0 || empeche ? (
            <Button type="button" variant="outline" size="icon" aria-label={t('gestes.plus')} onClick={() => setFeuilleGestes(true)}>
              <MoreHorizontal className="size-5" aria-hidden="true" />
            </Button>
          ) : null}
          {principal ? <BoutonPrincipal {...principalProps} pleineLargeur /> : null}
        </BarreDAction>
      ) : null}

      {feuilleGestes ? (
        <FeuilleDuBas open onOpenChange={(o) => (o ? undefined : setFeuilleGestes(false))} titre={t('gestes.titre')}>
          <ListeDesGestes lease={lease} gestes={secondaires} onGeste={lancer} enCours={generer.isPending} forme="lignes" abandonEmpeche={empeche} />
        </FeuilleDuBas>
      ) : null}

      {ouvert === 'reviser' ? (
        <FeuilleDeRevision
          lease={lease}
          paiements={paiements}
          ouverte
          onFermer={fermerLeGeste}
          libelle={[nomLocataire, lease.property?.title].filter(Boolean).join(' · ') || reference}
        />
      ) : null}
      {a?.record_payment ? (
        <LeasePaymentDialog
          leaseId={lease.id}
          open={encaisser !== null}
          onOpenChange={(o) => (o ? undefined : setEncaisser(null))}
          paiementInitial={encaisser?.paiement ?? undefined}
        />
      ) : null}
      {a?.renew ? <LeaseRenewalDialog open={ouvert === 'renouveler'} onOpenChange={(o) => (o ? setGesteOuvert('renouveler') : fermerLeGeste())} parent={lease} /> : null}
      {a?.request_early_termination ? (
        <EarlyTerminationDialog
          open={ouvert === 'preavis' || ouvert === 'resilier'}
          onOpenChange={(o) => (o ? undefined : fermerLeGeste())}
          lease={lease}
        />
      ) : null}
      {a?.abandon ? <AbandonnerLeBrouillon lease={lease} open={ouvert === 'abandonner'} onOpenChange={(o) => (o ? undefined : fermerLeGeste())} /> : null}
      {peutDeposer ? (
        <DocumentUploadDialog
          open={ouvert === 'document'}
          onOpenChange={(o) => (o ? setGesteOuvert('document') : fermerLeGeste())}
          defaultDocumentable={{ type: 'lease', id: lease.id, label: titre }}
        />
      ) : null}
    </PagePleineLargeur>
  );
}

/** Le locataire a une échéance due (décision 14 : sans paiement en ligne, il la règle à l'agence). */
function aRegler(paiements: readonly LeasePayment[] | undefined): boolean {
  return paiements ? echeanceAPayer(paiements) !== null : false;
}

function BoutonPrincipal({
  lease,
  geste,
  fournisseurs,
  onEncaisser,
  pleineLargeur,
}: {
  readonly lease: LeaseWithRelations;
  readonly geste: GestePrincipal | null;
  readonly fournisseurs: ReturnType<typeof usePaymentProviders>['providers'];
  readonly onEncaisser: (paiement: number | null) => void;
  readonly pleineLargeur?: boolean;
}) {
  const t = useTranslations('lease.fiche.gestes');
  if (!geste) return null;
  const largeur = pleineLargeur ? 'w-full' : undefined;
  switch (geste.type) {
    case 'encaisser':
      return (
        <Button type="button" className={largeur} onClick={() => onEncaisser(geste.paiement)} data-testid="geste-principal">
          <Wallet className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('encaisser')}
        </Button>
      );
    case 'envoyer-signature':
      return geste.bloque ? (
        <Button type="button" className={largeur} disabled data-testid="geste-principal">
          <Send className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('envoyerSignature')}
        </Button>
      ) : (
        <a href="#signature" className={cn(buttonVariants(), largeur)} data-testid="geste-principal">
          <Send className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('envoyerSignature')}
        </a>
      );
    case 'signer':
      return (
        <a href="#signature" className={cn(buttonVariants(), largeur)} data-testid="geste-principal">
          <PenLine className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('signer')}
        </a>
      );
    case 'relancer-signature':
      return (
        <a
          href={whatsappHref(geste.telephone, t('relanceMessage', { prenom: geste.prenom, reference: lease.reference_number ?? `#${lease.id}` }))}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants(), largeur)}
          data-testid="geste-principal"
        >
          <IconeWhatsApp className="size-4" />
          {t('relancerSignature')}
        </a>
      );
    case 'payer':
      return (
        <span className={cn('contents', pleineLargeur && '[&>button]:w-full')} data-testid="geste-principal">
          <PayOnlineButton
            paymentType="lease-payments"
            paymentId={geste.paiement.id}
            currency={geste.paiement.currency}
            availableProviders={fournisseurs}
            montant={detailMontantDu(geste.paiement)}
          />
        </span>
      );
    case 'quittance':
      return (
        <BoutonTelechargement
          chemin={`/api/leases/${lease.id}/receipts/${geste.paiement.id}/pdf`}
          nomFichier={`quittance-${geste.paiement.reference_number ?? geste.paiement.id}.pdf`}
          className={largeur}
        >
          <Download className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('quittance')}
        </BoutonTelechargement>
      );
    case 'contrat':
      return (
        <BoutonTelechargement chemin={`/api/leases/${lease.id}/contract/pdf`} nomFichier={`bail-${lease.reference_number ?? lease.id}.pdf`} className={largeur}>
          <Download className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('contrat')}
        </BoutonTelechargement>
      );
  }
}

const ICONES: Record<GesteSecondaire, typeof Wallet> = {
  reviser: TrendingUp,
  renouveler: RefreshCw,
  document: Plus,
  restituer: Banknote,
  generer: CalendarPlus,
  preavis: Send,
  resilier: LogOut,
  abandonner: Trash2,
};

/**
 * Les gestes de « ⋯ » (feuille du téléphone) et de la carte « Actions » (bureau). La résiliation est
 * dernière et séparée ; le préavis du locataire est précédé de son délai et de son indemnité (AC6).
 * Sur un brouillon, l'abandon tient cette place (TCK-2764) — ou sa raison, quand une échéance est
 * saisie ou qu'un état des lieux existe (`raisonDAbandonEmpeche`).
 */
function ListeDesGestes({
  lease,
  gestes,
  onGeste,
  enCours,
  forme,
  abandonEmpeche,
}: {
  readonly lease: LeaseWithRelations;
  readonly gestes: readonly GesteSecondaire[];
  readonly onGeste: (geste: GesteSecondaire) => void;
  readonly enCours: boolean;
  readonly forme: 'lignes' | 'boutons';
  readonly abandonEmpeche: RaisonDAbandonEmpeche | null;
}) {
  const t = useTranslations('lease.fiche.gestes');
  const libelle = (g: GesteSecondaire) => (g === 'generer' && enCours ? t('generation') : t(g));
  const estDeFin = (g: GesteSecondaire) => g === 'preavis' || g === 'resilier' || g === 'abandonner';
  const courants = gestes.filter((g) => !estDeFin(g));
  const fin = gestes.find(estDeFin) ?? null;
  const raison = abandonEmpeche ? (
    <p className="text-ui text-muted-foreground" data-testid="abandon-empeche">
      {t(abandonEmpeche === 'etatDesLieux' ? 'abandonEmpecheEtatDesLieux' : 'abandonEmpeche')}
    </p>
  ) : null;
  const conditions =
    fin === 'preavis'
      ? [
          lease.notice_period_days ? t('preavisJours', { jours: lease.notice_period_days }) : null,
          lease.early_termination_penalty_months ? t('indemniteMois', { mois: lease.early_termination_penalty_months }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  if (forme === 'lignes') {
    return (
      <div className="-mx-4" data-testid="feuille-gestes">
        {courants.map((g) => {
          const Icone = ICONES[g];
          return (
            <LigneDeListe
              key={g}
              titre={libelle(g)}
              onClick={() => onGeste(g)}
              debut={
                <IconeDeLigne>
                  <Icone strokeWidth={1.75} />
                </IconeDeLigne>
              }
            />
          );
        })}
        {fin ? (
          <div className="mt-2 border-t border-border px-4 pt-3">
            {conditions ? <p className="pb-2 text-ui text-muted-foreground" data-testid="conditions-du-preavis">{conditions}</p> : null}
            <Button type="button" variant="ghost" className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onGeste(fin)}>
              {t(fin)}
            </Button>
          </div>
        ) : null}
        {raison ? <div className="mt-2 border-t border-border px-4 pt-3">{raison}</div> : null}
      </div>
    );
  }

  return (
    <>
      {courants.map((g) => {
        const Icone = ICONES[g];
        return (
          <Button key={g} type="button" variant="outline" className="w-full justify-start" disabled={g === 'generer' && enCours} onClick={() => onGeste(g)}>
            <Icone className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
            {libelle(g)}
          </Button>
        );
      })}
      {fin ? (
        <div className="pt-1 text-center">
          {conditions ? <p className="pb-1 text-ui text-muted-foreground">{conditions}</p> : null}
          <Button type="button" variant="link" className="h-auto text-ui font-medium text-destructive" onClick={() => onGeste(fin)}>
            {t(fin)}
          </Button>
        </div>
      ) : null}
      {raison ? <div className="pt-1 text-center">{raison}</div> : null}
    </>
  );
}

/** Le dossier : les liens de la maquette, chacun avec ce que l'API en dit. */
function DossierDuBail({
  lease,
  lignes,
  peutTelechargerLeContrat,
  onDocuments,
}: {
  readonly lease: LeaseWithRelations;
  readonly lignes: readonly LeasePayment[];
  readonly peutTelechargerLeContrat: boolean;
  readonly onDocuments: () => void;
}) {
  const t = useTranslations('lease.fiche.dossier');
  const tLease = useTranslations('lease');
  const f = useFormatteurs();
  const generes = useDocumentsGeneres({ type: 'lease', id: lease.id });
  const [conditions, setConditions] = useState(false);
  const edl = generes.data?.data.find((d) => d.category === 'inventory_move_in') ?? null;
  const signe = (lease.signatures ?? []).filter((s) => s.current && s.signed_at).map((s) => s.signed_at as string).sort().at(-1) ?? lease.signed_at;
  const payees = lignes.filter((p) => p.status === 'paid').length;
  const retards = lignes.filter((p) => p.is_overdue).length;
  const aVenir = lignes.filter((p) => !p.is_overdue && (p.status === 'pending' || p.status === 'partially_paid')).length;
  const icone = (Icone: typeof Wallet): ReactNode => (
    <IconeDeLigne>
      <Icone strokeWidth={1.75} />
    </IconeDeLigne>
  );
  const clauses = [lease.terms ? tLease('terms') : null, lease.special_conditions ? tLease('specialConditions') : null].filter(Boolean);

  return (
    <Carte className="overflow-hidden [&>[data-slot=ligne-de-liste]:last-child]:border-b-0" data-testid="dossier-du-bail">
      <LigneDeListe
        className="xl:hidden"
        href="#echeancier"
        chevron
        debut={icone(CalendarClock)}
        titre={t('echeancier', { n: lignes.length })}
        detail={[payees ? t('payees', { n: payees }) : null, retards ? t('enRetard', { n: retards }) : null, aVenir ? t('aVenir', { n: aVenir }) : null].filter(Boolean).join(' · ')}
      />
      <LigneDeListe
        debut={icone(ClipboardCheck)}
        titre={t('edl')}
        detail={edl?.date ? t('edlEtabli', { date: f.jourMois(edl.date) }) : t('edlAbsent')}
        fin={
          edl ? (
            <BoutonTelechargement chemin={edl.download_path} nomFichier={`${t('edl')}.pdf`} size="sm" variant="ghost">
              <Download className="size-4" aria-hidden="true" />
              <span className="sr-only">{t('edl')}</span>
            </BoutonTelechargement>
          ) : undefined
        }
      />
      <LigneDeListe
        className="md:hidden"
        debut={icone(FileText)}
        titre={t('contrat')}
        detail={signe ? t('contratSigne', { date: f.jourMois(signe) }) : t('contratNonSigne')}
        fin={
          peutTelechargerLeContrat ? (
            <BoutonTelechargement chemin={`/api/leases/${lease.id}/contract/pdf`} nomFichier={`bail-${lease.reference_number ?? lease.id}.pdf`} size="sm" variant="ghost">
              <Download className="size-4" aria-hidden="true" />
              <span className="sr-only">{t('contrat')}</span>
            </BoutonTelechargement>
          ) : undefined
        }
      />
      {clauses.length > 0 ? (
        <>
          <LigneDeListe
            debut={icone(ScrollText)}
            titre={t('conditions')}
            detail={clauses.join(' · ')}
            onClick={() => setConditions((v) => !v)}
            fin={<ChevronRight className={cn('size-4 flex-none text-muted-foreground transition-transform', conditions && 'rotate-90')} aria-hidden="true" />}
          />
          {conditions ? (
            <div className="space-y-3 border-b border-border px-4 py-3" data-testid="conditions-du-bail">
              {lease.terms ? (
                <div>
                  <h3 className="text-ui font-medium text-muted-foreground">{tLease('terms')}</h3>
                  <p className="mt-1 max-w-prose whitespace-pre-line text-sm leading-relaxed text-pretty">{lease.terms}</p>
                </div>
              ) : null}
              {lease.special_conditions ? (
                <div>
                  <h3 className="text-ui font-medium text-muted-foreground">{tLease('specialConditions')}</h3>
                  <p className="mt-1 max-w-prose whitespace-pre-line text-sm leading-relaxed text-pretty">{lease.special_conditions}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
      <LigneDeListe className="md:hidden" debut={icone(FolderOpen)} titre={t('documents')} detail={t('documentsDetail')} chevron onClick={onDocuments} />
    </Carte>
  );
}
