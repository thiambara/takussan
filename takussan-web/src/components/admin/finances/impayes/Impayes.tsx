'use client';

import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CircleCheckBig, Phone, Search, X } from 'lucide-react';

import { isReachable, telHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { EmptyState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { LeasePaymentDialog } from '@/components/leases/LeasePaymentDialog';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button, buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFermeAuRetour } from '@/hooks/useFermeAuRetour';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useAgingBalance } from '@/lib/queries/agency-reporting';
import { paymentsQueryKeys, usePaymentsHistory, type UsePaymentsHistoryParams } from '@/lib/queries/payments';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { OverduePaymentsTable } from '../OverduePaymentsTable';
import { useNoterLaRelance } from './useNoterLaRelance';
import { CarteDImpaye } from './CarteDImpaye';
import { DossierDImpaye } from './DossierDImpaye';
import { FileDeRelance, useFileDeRelance } from './FileDeRelance';
import { useLectureDImpaye } from './lecture';
import { ComposerLaRelance, OuvrirWhatsApp } from './RelanceDUnImpaye';
import { ordreDeLaFile, useEcheancesAffichees, useSelectionDesImpayes, type SelectionDesImpayes } from './selection';
import { BarreDeSelection, TeteDeSelection } from './SelectionDesImpayes';
import { TableDesImpayes } from './TableDesImpayes';
import { IMPAYES_PAR_PAGE, TRANCHES, tranche, type CleDeTranche } from './tranches';
import { useRelanceDUnImpaye } from './useRelanceDUnImpaye';

/** `md` n'est pas le bureau : le tableau et le panneau commencent à `lg` (ticket, Direction UX). */
const REQUETE_DU_BUREAU = '(width >= 64rem)';

const INCLUDES = ['payer', 'property', 'landlord', 'reminders'] as const;

interface Filtres {
  readonly tranche: CleDeTranche;
  readonly bailleur: { readonly id: number; readonly nom: string } | null;
  readonly recherche: string;
}

function parametres(filtres: Filtres, page: number, perPage: number = IMPAYES_PAR_PAGE): UsePaymentsHistoryParams {
  const { min, max } = tranche(filtres.tranche);
  return {
    days_late_min: min,
    ...(max !== undefined ? { days_late_max: max } : {}),
    sort: '-days_late',
    include: INCLUDES,
    ...(filtres.bailleur ? { landlord_id: filtres.bailleur.id } : {}),
    ...(filtres.recherche.trim() ? { search: filtres.recherche.trim() } : {}),
    page,
    per_page: perPage,
  };
}

/**
 * TCK-2660 — LE composant Impayés (décision du porteur du 2026-11-10, point 14 a) : l'écran Impayés
 * d'« Argent » et, demain, l'onglet Impayés de Rapports (TCK-2629) le montent tel quel. Rien ici ne
 * lit l'onglet, la période ou le contexte d'« Argent » : ce qui diffère passe par les propriétés.
 *
 * Les données : `GET /api/payments/history` par ÉCHÉANCE, sous la règle *Impayé* partagée
 * (`filter[days_late_min]=1`, cf. `tranches.ts`), triées par retard, nommées
 * (`include=payer,property,landlord,reminders`). Le total et les cautions viennent de la balance
 * âgée (la même règle).
 *
 * « Par locataire » : une carte (téléphone) ou une ligne (bureau) par échéance. « Par bailleur » : la
 * balance âgée par bailleur — ses quatre tranches et son total — et un bailleur ouvre ses impayés.
 *
 * TCK-2682 — la relance EN LOT : au bureau, une case par rangée et la barre de sélection ; sous `lg`,
 * un mode sélection (« Sélectionner » dans l'en-tête, « Annuler », Échap ou le geste retour pour en
 * sortir) qui pose une case de 44 px sur chaque carte. « Relancer la sélection » ouvre la file guidée
 * (`FileDeRelance`). La sélection vit par échéance, à travers pages et filtres ; ce qui n'est pas
 * affiché est dit, et la file le reprend.
 */
