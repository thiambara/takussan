'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { History, Layers, TrendingUp } from 'lucide-react';

import { useBoostProducts, useCredits } from '@/components/boost/api';
import type { BoostProduct, CreditLot, CreditMovement } from '@/components/boost/types';
import { PageHeader } from '@/components/console';
import { RouteSkeleton } from '@/components/console/RouteSkeleton';
import { EmptyState, ErrorState } from '@/components/feedback';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { REQUETE_DE_LA_BARRE } from '@/components/layout/plein-ecran';
import { Button } from '@/components/ui/button';
import { IconeDeLigne, LigneDeListe } from '@/components/ui/ligne-de-liste';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMyProfiles } from '@/hooks/useProfiles';
import { natureDeLEspaceActif } from '@/components/messages/espaceActif';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useBiensAPousser, useCreditsJournal, useMisesEnAvant, type BienAPousser, type MiseEnAvant } from '@/lib/queries/credits';

import { grilleDesOffres, prochaineExpiration } from './lecture';
import { MettreEnAvant, type Preselection } from './MettreEnAvant';
import { AucuneMiseEnAvant, BienAPousserLigne, MiseEnAvantMobile, TableDesMisesEnAvant } from './MisesEnAvant';
import { Carte, Recharger, Rubrique, signe } from './pieces';
import { CarteSolde, GrilleDesOffres, LigneDOperation, ListeDesLots, PiedDeTableau, TableDeLHistorique } from './sections';

/**
 * TCK-2664 — `/app/credits` : « vendre la mise en avant » (maquette `app-credits`, approche A). Le
 * solde et le geste qui le dépense, ce que les mises en avant ont rapporté, les biens à pousser, la
 * grille des prix ; lots et historique dessous.
 *
 * · L'accès se lit de `GET /api/credits` : un 403 rend l'état « réservé » (AC5), jamais une erreur
 *   générique, et aucune des autres lectures ne part tant que le solde n'est pas rendu.
 * · Le téléphone est l'écran de la barre d'onglets (`REQUETE_DE_LA_BARRE`, sous `md`).
 * · Écartés, et dits dans la fiche de fidélité : « Rapport des 30 derniers jours » (hors périmètre),
 *   « Lots épuisés ou expirés » (l'API ne rend que les lots dépensables), « × la semaine d'avant »
 *   (aucune série de vues par jour, TCK-2663).
 */

const BOOSTS_PAR_PAGE = 10;
const SUGGESTIONS = 3;
const HISTORIQUE_BUREAU = 5;
const HISTORIQUE_PANNEAU = 20;

type Panneau = 'historique' | 'lots';

const AUCUNE_PRESELECTION: Preselection = { bien: null, offreId: null };

/** La Remontée active la moins chère : sans elle, aucun « Remonter ». */
function remonteeActive(produits: readonly BoostProduct[]): BoostProduct | null {
  return produits.filter((p) => p.is_active && p.kind === 'bump').sort((a, b) => a.price_credits - b.price_credits)[0] ?? null;
}

function EtatReserve() {
  const t = useTranslations('credits.reserve');
  return (
    <div data-slot="credits-reserve" className="mx-auto max-w-xl px-4 py-10">
      <EmptyState title={t('titre')} description={t('texte')} />
    </div>
  );
}

