'use client';

import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ChevronRight, Landmark, Settings2, Upload } from 'lucide-react';

import { SelecteurDeMois, useTextesDuSelecteurDeMois } from '@/components/admin/finances/argent/SelecteurDeMois';
import { PageHeader } from '@/components/console';
import { EmptyState, ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { Button } from '@/components/ui/button';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { estMois, moisCourant } from '@/lib/finances/mois';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  useBankStatements,
  useCompteAvecSuggestion,
  useConfirmBatch,
  useCsvMapping,
  useDelierLigne,
  usePendingPayments,
  useRapprocherLigne,
  useReconciliationOverview,
  useSuggestionsDuReste,
} from '@/lib/queries/reconciliation';
import { cn } from '@/lib/utils';
import type { BankStatementLine, FiltreDuReste, PendingPayment, ReconciliationOverview } from '@/types/reconciliation';

import { CsvMappingForm } from '../CsvMappingForm';
import { ImportStatementForm } from '../ImportStatementForm';
import { StatementsList } from '../StatementsList';
import { confianceEnFraction } from '../format';
import { ChercherUneLigne } from './ChercherUneLigne';
import { FenetreAdaptee } from './FenetreAdaptee';
import {
  CarteDuReste,
  CarteTitree,
  CompteursDuReste,
  EnTeteDuTableau,
  PaiementsEnLigne,
  RangeeDuReste,
  clesParCompte,
  useListeCourte,
  useNomDuMoyen,
  useNomDuMois,
  type GestesDuPaiement,
} from './pieces';

/** Le seuil de « Confirmer les N » : une suggestion à 90 % ou plus (règle « montant et référence exacts », 95). */
export const SEUIL_SUR = 0.9;
/** Le plafond d'un `confirm-batch` (`ConfirmBankStatementLinesBatchRequest`). */
export const LOT_MAX = 200;

/** Les identifiants de ligne d'un « Confirmer les N » : confiance ≥ 90 %, sans doublon, 200 au plus. */
export function lignesSures(paiements: readonly PendingPayment[]): number[] {
  const ids = new Set<number>();
  for (const p of paiements) {
    const l = p.suggested_line;
    const c = l ? confianceEnFraction(l.confidence) : null;
    if (l && c !== null && c >= SEUIL_SUR) ids.add(l.id);
  }
  return [...ids].slice(0, LOT_MAX);
}

const cleDuPaiement = (p: PendingPayment) => `${p.type}-${p.id}`;

/**
 * TCK-2675 — `/app/agency/finances/reconciliation` : **le reste à rapprocher d'abord, l'import comme
 * moyen** (maquette `app-rapprochement`, approche C). Ce que les passerelles ont confirmé est déjà
 * rapproché ; l'écran compte ce qui reste, par mois (`?period=YYYY-MM`), et le rapproche :
 * confirmer une ligne proposée, toutes celles à 90 % et plus d'un geste, délier, chercher une autre
 * ligne. Sans relevé importé, il dit ce qui manque — le relevé — et le bouton pour l'importer.
 *
 * Les filtres sont lus côté serveur (`filter[payment_method]`, `filter[has_suggestion]`), les
 * comptes viennent de l'API (`…/overview`), jamais d'un recomptage de la page affichée.
 */