export function Impayes({
  agencyId,
  resume = 'telephone',
}: {
  readonly agencyId: number | undefined;
  /** Le grand total et les cautions en tête : au téléphone seulement (le bureau les dit dans l'en-tête de page), ou toujours. */
  readonly resume?: 'telephone' | 'toujours';
}) {
  const t = useTranslations('admin.finances.impayes');
  const bureau = useMatchesMedia(REQUETE_DU_BUREAU);
  const [vue, setVue] = useState<'locataire' | 'bailleur'>('locataire');
  const [filtres, setFiltres] = useState<Filtres>({ tranche: 'tous', bailleur: null, recherche: '' });
  const [frappe, setFrappe] = useState('');
  const recherche = useDebouncedValue(frappe, 300);
  const actifs: Filtres = { ...filtres, recherche: bureau ? recherche : '' };
  const [pageBureau, setPageBureau] = useState(1);
  const [pagesTelephone, setPagesTelephone] = useState(1);
  const [aRelancer, setARelancer] = useState<{ readonly row: PaymentHistoryRow; readonly ouverte: boolean } | null>(null);
  const [dossier, setDossier] = useState<{ readonly row: PaymentHistoryRow; readonly relancer: boolean; readonly ouvert: boolean } | null>(null);

  const f = useFormatteurs();
  const l = useLectureDImpaye();
  const selection = useSelectionDesImpayes();
  const fileApi = useFileDeRelance();
  const [modeSelection, setModeSelection] = useState(false);
  // Sous `lg`, une sélection non vide se montre toujours : jamais d'échéance cochée sans sa case.
  const modeEffectif = !bureau && vue === 'locataire' && (modeSelection || selection.n > 0);
  const quitterLeMode = () => {
    setModeSelection(false);
    selection.vider();
  };
  // Le geste retour : arrête la file si elle tourne, sinon quitte le mode sélection.
  useFermeAuRetour(modeEffectif || fileApi.file !== null, () => {
    if (fileApi.file) fileApi.arreter();
    else quitterLeMode();
  });
  const surcoucheOuverte = fileApi.file !== null || Boolean(aRelancer?.ouverte) || Boolean(dossier?.ouvert);
  useEffect(() => {
    if (!modeEffectif || surcoucheOuverte) return;
    const surTouche = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setModeSelection(false);
      selection.vider();
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [modeEffectif, surcoucheOuverte, selection]);

  const changerDeFiltres = (suivant: Partial<Filtres>) => {
    setFiltres((avant) => ({ ...avant, ...suivant }));
    setPageBureau(1);
    setPagesTelephone(1);
  };

  const premiere = usePaymentsHistory(parametres(actifs, bureau ? pageBureau : 1));
  const comptes = useComptesDesTranches(actifs);

  // Les échéances affichées : la page du tableau, ou les pages 1 à n des cartes.
  const pagesAffichees = vue !== 'locataire' ? [] : bureau ? [pageBureau] : Array.from({ length: pagesTelephone }, (_, i) => i + 1);
  const affichees = useEcheancesAffichees(pagesAffichees.map((p) => paymentsQueryKeys.history(parametres(actifs, p))));
  const nonAffiches = [...selection.lignes.keys()].filter((id) => !affichees.ids.has(id)).length;
  const montantDeLaSelection = f.montantCourt([...selection.lignes.values()].reduce((somme, row) => somme + Number(l.du(row) ?? 0), 0));
  const toutesCochees = affichees.ids.size > 0 && [...affichees.ids].every((id) => selection.coche(id));
  const relancerLaSelection = () => {
    // La ligne la plus fraîche quand elle est affichée (dernière relance, numéro) ; la file la fige.
    // Une échéance payée entre-temps reste dans la file, sautée et dite (« déjà payée ») : la barre dit
    // N, la file dit « sur N ».
    const fraiches = new Map(affichees.lignes().map((row) => [row.id, row]));
    fileApi.demarrer(ordreDeLaFile([...selection.lignes.values()].map((row) => fraiches.get(row.id) ?? row)));
  };
  const avecDesLignes = (premiere.data?.data.length ?? 0) > 0;
  const boutonDeMode =
    vue === 'locataire' && !bureau && (avecDesLignes || modeEffectif) ? (
      <button
        type="button"
        onClick={() => (modeEffectif ? quitterLeMode() : setModeSelection(true))}
        aria-label={modeEffectif ? undefined : t('lot.selectionnerAria')}
        className="inline-flex h-11 flex-none items-center rounded-full px-3 text-corps font-medium text-primary outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        {modeEffectif ? t('lot.annuler') : t('lot.selectionner')}
      </button>
    ) : undefined;

  return (
    <div data-slot="impayes" className="space-y-0">
      {/* Au téléphone, « Sélectionner » / « Annuler » à droite de l'en-tête (à la place du « ⋯ » de la maquette). */}
      <DeclarerEnTete droite={boutonDeMode} />
      <ResumeDesImpayes agencyId={agencyId} className={resume === 'telephone' ? 'lg:hidden' : undefined} />

      <Tabs value={vue} onValueChange={(v) => setVue(v as 'locataire' | 'bailleur')}>
        <div className={cn('flex flex-col lg:flex-row lg:items-center lg:gap-2 lg:max-xl:flex-wrap', resume === 'telephone' ? 'max-lg:mt-4' : 'mt-4')}>
          <TabsList aria-label={t('vues.label')} size={bureau ? 'sm' : 'default'} className={bureau ? undefined : 'w-full'}>
            <TabsTrigger value="locataire">{t('vues.locataire')}</TabsTrigger>
            <TabsTrigger value="bailleur">{t('vues.bailleur')}</TabsTrigger>
          </TabsList>
          {vue === 'locataire' ? (
            <>
              <span className="mx-1 hidden h-5 w-px bg-border lg:block" aria-hidden="true" />
              <RangeeDePuces aria-label={t('tranches.label')} className="-mx-4 pt-3 pb-1.5 lg:mx-0 lg:p-0">
                {TRANCHES.map((tr) => (
                  <PuceDeFiltre
                    key={tr.cle}
                    taille={bureau ? 'sm' : 'default'}
                    active={filtres.tranche === tr.cle}
                    compte={comptes.texte(tr.cle, bureau)}
                    onClick={() => changerDeFiltres({ tranche: tr.cle })}
                  >
                    {t(`tranches.${tr.cle}`)}
                  </PuceDeFiltre>
                ))}
              </RangeeDePuces>
              {!bureau && boutonDeMode ? <span className="ml-auto max-md:hidden">{boutonDeMode}</span> : null}
              {bureau ? (
                <div className="relative ml-auto w-[17.5rem] min-w-0">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="search"
                    value={frappe}
                    onChange={(e) => {
                      setFrappe(e.target.value);
                      setPageBureau(1);
                    }}
                    placeholder={t('recherche')}
                    aria-label={t('recherche')}
                    className="pl-10.5"
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <TabsContent value="locataire">
          {filtres.bailleur ? (
            <div className="mt-3 flex">
              <PuceDeFiltre active onClick={() => changerDeFiltres({ bailleur: null })} aria-label={t('bailleur.retirer', { nom: filtres.bailleur.nom })}>
                {t('bailleur.filtre', { nom: filtres.bailleur.nom })}
                <X className="size-3.5" aria-hidden="true" />
              </PuceDeFiltre>
            </div>
          ) : null}
          {bureau && selection.n > 0 ? (
            <BarreDeSelection
              n={selection.n}
              montant={montantDeLaSelection}
              nonAffiches={nonAffiches}
              onRelancer={relancerLaSelection}
              onToutDeselectionner={selection.vider}
            />
          ) : null}
          {modeEffectif ? (
            <div className="mt-1">
              <TeteDeSelection
                n={selection.n}
                montant={montantDeLaSelection}
                nonAffiches={nonAffiches}
                toutesCochees={toutesCochees}
                onToutSelectionner={() => selection.changer(affichees.lignes(), true)}
                onRelancer={relancerLaSelection}
              />
            </div>
          ) : null}
          <QueryBoundary
            query={premiere}
            // Au téléphone : 6 px sous la rangée de puces (le halo de focus, 3 px, tient dans son `overflow-x-auto`) + le `gap-2` de `Tabs` = 14 px jusqu’à la 1re carte, comme la maquette.
            className={bureau ? 'mt-4' : undefined}
            loadingFallback={
              <div className="space-y-3" data-testid="impayes-chargement">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className={bureau ? 'h-14 rounded-lg' : 'h-40 rounded-xl'} />
                ))}
              </div>
            }
          >
            {(reponse) =>
              reponse.data.length === 0 ? (
                <EmptyState
                  className="mt-4"
                  data-testid="impayes-vide"
                  icon={<CircleCheckBig className="size-8" aria-hidden="true" />}
                  title={filtres.tranche === 'tous' && !filtres.bailleur && !actifs.recherche ? t('vide.titre') : t('vide.titreFiltre')}
                  description={t('vide.description')}
                />
              ) : bureau ? (
                <div className="mt-4">
                  <TableDesImpayes
                    rows={reponse.data}
                    meta={reponse.meta}
                    totalDu={comptes.montantDe(filtres.tranche)}
                    onPage={setPageBureau}
                    onOuvrir={(row, relancer) => {
                      if (fileApi.file) return;
                      setDossier({ row, relancer, ouvert: true });
                    }}
                    selection={{ coche: selection.coche, changer: selection.changer, figee: fileApi.file !== null }}
                    enCours={fileApi.enCours?.id ?? null}
                  />
                </div>
              ) : (
                <ListeDeCartes
                  premiere={reponse.data}
                  total={reponse.meta.total}
                  pages={pagesTelephone}
                  filtres={actifs}
                  onVoirPlus={() => setPagesTelephone((n) => n + 1)}
                  onRelancer={(row) => setARelancer({ row, ouverte: true })}
                  selection={modeEffectif ? selection : undefined}
                />
              )
            }
          </QueryBoundary>
        </TabsContent>
        <TabsContent value="bailleur" className="pt-4">
          <OverduePaymentsTable
            regroupement="landlord"
            surBailleur={(bailleur) => {
              changerDeFiltres({ bailleur, tranche: 'tous' });
              setVue('locataire');
            }}
          />
        </TabsContent>
      </Tabs>

      {aRelancer ? (
        <FeuilleDeRelance
          row={aRelancer.row}
          ouverte={aRelancer.ouverte}
          onFermer={() => setARelancer((a) => (a ? { ...a, ouverte: false } : a))}
        />
      ) : null}
      {dossier ? (
        <PanneauDuDossier
          agencyId={agencyId}
          etat={dossier}
          onChanger={(suivant) => setDossier((d) => (d ? { ...d, ...suivant } : d))}
          // Une échéance encaissée quitte la sélection.
          onEncaisse={(paymentId) => selection.retirer([paymentId])}
        />
      ) : null}
      <FileDeRelance
        api={fileApi}
        onTerminer={(aGarder) => {
          selection.garder(aGarder);
          if (aGarder.length === 0) setModeSelection(false);
        }}
      />
    </div>
  );
}

/** « 33 715 000 F dus sur 16 échéances · cautions détenues : 235 035 000 F » — la balance âgée. */
export function useResumeDesImpayes(
  agencyId: number | undefined,
): { readonly total: string; readonly phrase: string; readonly sousTitre: string } | null {
  const t = useTranslations('admin.finances.impayes');
  const f = useFormatteurs();
  const aging = useAgingBalance(agencyId, 'tenant');
  const data = aging.data?.data;
  if (!data) return null;
  const total = f.montantCourt(data.total.amount);
  const valeurs = { count: data.total.count, cautions: f.montantCourt(data.deposits_held.total) };
  return {
    total,
    phrase: t('resume', valeurs),
    /** Le sous-titre de la page au bureau : le montant, puis la même phrase. */
    sousTitre: t('sousTitre', { ...valeurs, montant: total }),
  };
}

function ResumeDesImpayes({ agencyId, className }: { readonly agencyId: number | undefined; readonly className?: string }) {
  const resume = useResumeDesImpayes(agencyId);
  return (
    <div data-slot="resume-impayes" className={cn('pt-2', className)}>
      {resume ? (
        <>
          <p className="font-display text-affiche-28 leading-none font-semibold tracking-titre tabular-nums">{resume.total}</p>
          <p className="mt-2 text-sm text-muted-foreground">{resume.phrase}</p>
        </>
      ) : (
        <>
          <Skeleton className="h-[1.875rem] w-48" aria-hidden="true" />
          <Skeleton className="mt-2 h-4 w-64" aria-hidden="true" />
        </>
      )}
    </div>
  );
}

/**
 * Les comptes des pastilles : trois requêtes `per_page=1` EN PARALLÈLE (une par tranche bornée), qui
 * lisent `meta.total` et `meta.totals.remaining_amount`. « Tous » est leur somme : les trois tranches
 * partitionnent la règle. Une requête en échec : sa pastille n'a pas de compte, rien d'autre ne casse.
 */
function useComptesDesTranches(filtres: Filtres) {
  const f = useFormatteurs();
  const plus30 = usePaymentsHistory({ ...parametres({ ...filtres, tranche: 'plus30' }, 1, 1), include: undefined });
  const de8a30 = usePaymentsHistory({ ...parametres({ ...filtres, tranche: 'de8a30' }, 1, 1), include: undefined });
  const moins8 = usePaymentsHistory({ ...parametres({ ...filtres, tranche: 'moins8' }, 1, 1), include: undefined });
  const lu = (q: typeof plus30) => (q.data ? { n: q.data.meta.total, montant: q.data.meta.totals?.remaining_amount ?? null } : null);
  const parTranche: Record<CleDeTranche, { n: number; montant: number | null } | null> = {
    plus30: lu(plus30),
    de8a30: lu(de8a30),
    moins8: lu(moins8),
    tous: null,
  };
  const bornees = [parTranche.plus30, parTranche.de8a30, parTranche.moins8];
  if (bornees.every((b) => b !== null)) {
    const montants = bornees.map((b) => b!.montant);
    parTranche.tous = {
      n: bornees.reduce((s, b) => s + b!.n, 0),
      montant: montants.every((m) => m !== null) ? montants.reduce<number>((s, m) => s + (m ?? 0), 0) : null,
    };
  }
  return {
    /** Le compte d'une pastille : « 4 » au téléphone, « 4 · 11,8 M F » au bureau (maquette). */
    texte: (cle: CleDeTranche, avecMontant: boolean) => {
      const c = parTranche[cle];
      if (!c) return undefined;
      // « Tous » ne porte que son compte (maquette) : son montant est déjà le titre de la page.
      return avecMontant && cle !== 'tous' && c.montant !== null && c.n > 0 ? `${f.nombre(c.n)} · ${f.montantAbrege(c.montant)}` : f.nombre(c.n);
    },
    montantDe: (cle: CleDeTranche) => {
      const c = parTranche[cle];
      return c && c.montant !== null ? f.montantCourt(c.montant) : null;
    },
  };
}

/** Le téléphone : la première page, puis une page de plus à chaque « Voir plus ». */
function ListeDeCartes({
  premiere,
  total,
  pages,
  filtres,
  onVoirPlus,
  onRelancer,
  selection,
}: {
  readonly premiere: readonly PaymentHistoryRow[];
  readonly total: number;
  readonly pages: number;
  readonly filtres: Filtres;
  readonly onVoirPlus: () => void;
  readonly onRelancer: (row: PaymentHistoryRow) => void;
  readonly selection?: SelectionDesImpayes;
}) {
  const t = useTranslations('admin.finances.impayes');
  const affichees = Math.min(total, pages * IMPAYES_PAR_PAGE);
  return (
    <div className="space-y-3 pb-8" data-slot="liste-impayes">
      {premiere.map((row) => (
        <CarteDImpaye key={`${row.source}-${row.id}`} row={row} onRelancer={onRelancer} selection={caseDe(selection, row)} />
      ))}
      {Array.from({ length: pages - 1 }, (_, i) => (
        <PageDeCartes key={i + 2} page={i + 2} filtres={filtres} onRelancer={onRelancer} selection={selection} />
      ))}
      {affichees < total ? (
        <button
          type="button"
          onClick={onVoirPlus}
          className="flex h-11 w-full items-center justify-center rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('voirPlus', { count: total - affichees })}
        </button>
      ) : null}
    </div>
  );
}

function PageDeCartes({
  page,
  filtres,
  onRelancer,
  selection,
}: {
  readonly page: number;
  readonly filtres: Filtres;
  readonly onRelancer: (row: PaymentHistoryRow) => void;
  readonly selection?: SelectionDesImpayes;
}) {
  const requete = usePaymentsHistory(parametres(filtres, page));
  if (requete.isPending) return <Skeleton className="h-40 rounded-xl" aria-hidden="true" />;
  return (
    <>
      {(requete.data?.data ?? []).map((row) => (
        <CarteDImpaye key={`${row.source}-${row.id}`} row={row} onRelancer={onRelancer} selection={caseDe(selection, row)} />
      ))}
    </>
  );
}

/** La case d'une carte en mode sélection. */
function caseDe(selection: SelectionDesImpayes | undefined, row: PaymentHistoryRow) {
  return selection ? { cochee: selection.coche(row.id), onCocher: (cochee: boolean) => selection.changer([row], cochee) } : undefined;
}

/** Téléphone : la feuille « Relancer {nom} » — montant, période et retard, message, lien, « Ouvrir WhatsApp ». */
function FeuilleDeRelance({ row, ouverte, onFermer }: { readonly row: PaymentHistoryRow; readonly ouverte: boolean; readonly onFermer: () => void }) {
  const t = useTranslations('admin.finances.impayes');
  const l = useLectureDImpaye();
  const relance = useRelanceDUnImpaye(row, ouverte);
  const raisonId = useId();
  return (
    <FeuilleDuBas
      open={ouverte}
      onOpenChange={(suivant) => {
        if (!suivant) onFermer();
      }}
      titre={t('relancer.titre', { nom: l.nom(row) })}
      pied={<OuvrirWhatsApp relance={relance} raisonId={relance.etatDuLien === 'refuse' ? raisonId : undefined} onOuvert={onFermer} className="w-full" />}
    >
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground tabular-nums">{l.montantDu(row)}</span> · {l.periode(row)} ·{' '}
        {t('relancer.retard', { count: row.days_late ?? 0 })}
      </p>
      <div className="mt-4">
        <ComposerLaRelance row={row} relance={relance} />
      </div>
      {relance.etatDuLien === 'refuse' ? (
        <span id={raisonId} className="sr-only">
          {t('relancer.lienRefuse')}
        </span>
      ) : null}
    </FeuilleDuBas>
  );
}

/**
 * Bureau : le panneau « dossier de l'impayé ». Pied : « Appeler », « Encaisser un paiement »,
 * « Relancer » — qui fait place à « Ouvrir WhatsApp » et compose la relance dans le dossier.
 * Une échéance payée n'a ni « Relancer » ni relance (AC2).
 */
function PanneauDuDossier({
  agencyId,
  etat,
  onChanger,
  onEncaisse,
}: {
  readonly agencyId: number | undefined;
  readonly etat: { readonly row: PaymentHistoryRow; readonly relancer: boolean; readonly ouvert: boolean };
  readonly onChanger: (suivant: Partial<{ row: PaymentHistoryRow; relancer: boolean; ouvert: boolean }>) => void;
  readonly onEncaisse?: (paymentId: number) => void;
}) {
  const t = useTranslations('admin.finances.impayes');
  const l = useLectureDImpaye();
  const queryClient = useQueryClient();
  const noter = useNoterLaRelance();
  const { row } = etat;
  const payee = row.status === 'paid';
  const relance = useRelanceDUnImpaye(row, etat.ouvert && !payee);
  const [encaisser, setEncaisser] = useState(false);
  const telephone = row.payer?.phone ?? null;
  const raisonId = useId();

  const pied = (
    <>
      {isReachable(telephone) ? (
        <a
          href={telHref(telephone)}
          onClick={() => {
            if (!payee) noter.mutate({ paymentId: row.id, channel: 'call' });
          }}
          className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5')}
        >
          <Phone className="size-4" aria-hidden="true" />
          {t('gestes.appeler')}
        </a>
      ) : null}
      {payee || !row.lease_id ? null : (
        <Button type="button" variant="outline" onClick={() => setEncaisser(true)}>
          {t('gestes.encaisser')}
        </Button>
      )}
      {payee ? null : etat.relancer ? (
        <OuvrirWhatsApp
          relance={relance}
          raisonId={!relance.joignable || relance.etatDuLien === 'refuse' ? raisonId : undefined}
          onOuvert={() => onChanger({ relancer: false })}
          className="h-controle px-3.5 text-sm"
        />
      ) : (
        <Button
          type="button"
          disabled={!relance.joignable}
          aria-describedby={relance.joignable ? undefined : raisonId}
          onClick={() => onChanger({ relancer: true })}
          className="gap-1.5 border-transparent bg-success font-semibold text-success-foreground hover:bg-success/90"
        >
          <IconeWhatsApp className="size-4 lg:size-4" />
          {t('gestes.relancer')}
        </Button>
      )}
    </>
  );

  return (
    <>
      <PanneauDroit
        open={etat.ouvert}
        onOpenChange={(suivant) => onChanger({ ouvert: suivant, ...(suivant ? {} : { relancer: false }) })}
        titre={l.nom(row)}
        pied={pied}
      >
        <DossierDImpaye
          agencyId={agencyId}
          row={row}
          url={relance.url}
          milieu={
            etat.relancer && !payee ? (
              <div className="mt-5">
                <ComposerLaRelance row={row} relance={relance} />
              </div>
            ) : null
          }
        />
        {!relance.joignable || relance.etatDuLien === 'refuse' ? (
          <p id={raisonId} className="mt-4 text-ui text-muted-foreground">
            {relance.joignable ? t('relancer.lienRefuse') : t('sansTelephone')}
          </p>
        ) : null}
      </PanneauDroit>
      {encaisser && row.lease_id ? (
        <LeasePaymentDialog
          leaseId={row.lease_id}
          open={encaisser}
          onOpenChange={setEncaisser}
          paiementInitial={row.id}
          onEncaisse={(paymentId) => {
            onEncaisse?.(paymentId);
            if (paymentId === row.id) onChanger({ row: { ...row, status: 'paid' }, relancer: false });
            void queryClient.invalidateQueries({ queryKey: ['payments', 'history'] });
          }}
        />
      ) : null}
    </>
  );
}