/** Le panneau « Historique » (toutes les opérations, 20 par page) ou « Lots de crédits ». */
function PanneauDesCredits({
  panneau,
  lots,
  maintenant,
  onFermer,
}: {
  readonly panneau: Panneau | null;
  readonly lots: readonly CreditLot[];
  readonly maintenant: number;
  readonly onFermer: () => void;
}) {
  const t = useTranslations('credits');
  const [page, setPage] = useState(1);
  const journal = useCreditsJournal(page, HISTORIQUE_PANNEAU, panneau === 'historique');
  const mouvements = journal.data?.movements ?? [];
  return (
    <PanneauDroit
      open={panneau !== null}
      onOpenChange={(o) => (o ? undefined : onFermer())}
      titre={panneau === 'lots' ? t('page.lots') : t('page.historique')}
    >
      <div className="-mx-5 -my-5">
        {panneau === 'lots' ? (
          <ListeDesLots lots={lots} maintenant={maintenant} />
        ) : journal.isLoading ? (
          <RouteSkeleton variant="list" />
        ) : journal.isError ? (
          <ErrorState className="m-5" message={t('loadError')} onRetry={() => void journal.refetch()} retryLabel={t('retry')} />
        ) : mouvements.length === 0 ? (
          <EmptyState className="py-8" title={t('movements.empty')} />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {mouvements.map((m) => (
                <LigneDOperation key={m.id} m={m} />
              ))}
            </ul>
            <PiedDeTableau meta={journal.data?.meta} onPage={setPage} />
          </>
        )}
      </div>
    </PanneauDroit>
  );
}

/** La page ne leur est pas ouverte : pas un échec de chargement, pas de « Réessayer ». */
function estReservee(erreur: unknown): boolean {
  if (!(erreur instanceof ApiError)) return false;
  if (erreur.status === 403) return true;
  const code = erreur.data && typeof erreur.data === 'object' ? (erreur.data as { code?: unknown }).code : undefined;
  return erreur.status === 422 && code === 'credits.no_space';
}