export function ResteARapprocher({
  agencyId,
  fournisseursConnectes,
}: {
  readonly agencyId: number;
  /** Les fournisseurs de paiement connectés ; `null` quand les intégrations n'ont pas pu être lues. */
  readonly fournisseursConnectes: readonly string[] | null;
}) {
  const t = useTranslations('admin.reconciliation');
  const tPage = useTranslations('admin.pages.finances');
  const tFil = useTranslations('admin.finances.argent');
  const tCommon = useTranslations('common');
  const bureau = useMatchesMedia('(width >= 48rem)');
  const recherche = useSearchParams();
  const courant = moisCourant();
  const demande = recherche.get('period');
  const periode = estMois(demande) ? demande : courant;
  const textesDuMois = useTextesDuSelecteurDeMois();

  const [fenetre, setFenetre] = useState<'importer' | 'reglages' | null>(null);
  const apercu = useReconciliationOverview(agencyId, periode);
  const releves = useBankStatements(agencyId);
  const nbReleves = releves.data?.data.length ?? 0;
  const sansReleve = releves.isSuccess && nbReleves === 0;
  // L'écran « Il ne manque que le relevé » porte SON bouton d'import ; partout ailleurs, l'import
  // reste offert (en-tête, colonne de droite, section « Relevés »), même sans rien à rapprocher.
  const importDansLeVide = sansReleve && (apercu.data?.data.to_reconcile.total ?? 0) > 0;

  const enTete = (
    <>
      <DeclarerEnTete titre={t('titreCourt')} />
      <PageHeader
        className="max-md:hidden"
        fil={{ label: tFil('filLabel'), etapes: [{ label: tPage('title'), href: '/app/agency/finances' }, { label: t('title') }] }}
        title={t('title')}
        description={t('sousTitre')}
        actions={
          <>
            <SelecteurDeMois mois={periode} courant={courant} variante="bureau" textes={textesDuMois} />
            <Button variant="outline" onClick={() => setFenetre('reglages')}>
              <Settings2 data-icon="inline-start" strokeWidth={1.75} aria-hidden="true" />
              {t('actions.reglages')}
            </Button>
            {releves.isSuccess && apercu.isSuccess && !importDansLeVide ? (
              <Button onClick={() => setFenetre('importer')}>
                <Upload data-icon="inline-start" aria-hidden="true" />
                {t('actions.importer')}
              </Button>
            ) : null}
          </>
        }
      />
    </>
  );

  const fenetres = (
    <>
      <FenetreAdaptee ouvert={fenetre === 'importer'} onFermer={() => setFenetre(null)} titre={t('actions.importer')} description={t('vide.formats')}>
        <ImportStatementForm agencyId={agencyId} />
      </FenetreAdaptee>
      <FenetreAdaptee ouvert={fenetre === 'reglages'} onFermer={() => setFenetre(null)} titre={t('actions.reglages')} description={t('mapping.description')} large>
        <ReglagesDeLImport agencyId={agencyId} />
      </FenetreAdaptee>
    </>
  );

  let corps;
  if (apercu.isLoading || releves.isLoading) {
    corps = <Skeleton className="h-40 rounded-xl" />;
  } else if (apercu.isError || !apercu.data) {
    corps = <ErrorState message={t('reste.erreurCompteurs')} onRetry={() => void apercu.refetch()} retryLabel={tCommon('actions.retry')} />;
  } else {
    const donnees = apercu.data.data;
    corps = (
      <Contenu
        agencyId={agencyId}
        apercu={donnees}
        bureau={bureau}
        sansReleve={sansReleve}
        importDansLeVide={importDansLeVide}
        fournisseursConnectes={fournisseursConnectes}
        onImporter={() => setFenetre('importer')}
        onReglages={() => setFenetre('reglages')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {enTete}
      {corps}
      {fenetres}
    </div>
  );
}

/** Les réglages de l'import (le paramétrage CSV), lus à l'ouverture. */
function ReglagesDeLImport({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('admin.reconciliation.mapping');
  const tCommon = useTranslations('common');
  const mapping = useCsvMapping(agencyId);
  if (mapping.isLoading) return <Skeleton className="h-48 rounded-lg" />;
  if (mapping.isError || !mapping.data) {
    return <ErrorState message={t('error')} onRetry={() => void mapping.refetch()} retryLabel={tCommon('actions.retry')} />;
  }
  return <CsvMappingForm key={mapping.dataUpdatedAt} agencyId={agencyId} initial={mapping.data.data} />;
}

function Contenu({
  agencyId,
  apercu,
  bureau,
  sansReleve,
  importDansLeVide,
  fournisseursConnectes,
  onImporter,
  onReglages,
}: {
  readonly agencyId: number;
  readonly apercu: ReconciliationOverview;
  readonly bureau: boolean;
  readonly sansReleve: boolean;
  readonly importDansLeVide: boolean;
  readonly fournisseursConnectes: readonly string[] | null;
  readonly onImporter: () => void;
  readonly onReglages: () => void;
}) {
  const t = useTranslations('admin.reconciliation');
  const rienARapprocher = apercu.to_reconcile.total === 0;

  const colonneDroite = bureau ? (
    <div className="space-y-5">
      <CarteTitree
        titre={t('list.title')}
        action={
          importDansLeVide ? null : (
            <button type="button" className="flex-none text-sm font-medium text-primary hover:underline" onClick={onImporter}>
              {t('releves.importer')}
            </button>
          )
        }
      >
        <StatementsList agencyId={agencyId} vide={<EmptyState variant="nue" className="py-6" title={t('vide.aucunReleve')} />} />
      </CarteTitree>
      <PaiementsEnLigne fournisseurs={fournisseursConnectes} apercu={apercu} />
    </div>
  ) : null;

  let principal;
  if (rienARapprocher) {
    principal = <ToutRapproche apercu={apercu} bureau={bureau} />;
  } else if (sansReleve) {
    principal = <SansReleve apercu={apercu} bureau={bureau} onImporter={onImporter} onReglages={onReglages} />;
  } else {
    principal = <ListeDuReste agencyId={agencyId} apercu={apercu} bureau={bureau} />;
  }

  if (!bureau) {
    return (
      <div className="space-y-4">
        <CompteursDuReste apercu={apercu} enAttente={sansReleve} />
        {principal}
        {importDansLeVide ? null : (
          <section aria-labelledby="releves-telephone" className="pt-2">
            <h2 id="releves-telephone" className="px-1 pb-2 text-xs font-semibold tracking-surtitre text-muted-foreground uppercase">
              {t('releves.rubrique')}
            </h2>
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              <LigneDeFenetre icone={<Upload className="size-icone" strokeWidth={1.75} aria-hidden="true" />} titre={t('releves.importerTitre')} detail={t('vide.formats')} onClick={onImporter} />
              <LigneDeFenetre icone={<Settings2 className="size-icone" strokeWidth={1.75} aria-hidden="true" />} titre={t('actions.reglages')} detail={t('releves.reglagesDetail')} onClick={onReglages} />
              <StatementsList agencyId={agencyId} limite={2} vide={null} />
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <CompteursDuReste apercu={apercu} bureau enAttente={sansReleve} />
        {principal}
      </div>
      {colonneDroite}
    </div>
  );
}

function LigneDeFenetre({ icone, titre, detail, onClick }: { readonly icone: ReactNode; readonly titre: string; readonly detail: string; readonly onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-15 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-encre-douce">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-corps font-medium">{titre}</span>
        <span className="block text-ui text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** « Il ne manque que le relevé de la banque » : chaque phrase est tirée du point du mois. */
function SansReleve({
  apercu,
  bureau,
  onImporter,
  onReglages,
}: {
  readonly apercu: ReconciliationOverview;
  readonly bureau: boolean;
  readonly onImporter: () => void;
  readonly onReglages: () => void;
}) {
  const t = useTranslations('admin.reconciliation');
  const nomDuMoyen = useNomDuMoyen();
  const listeCourte = useListeCourte();
  const fournisseurs = clesParCompte(apercu.confirmed_automatically.by_provider);

  const message = (
    <div className={cn('flex flex-col items-center text-center', bureau ? 'px-10 py-12' : 'px-4 py-8')} data-testid="sans-releve">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-primary-deep">
        <Landmark className="size-7" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h2 className={cn('mt-4 font-display font-semibold tracking-titre', bureau ? 'text-2xl' : 'text-xl leading-tight')}>{t('vide.titre')}</h2>
      <p className="mt-2 max-w-md text-corps leading-relaxed text-muted-foreground">
        {fournisseurs.length > 0 ? `${t('vide.auto', { liste: listeCourte(fournisseurs.map(nomDuMoyen)) })} ` : null}
        {t('vide.reste', { count: apercu.to_reconcile.total })}
      </p>
      <div className="mt-5">
        <Button size={bureau ? 'lg' : 'xl'} className={cn(!bureau && 'h-12 px-6')} onClick={onImporter}>
          <Upload data-icon="inline-start" aria-hidden="true" /> {t('actions.importer')}
        </Button>
      </div>
      <p className="mt-3 text-ui text-muted-foreground">{t('vide.formats')}</p>
      {bureau ? null : (
        <button type="button" className="mt-3 text-sm font-medium text-primary hover:underline" onClick={onReglages}>
          {t('actions.reglages')}
        </button>
      )}
    </div>
  );
  return bureau ? <section className="mt-5 rounded-xl border border-border bg-card">{message}</section> : message;
}

function ToutRapproche({ apercu, bureau }: { readonly apercu: ReconciliationOverview; readonly bureau: boolean }) {
  const t = useTranslations('admin.reconciliation.reste.toutRapproche');
  const nomDuMois = useNomDuMois();
  return (
    <section className={cn('rounded-xl border border-border bg-card px-4 py-8 text-center', bureau && 'mt-5')} data-testid="tout-rapproche">
      <span className="mx-auto inline-flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
        <Check className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-3 font-display text-lg font-semibold tracking-titre">{t('titre', { mois: nomDuMois(apercu.period, false) })}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('texte')}</p>
    </section>
  );
}

/** Les pastilles, la liste (cartes ou tableau), « Confirmer les N » et les gestes d'un paiement. */
function ListeDuReste({ agencyId, apercu, bureau }: { readonly agencyId: number; readonly apercu: ReconciliationOverview; readonly bureau: boolean }) {
  const t = useTranslations('admin.reconciliation');
  const tCommon = useTranslations('common');
  const f = useFormatteurs();
  const auPluriel = useNomDuMoyen('pluriel');
  const messageErreur = useMessageErreurApi();
  const periode = apercu.period;

  const [filtre, setFiltre] = useState<FiltreDuReste>({ type: 'tout' });
  const [tout, setTout] = useState(false);
  const [enVol, setEnVol] = useState<ReadonlySet<string>>(new Set());
  const [annonce, setAnnonce] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null);
  const [cherche, setCherche] = useState<PendingPayment | null>(null);

  const releves = useBankStatements(agencyId);
  const avecSuggestion = useCompteAvecSuggestion(agencyId, periode);
  const liste = usePendingPayments(agencyId, periode, filtre, tout);
  const suggestions = useSuggestionsDuReste(agencyId, periode, filtre);
  const confirmerLot = useConfirmBatch(agencyId);
  const rapprocher = useRapprocherLigne();
  const delier = useDelierLigne();

  const banqueDuReleve = (id: number) => releves.data?.data.find((r) => r.id === id)?.bank_name ?? null;
  const sures = filtre.type === 'sans' ? [] : lignesSures(suggestions.data?.data ?? []);
  const lotEnVol = confirmerLot.isPending;

  const choisir = (suivant: FiltreDuReste) => {
    setFiltre(suivant);
    setTout(false);
    setAnnonce(null);
  };
  const marquer = (p: PendingPayment, actif: boolean) =>
    setEnVol((avant) => {
      const apres = new Set(avant);
      if (actif) apres.add(cleDuPaiement(p));
      else apres.delete(cleDuPaiement(p));
      return apres;
    });

  async function geste(p: PendingPayment, action: () => Promise<unknown>, ok: string, echec: string) {
    marquer(p, true);
    setAnnonce(null);
    try {
      await action();
      setAnnonce({ ton: 'ok', texte: ok });
    } catch (err) {
      setAnnonce({ ton: 'erreur', texte: messageErreur(err, echec) });
    } finally {
      marquer(p, false);
    }
  }

  const gestes: GestesDuPaiement = {
    onConfirmer: (p) => {
      const l = p.suggested_line;
      if (!l) return;
      void geste(p, () => rapprocher.mutateAsync({ lineId: l.id, payment_type: p.type, payment_id: p.id }), t('reste.actions.confirme'), t('reste.actions.echecConfirmer'));
    },
    onDelier: (p) => {
      const l = p.suggested_line;
      if (!l) return;
      void geste(p, () => delier.mutateAsync(l.id), t('reste.actions.delie'), t('reste.actions.echecDelier'));
    },
    onChercher: (p) => setCherche(p),
    enVol: (p) => lotEnVol || enVol.has(cleDuPaiement(p)),
    banqueDuReleve,
  };

  async function confirmerLesSures() {
    if (sures.length === 0) return;
    setAnnonce(null);
    try {
      const r = await confirmerLot.mutateAsync(sures);
      setAnnonce({ ton: 'ok', texte: t('reste.bandeau.confirmes', { count: r.data.count }) });
    } catch (err) {
      setAnnonce({ ton: 'erreur', texte: messageErreur(err, t('reste.bandeau.echec')) });
    }
  }

  async function choisirLaLigne(ligne: BankStatementLine) {
    if (!cherche) return;
    const p = cherche;
    await rapprocher.mutateAsync({ lineId: ligne.id, payment_type: p.type, payment_id: p.id });
    setCherche(null);
    setAnnonce({ ton: 'ok', texte: t('reste.actions.confirme') });
  }

  // Les pastilles : Tout · Avec suggestion · (Sans ligne de banque, au bureau) · un moyen par moyen compté.
  const total = apercu.to_reconcile.total;
  const nAvec = avecSuggestion.data?.meta?.total;
  const moyens = clesParCompte(apercu.to_reconcile.by_method).filter((m) => m !== 'unknown');
  const actif = (x: FiltreDuReste) => x.type === filtre.type && (x.type !== 'moyen' || (filtre.type === 'moyen' && filtre.moyen === x.moyen));
  type Pastille = { readonly filtre: FiltreDuReste; readonly libelle: string; readonly compte: number | undefined; readonly bureauSeul?: boolean };
  const toutes: Pastille[] = [
    { filtre: { type: 'tout' }, libelle: t('reste.filtres.tout'), compte: total },
    { filtre: { type: 'suggestion' }, libelle: t('reste.filtres.suggestion'), compte: nAvec },
    { filtre: { type: 'sans' }, libelle: t('reste.filtres.sans'), compte: nAvec === undefined ? undefined : total - nAvec, bureauSeul: true },
    ...moyens.map((m): Pastille => ({ filtre: { type: 'moyen', moyen: m }, libelle: auPluriel(m), compte: apercu.to_reconcile.by_method[m] })),
  ];
  const puces = toutes.filter((p) => bureau || !p.bureauSeul);

  const pastilles = bureau ? (
    <div role="group" aria-label={t('reste.filtres.label')} className="mt-5 flex items-center gap-2 max-xl:flex-wrap">
      {puces.map((p) => (
        <PuceDeFiltre key={p.libelle} taille="sm" active={actif(p.filtre)} compte={p.compte} onClick={() => choisir(p.filtre)}>
          {p.libelle}
        </PuceDeFiltre>
      ))}
    </div>
  ) : (
    <RangeeDePuces aria-label={t('reste.filtres.label')} className="-mx-4">
      {puces.map((p) => (
        <PuceDeFiltre key={p.libelle} active={actif(p.filtre)} compte={p.compte} onClick={() => choisir(p.filtre)}>
          {p.libelle}
        </PuceDeFiltre>
      ))}
    </RangeeDePuces>
  );

  const paiements = liste.data?.data ?? [];
  const totalFiltre = liste.data?.meta?.total ?? paiements.length;
  const restants = Math.max(0, totalFiltre - paiements.length);
  const plus =
    restants > 0 ? (
      <button
        type="button"
        className={cn('font-medium text-primary hover:underline disabled:opacity-50', bureau ? 'text-ui' : 'w-full py-1 text-center text-sm')}
        disabled={liste.isFetching}
        onClick={() => setTout(true)}
      >
        {t('reste.plus', { count: restants })}
      </button>
    ) : null;

  const bandeau =
    sures.length > 0 ? (
      <div className={cn('flex items-center gap-3 text-sm', bureau ? 'border-b border-border px-4 py-2.5' : 'rounded-xl border border-border bg-card px-4 py-3')} data-testid="bandeau-sures">
        <span className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-success/10 text-success">
          <Check className="size-4" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-medium">{t('reste.bandeau.titre', { count: sures.length })}</span>{' '}
          <span className="text-muted-foreground">· {t('reste.bandeau.raison')}</span>
        </span>
        <Button variant="outline" size="sm" disabled={lotEnVol} onClick={() => void confirmerLesSures()}>
          {t('reste.bandeau.confirmer', { count: sures.length })}
        </Button>
      </div>
    ) : null;

  const annonceEl = (
    <p
      role={annonce?.ton === 'erreur' ? 'alert' : 'status'}
      className={cn('text-sm', annonce?.ton === 'erreur' ? 'text-destructive' : 'text-foreground', annonce ? bureau && 'border-b border-border px-4 py-2.5' : 'sr-only')}
    >
      {annonce?.texte ?? ''}
    </p>
  );

  let lignes;
  if (liste.isLoading) {
    lignes = <Skeleton className={cn('rounded-xl', bureau ? 'm-4 h-40' : 'h-40')} />;
  } else if (liste.isError) {
    lignes = <ErrorState message={t('reste.erreur')} onRetry={() => void liste.refetch()} retryLabel={tCommon('actions.retry')} />;
  } else if (paiements.length === 0) {
    lignes = <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('reste.aucunPourLeFiltre')}</p>;
  } else if (bureau) {
    lignes = (
      <>
        <div role="table" aria-label={t('title')} className="max-xl:overflow-x-auto">
          <div className="min-w-[37.5rem]" role="rowgroup">
            <EnTeteDuTableau />
            {paiements.map((p) => (
              <RangeeDuReste key={cleDuPaiement(p)} p={p} gestes={gestes} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-3 text-ui text-muted-foreground">
          <span className="min-w-0 flex-1">{t('reste.pied', { affiches: paiements.length, total: f.nombre(totalFiltre) })}</span>
          {plus}
        </div>
      </>
    );
  } else {
    lignes = (
      <div className="space-y-3">
        {paiements.map((p) => (
          <CarteDuReste key={cleDuPaiement(p)} p={p} gestes={gestes} />
        ))}
        {plus}
      </div>
    );
  }

  return (
    <>
      {pastilles}
      {bureau ? (
        <section className="mt-4 rounded-xl border border-border bg-card" aria-label={t('title')}>
          {bandeau}
          {annonceEl}
          {lignes}
        </section>
      ) : (
        <div className="space-y-3">
          {bandeau}
          {annonceEl}
          {lignes}
        </div>
      )}
      {cherche ? (
        <ChercherUneLigne agencyId={agencyId} paiement={cherche} banqueDuReleve={banqueDuReleve} onFermer={() => setCherche(null)} onChoisir={choisirLaLigne} />
      ) : null}
    </>
  );
}