export function PageCredits() {
  const t = useTranslations('credits');
  const f = useFormatteurs();
  const telephone = useMatchesMedia(REQUETE_DE_LA_BARRE);
  // Le libellé du solde suit la NATURE de l'espace actif, pas le rôle : l'hôte (agence `individual`)
  // est `agency_admin` de son propre espace — mesuré sur l'hôte de démo — et lit « de votre espace ».
  const profils = useMyProfiles();
  const credits = useCredits(true, 1);
  // Réservée : 403 (le personnel sans `boost.spend`, le bailleur) ET 422 `credits.no_space` (le
  // prestataire, le client : aucun espace) — mesuré sur la démo. Ni l'un ni l'autre n'est une panne.
  const reserve = estReservee(credits.error);
  const accessible = credits.isSuccess;

  const produits = useBoostProducts(accessible);
  const [pageBoosts, setPageBoosts] = useState(1);
  const boosts = useMisesEnAvant(pageBoosts, BOOSTS_PAR_PAGE, accessible);
  const suggestions = useBiensAPousser(SUGGESTIONS, accessible);
  const [pageHistorique, setPageHistorique] = useState(1);
  const journal = useCreditsJournal(pageHistorique, HISTORIQUE_BUREAU, accessible && !telephone);
  const [flux, setFlux] = useState<Preselection | null>(null);
  const [panneau, setPanneau] = useState<Panneau | null>(null);
  const [maintenant] = useState(() => Date.now());

  if (reserve) return <EtatReserve />;
  if (credits.isLoading || profils.isLoading) return <RouteSkeleton variant="list" />;
  if (credits.isError || !credits.data) {
    return <ErrorState className="m-4" message={t('loadError')} onRetry={() => void credits.refetch()} retryLabel={t('retry')} />;
  }

  const { balance: solde, lots } = credits.data.data;
  const derniere: CreditMovement | undefined = credits.data.movements[0];
  const offres = produits.data?.data ?? [];
  const grille = grilleDesOffres(offres);
  const remontee = remonteeActive(offres);
  const expiration = prochaineExpiration(lots);
  const libelleSolde = natureDeLEspaceActif(profils.data) === 'standard' ? t('page.soldeAgence') : t('page.soldeEspace');
  const listeBoosts = boosts.data?.data ?? [];
  const listeSuggestions = suggestions.data?.data ?? [];
  const nbSuggestions = suggestions.data?.meta.total ?? 0;

  const ouvrir = (preselection: Preselection) => setFlux(preselection);
  const relancer = (b: MiseEnAvant, offre: BoostProduct) => ouvrir({ bien: b.property, offreId: offre.id });
  const remonter = (x: BienAPousser, offre: BoostProduct) => ouvrir({ bien: x, offreId: offre.id });

  const flot = flux ? <MettreEnAvant preselection={flux} bureau={!telephone} onFermer={() => setFlux(null)} /> : null;
  const panneaux = <PanneauDesCredits panneau={panneau} lots={lots} maintenant={maintenant} onFermer={() => setPanneau(null)} />;

  const etatDesBoosts = boosts.isLoading ? (
    <RouteSkeleton variant="list" />
  ) : boosts.isError ? (
    <ErrorState className="m-4" message={t('loadError')} onRetry={() => void boosts.refetch()} retryLabel={t('retry')} />
  ) : listeBoosts.length === 0 ? (
    <AucuneMiseEnAvant />
  ) : null;

  const listeAPousser =
    listeSuggestions.length === 0 ? (
      <EmptyState className="py-8" title={t('pousser.vide')} />
    ) : (
      <ul className="divide-y divide-border">
        {listeSuggestions.map((x) => (
          <BienAPousserLigne key={x.id} x={x} remontee={remontee} onRemonter={remonter} bureau={!telephone} />
        ))}
      </ul>
    );

  const boutonMettreEnAvant = (
    <Button type="button" size={telephone ? 'xl' : 'default'} className={telephone ? 'mt-4 w-full' : undefined} onClick={() => ouvrir(AUCUNE_PRESELECTION)}>
      <TrendingUp className={telephone ? 'size-icone' : 'size-4'} aria-hidden="true" /> {t('page.mettreEnAvant')}
    </Button>
  );

  if (telephone) {
    const totalInitial = lots.reduce((s, l) => s + l.initial_amount, 0);
    const totalRestant = lots.reduce((s, l) => s + l.remaining_amount, 0);
    return (
      <PagePleineLargeur data-slot="credits" className="pb-8">
        <DeclarerEnTete titre={t('page.titre')} />
        <div className="px-4 pt-4">
          <CarteSolde solde={solde} expiration={expiration} libelle={libelleSolde}>
            {boutonMettreEnAvant}
            <Recharger className="mt-2 w-full" />
          </CarteSolde>

          <Rubrique id="credits-en-avant" className="mt-6">
            {t('boosts.titre')}
          </Rubrique>
          <Carte aria-labelledby="credits-en-avant">
            {etatDesBoosts ?? (
              <>
                <ul className="divide-y divide-border">
                  {listeBoosts.map((b) => (
                    <MiseEnAvantMobile key={b.id} b={b} produits={offres} onRelancer={relancer} />
                  ))}
                </ul>
                {(boosts.data?.meta.last_page ?? 1) > 1 ? <PiedDeTableau meta={boosts.data?.meta} onPage={setPageBoosts} /> : null}
              </>
            )}
          </Carte>

          <Rubrique id="credits-a-pousser" className="mt-6">
            {t('pousser.titre')}
          </Rubrique>
          <Carte aria-labelledby="credits-a-pousser">
            {nbSuggestions > 0 ? (
              <p className="border-b border-border px-4 py-3 text-sm leading-snug text-foreground">
                <span className="font-semibold">{t('pousser.compte', { count: nbSuggestions })}</span>
                {remontee ? ` ${t('pousser.prixRemontee', { count: remontee.price_credits })}` : null}
              </p>
            ) : null}
            {listeAPousser}
          </Carte>

          <Rubrique id="credits-cout" className="mt-6">
            {t('page.cout')}
          </Rubrique>
          <Carte aria-labelledby="credits-cout">
            <GrilleDesOffres lignes={grille} />
          </Carte>

          <Carte className="mt-6 overflow-hidden [&_[data-slot=ligne-de-liste]:last-child]:border-b-0">
            <LigneDeListe
              debut={
                <IconeDeLigne>
                  <History strokeWidth={1.75} />
                </IconeDeLigne>
              }
              titre={t('page.historique')}
              detail={
                derniere
                  ? t('page.derniere', { date: f.jourMois(derniere.created_at), delta: signe(derniere.amount), count: Math.abs(derniere.amount) })
                  : t('movements.empty')
              }
              chevron
              onClick={() => setPanneau('historique')}
            />
            <LigneDeListe
              debut={
                <IconeDeLigne>
                  <Layers strokeWidth={1.75} />
                </IconeDeLigne>
              }
              titre={t('page.lots')}
              detail={
                lots.length === 0
                  ? t('lots.empty')
                  : [
                      t('page.nbLots', { count: lots.length }),
                      t('lots.remaining', { remaining: totalRestant, initial: totalInitial }),
                      expiration ? t('page.expireLe', { date: f.jourMois(expiration.date) }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
              }
              chevron
              onClick={() => setPanneau('lots')}
            />
          </Carte>
        </div>
        {flot}
        {panneaux}
      </PagePleineLargeur>
    );
  }

  const mouvements = journal.data?.movements ?? [];
  return (
    <div data-slot="credits" className="space-y-6">
      <PageHeader
        title={t('page.titre')}
        description={t('page.sousTitre')}
        actions={
          <>
            <Recharger className="h-9 px-3 text-sm" />
            {boutonMettreEnAvant}
          </>
        }
      />
      {/* Bureau 1280 : la colonne du solde cède ce qui manque au tableau (320 px à 1440) ; sous xl,
          une seule colonne. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_min(20rem,calc(100%-42.5rem))]">
        <div className="min-w-0 space-y-6">
          <Carte titre={t('boosts.titre')} aria-labelledby="credits-en-avant">
            {etatDesBoosts ?? (
              <>
                <TableDesMisesEnAvant boosts={listeBoosts} produits={offres} onRelancer={relancer} maintenant={maintenant} />
                {(boosts.data?.meta.last_page ?? 1) > 1 ? <PiedDeTableau meta={boosts.data?.meta} onPage={setPageBoosts} /> : null}
              </>
            )}
          </Carte>
          <Carte
            titre={nbSuggestions > 0 ? t('pousser.titreCompte', { count: nbSuggestions }) : t('pousser.titre')}
            action={remontee && nbSuggestions > 0 ? t('pousser.prixRemontee', { count: remontee.price_credits }) : undefined}
            aria-labelledby="credits-a-pousser"
          >
            {listeAPousser}
          </Carte>
        </div>
        <div className="space-y-4">
          <CarteSolde compact solde={solde} expiration={expiration} libelle={libelleSolde} />
          <Carte titre={t('page.cout')} aria-labelledby="credits-cout">
            <GrilleDesOffres lignes={grille} />
          </Carte>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Carte titre={t('page.lots')} aria-labelledby="credits-lots">
          <ListeDesLots lots={lots} maintenant={maintenant} />
        </Carte>
        <Carte
          titre={t('page.historique')}
          aria-labelledby="credits-historique"
          action={
            mouvements.length > 0 ? (
              <button type="button" onClick={() => setPanneau('historique')} className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
                {t('page.toutVoir')}
              </button>
            ) : undefined
          }
        >
          {journal.isLoading ? (
            <RouteSkeleton variant="list" />
          ) : journal.isError ? (
            <ErrorState className="m-4" message={t('loadError')} onRetry={() => void journal.refetch()} retryLabel={t('retry')} />
          ) : mouvements.length === 0 ? (
            <EmptyState className="py-8" title={t('movements.empty')} />
          ) : (
            <>
              <TableDeLHistorique mouvements={mouvements} />
              <PiedDeTableau meta={journal.data?.meta} onPage={setPageHistorique} />
            </>
          )}
        </Carte>
      </div>
      {flot}
      {panneaux}
    </div>
  );
}
