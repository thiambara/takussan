'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState, ErrorState } from '@/components/feedback';
import { FavoriteNote, normalizeFavoriteProperty, type UnavailableFavorite } from '@/components/favorites/FavoriteNote';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  retenirFacettes,
  useFacettesDe,
  useFavorites,
  usePrixALAjout,
  remove as storeRemove,
} from '@/lib/favoritesStore';
import { cheminDesBiensProches, ecartDepuisLAjout } from '@/lib/favoris-suivi';
import {
  useFavoritesQuery,
  usePropertiesByIdsChunkedQuery,
  useRemoveFavoriteMutation,
} from '@/lib/queries/favorites';
import { useNouveauxDesRecherches, useSavedSearchesQuery } from '@/lib/queries/saved-searches';
import type { PropertyListItem } from '@/types/property';

import { CarteDeCompte } from './suivi/CarteDeCompte';
import { CarteDeSuivi, CarteEteinte } from './suivi/CarteDeSuivi';
import { OngletRecherches } from './suivi/OngletRecherches';
import { PartageDeSelection } from './suivi/PartageDeSelection';
import { PrevenirDeLaSelection } from './suivi/PrevenirDeLaSelection';

/**
 * TCK-2508 — la page Favoris, « Le suivi » (maquette `?p=favoris&a=a`).
 *
 * Deux personas, deux sources, une seule carte :
 *
 * - **anonyme** — les identifiants du magasin local (`favoritesStore`), relus par `by-ids` ; l'écart
 *   se calcule contre le prix retenu à l'ajout dans l'appareil. `by-ids` écarte en silence un bien
 *   sorti du public : il est purgé du magasin, comme avant (l'anonyme ne peut pas savoir pourquoi).
 *   Une carte propose de garder ses favoris avec son numéro.
 *   En pied de liste, « Prévenez-moi quand un bien comme ceux-ci arrive à … » : l'alerte sans compte.
 * - **connecté** — `GET /api/favorites` paginé (TCK-599) : `price_change` (TCK-2507), la note
 *   personnelle, la carte éteinte d'un bien loué ou retiré ; et un second onglet, ses recherches
 *   sauvegardées avec leurs biens nouveaux.
 *
 * Ce que la page faisait avant et qu'elle garde : plus récent d'abord, purge des fantômes de
 * l'anonyme, état vide « Découvrir des biens », erreur, cœur et comparateur sur chaque carte ;
 * de l'espace connecté : pagination, note, état « plus disponible ».
 */
const PAR_PAGE = 24;
const LISTE = 'divide-y divide-border lg:grid lg:grid-cols-3 lg:gap-x-6 lg:gap-y-10 lg:divide-y-0 xl:grid-cols-4';

/** L'onglet porté par l'URL : un retour arrière depuis une recherche rouvre « Recherches ». */
const PARAM_ONGLET = 'tab';
export type OngletDesFavoris = 'properties' | 'searches';
type Onglet = OngletDesFavoris;

/**
 * TCK-2618 (décision 4 b) — dans la coque de `/app`, chaque onglet EST une route : `/app/favorites`
 * ouvre « Biens », `/app/saved-searches` « Recherches », et changer d'onglet change de route — l'entrée
 * active de la colonne suit l'onglet ouvert.
 */
export const ROUTES_DES_ONGLETS: Readonly<Record<OngletDesFavoris, string>> = {
  properties: '/app/favorites',
  searches: '/app/saved-searches',
};

export interface SuiviDesFavorisProps {
  /**
   * `publique` (défaut) : la page du site, l'onglet dans `?tab=`. `app` : la même page dans la coque
   * de `/app` (TCK-2618), l'onglet par la route ({@link ROUTES_DES_ONGLETS}), et la gestion des
   * recherches (alerte, suppression) sur chaque ligne.
   */
  readonly coque?: 'publique' | 'app';
  /** Sous `/app` : l'onglet de la route. */
  readonly onglet?: OngletDesFavoris;
}

/**
 * TCK-2618 — le CONTENU de la page des favoris, sans la coque du site (`Navbar`, `Footer`, `<main>`) :
 * `PublicFavoritesPage` l'enveloppe sur `/<langue>/favorites`, et `/app/favorites` comme
 * `/app/saved-searches` le rendent dans la coque de `/app`, qui porte déjà le `<main>` visé par le
 * lien d'évitement.
 */
export function SuiviDesFavoris({ coque = 'publique', onglet }: SuiviDesFavorisProps) {
  const { user, token, isLoading } = useAuth();
  // Un jeton sans utilisateur résolu : ni la page du compte, ni celle de l'anonyme. Décidé sur
  // `token && !user` SEULEMENT — `isLoading`, que la relecture de `/me` lève elle-même, n'entre pas
  // dans ce qui monte ou démonte : il démontait l'attente, qui relançait `/me`, sans fin.
  const compteEnAttente = Boolean(token) && !user;
  const relecture = useRelectureDuCompte(compteEnAttente);
  return user && token ? (
    <FavorisDuCompte coque={coque} ongletDeLaRoute={onglet} />
  ) : compteEnAttente ? (
    // `/me` lent ou en échec au rendu de la mise en page racine : c'est un client, jamais la
    // page de l'anonyme — elle lui montrerait un autre persona et « Continuer avec mon numéro ».
    <CompteEnAttente echec={relecture.echec} onReessayer={relecture.reessayer} />
  ) : isLoading ? (
    <Attente />
  ) : (
    <FavorisDeLAppareil />
  );
}

function EnTete({ sousTitre, action }: { readonly sousTitre: ReactNode; readonly action?: ReactNode }) {
  const t = useTranslations('favorites.suivi');
  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-affiche-28 font-semibold leading-tight tracking-titre text-balance lg:text-affiche-40">
          {t('titre')}
        </h1>
        <p className="text-sm text-muted-foreground tabular-nums lg:text-base">{sousTitre ?? t('sousTitreChargement')}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

function Attente() {
  return (
    <div data-testid="favoris-en-attente">
      <EnTete sousTitre={null} />
      <GrilleDAttente nombre={3} />
    </div>
  );
}

/** Au-delà, l'attente propose de réessayer, même si `/me` n'a pas encore répondu. */
export const DELAI_RELECTURE_DU_COMPTE_MS = 5000;

/**
 * La relecture de `/me` quand un jeton n'a pas d'utilisateur résolu. Tenue par la PAGE, qui reste
 * montée, et non par l'écran d'attente :
 *
 * - **une seule relecture par montage**, gardée par un ref posé AVANT l'appel ;
 * - **jamais plus d'un `/me` en vol** — « Réessayer » pendant un appel ne lance rien de plus ;
 * - **l'échec est dit** à la réponse (le compte n'est toujours pas résolu) ou au bout de
 *   {@link DELAI_RELECTURE_DU_COMPTE_MS}, et propose de réessayer.
 *
 * Un 401 dit le jeton mort (`refreshUser` rend `fermee`) : la session se ferme par `logout()`, le
 * seul chemin de sortie d'`AuthContext` — le jeton part, et la page de l'appareil vient, sans
 * écran d'erreur. Les favoris de l'appareil restent : ce compte n'a jamais été résolu ici.
 */
function useRelectureDuCompte(actif: boolean): { readonly echec: boolean; readonly reessayer: () => void } {
  const { refreshUser, logout } = useAuth();
  const dejaRelu = useRef(false);
  const enVol = useRef(false);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [echec, setEchec] = useState(false);

  function lancer() {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setEchec(true), DELAI_RELECTURE_DU_COMPTE_MS);
    if (enVol.current) return;
    enVol.current = true;
    void refreshUser()
      .then((issue) => {
        if (issue === 'fermee') return logout();
      })
      .finally(() => {
        enVol.current = false;
        if (minuteur.current) clearTimeout(minuteur.current);
        minuteur.current = null;
        setEchec(true);
      });
  }

  useEffect(() => {
    if (!actif || dejaRelu.current) return;
    dejaRelu.current = true;
    lancer();
  });

  useEffect(
    () => () => {
      if (minuteur.current) clearTimeout(minuteur.current);
    },
    [],
  );

  return {
    echec,
    reessayer: () => {
      setEchec(false);
      lancer();
    },
  };
}

function CompteEnAttente({ echec, onReessayer }: { readonly echec: boolean; readonly onReessayer: () => void }) {
  const t = useTranslations('favorites.suivi');
  const tCommon = useTranslations('common');
  if (!echec) return <Attente />;
  return (
    <>
      <EnTete sousTitre={null} />
      <div className="mt-6">
        <ErrorState message={t('compteEnAttente')} onRetry={onReessayer} retryLabel={tCommon('actions.retry')} />
      </div>
    </>
  );
}

function GrilleDAttente({ nombre }: { readonly nombre: number }) {
  return (
    <div className={cn(LISTE, 'mt-4')} aria-hidden="true">
      {Array.from({ length: nombre }).map((_, i) => (
        <div key={i} className="flex gap-3.5 py-4 lg:flex-col lg:py-0">
          <Skeleton className="size-[92px] flex-none rounded-xl lg:aspect-4/3 lg:size-auto lg:w-full lg:rounded-2xl" />
          <div className="flex-1 space-y-2 lg:mt-3">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function FavorisVides() {
  const t = useTranslations('favorites.page');
  return (
    <EmptyState
      icon={<Heart className="size-8" aria-hidden="true" />}
      title={t('empty')}
      description={t('emptyHint')}
      action={
        <LienLocalise href="/properties" className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-4')}>
          {t('discoverCta')}
        </LienLocalise>
      }
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Anonyme : le magasin de l'appareil
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function FavorisDeLAppareil() {
  const t = useTranslations('favorites.suivi');
  const tPage = useTranslations('favorites.page');
  const { ids, isHydrated, count } = useFavorites();
  const prixALAjout = usePrixALAjout();

  // Plus récent d'abord.
  const lookupIds = [...ids].reverse();
  const query = usePropertiesByIdsChunkedQuery(lookupIds);

  // Purge des fantômes (dépubliés, supprimés) : le compteur reste juste.
  useEffect(() => {
    if (!query.data) return;
    const returned = new Set(query.data.meta.returned_ids);
    query.data.meta.requested_ids.forEach((id) => {
      if (!returned.has(id)) storeRemove(id);
    });
  }, [query.data]);

  const parId = new Map((query.data?.data ?? []).map((p) => [p.id, p]));
  const ordonnes = lookupIds.map((id) => parId.get(id)).filter((p): p is PropertyListItem => Boolean(p));

  const chargement = !isHydrated || (count > 0 && query.isLoading);

  // Ce que l'écran montre d'un bien public, retenu pour les « Biens proches » de sa carte éteinte.
  useEffect(() => {
    if (query.data) retenirFacettes(query.data.data);
  }, [query.data]);

  return (
    <>
      <EnTete
        sousTitre={isHydrated ? t('sousTitreAppareil', { count }) : null}
        action={ordonnes.length > 0 ? <PartageResponsive biens={ordonnes} /> : null}
      />
      {chargement ? (
        <GrilleDAttente nombre={Math.max(3, Math.min(count, 6))} />
      ) : count === 0 ? (
        <div className="mt-6">
          <FavorisVides />
        </div>
      ) : query.isError ? (
        // Pas d'`onRetry` : `usePropertiesByIdsChunkedQuery` agrège plusieurs requêtes et n'expose
        // pas de `refetch`. Un bouton qui n'aurait rien à appeler serait pire que pas de bouton.
        <div className="mt-6">
          <ErrorState message={tPage('error')} />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <CarteDeCompte />
          </div>
          <p className="mt-5 hidden text-sm text-muted-foreground lg:block">{t('suiviAppareil')}</p>
          <ul className={cn(LISTE, 'lg:mt-6')}>
            {ordonnes.map((bien, i) => (
              <li key={bien.id}>
                <CarteDeSuivi
                  bien={bien}
                  ecart={ecartDepuisLAjout(prixALAjout[bien.id], bien.price)}
                  depuis="ajout"
                  priorite={i < 3}
                />
              </li>
            ))}
          </ul>
          <div className="mt-2 lg:mt-10">
            <PrevenirDeLaSelection biens={ordonnes} />
          </div>
        </>
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Connecté : l'API, deux onglets
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function FavorisDuCompte({
  coque,
  ongletDeLaRoute,
}: {
  readonly coque: 'publique' | 'app';
  readonly ongletDeLaRoute?: Onglet;
}) {
  const t = useTranslations('favorites.suivi');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dansLApp = coque === 'app';
  const onglet: Onglet = dansLApp
    ? (ongletDeLaRoute ?? 'properties')
    : searchParams.get(PARAM_ONGLET) === 'searches'
      ? 'searches'
      : 'properties';
  const [page, setPage] = useState(1);

  const favoris = useFavoritesQuery({ page, per_page: PAR_PAGE });
  const recherches = useSavedSearchesQuery();
  const listeDesRecherches = recherches.data?.data ?? [];
  const nouveaux = useNouveauxDesRecherches(listeDesRecherches);
  let totalNouveaux = 0;
  nouveaux.forEach((n) => {
    totalNouveaux += n?.total ?? 0;
  });

  const items = favoris.data?.data ?? [];
  const disponibles = items
    .filter((f) => f.availability === 'available')
    .map((f) => normalizeFavoriteProperty((f as Extract<typeof f, { availability: 'available' }>).property));
  const totalFavoris = favoris.data?.meta?.total;

  // Ce que l'écran montre d'un bien public, retenu pour les « Biens proches » de sa carte éteinte.
  useEffect(() => {
    const vus = (favoris.data?.data ?? []).flatMap((f) => (f.availability === 'available' ? [f.property] : []));
    retenirFacettes(vus.map(normalizeFavoriteProperty));
  }, [favoris.data]);

  function changerDOnglet(valeur: unknown) {
    const suivant = valeur === 'searches' ? 'searches' : 'properties';
    if (dansLApp) {
      if (suivant !== onglet) router.replace(ROUTES_DES_ONGLETS[suivant], { scroll: false });
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (suivant === 'searches') params.set(PARAM_ONGLET, 'searches');
    else params.delete(PARAM_ONGLET);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <>
      <EnTete
        sousTitre={t('sousTitreCompte')}
        action={onglet === 'properties' && disponibles.length > 0 ? <PartageResponsive biens={disponibles} /> : null}
      />
      <Tabs value={onglet} onValueChange={changerDOnglet} className="mt-4 lg:mt-6">
        <TabsList className="grid h-12! w-full grid-cols-2 rounded-xl p-1 lg:w-fit lg:self-start">
          <TabsTrigger value="properties" className="h-10 rounded-lg px-4 text-corps">
            {t('onglets.biens')}
            {typeof totalFavoris === 'number' ? (
              <span className="tabular-nums text-muted-foreground">{totalFavoris}</span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="searches" className="h-10 rounded-lg px-4 text-corps">
            {t('onglets.recherches')}
            {totalNouveaux > 0 ? (
              <span
                data-testid="badge-nouveaux"
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-legende font-semibold tabular-nums text-primary-foreground"
              >
                <span aria-hidden="true">{totalNouveaux}</span>
                <span className="sr-only">{t('onglets.nouveaux', { count: totalNouveaux })}</span>
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="properties">
          <BiensDuCompte requete={favoris} page={page} onPage={setPage} />
        </TabsContent>
        <TabsContent value="searches">
          <OngletRecherches
            recherches={listeDesRecherches}
            nouveaux={nouveaux}
            chargement={recherches.isLoading}
            erreur={recherches.isError}
            onReessayer={() => void recherches.refetch()}
            gestion={dansLApp}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

/** Pastille au téléphone, bouton plein au bureau — comme la maquette. */
function PartageResponsive({ biens }: { readonly biens: readonly PropertyListItem[] }) {
  return (
    <>
      <PartageDeSelection biens={biens} className="lg:hidden" />
      <PartageDeSelection biens={biens} variante="bureau" className="hidden lg:inline-flex" />
    </>
  );
}

function BiensDuCompte({
  requete,
  page,
  onPage,
}: {
  readonly requete: ReturnType<typeof useFavoritesQuery>;
  readonly page: number;
  readonly onPage: (page: number) => void;
}) {
  const tPage = useTranslations('favorites.page');
  const tCommon = useTranslations('common');

  if (requete.isLoading) return <GrilleDAttente nombre={6} />;
  if (requete.isError) {
    return (
      <ErrorState message={tPage('error')} onRetry={() => void requete.refetch()} retryLabel={tCommon('actions.retry')} />
    );
  }
  const items = requete.data?.data ?? [];
  const dernierePage = requete.data?.meta?.last_page ?? 1;
  if (items.length === 0 && page === 1) return <FavorisVides />;

  return (
    <div className="space-y-8">
      <ul className={cn(LISTE, 'lg:mt-4')}>
        {items.map((item, i) =>
          item.availability === 'available' ? (
            <li key={item.id}>
              <CarteDeSuivi
                bien={normalizeFavoriteProperty(item.property)}
                ecart={item.price_change ?? null}
                depuis="compte"
                priorite={page === 1 && i < 3}
                note={<FavoriteNote item={item} />}
              />
            </li>
          ) : (
            <li key={item.id}>
              <FavoriEteint item={item} />
            </li>
          ),
        )}
      </ul>
      <Pages page={page} derniere={dernierePage} onPage={onPage} />
    </div>
  );
}

/**
 * L'écart d'un favori du compte est celui de l'API, et lui seul : `price_change` part de
 * `price_at_favorite`, le prix à l'enregistrement dans le compte (TCK-2507) — pour un favori versé
 * depuis l'appareil, le prix de la connexion. Le prix gardé par l'appareil ne sert qu'à l'anonyme :
 * un même favori montre ainsi le même écart sur tous les appareils du compte (décision de la revue).
 */
function FavoriEteint({ item }: { readonly item: UnavailableFavorite }) {
  const retrait = useRemoveFavoriteMutation();
  const [erreur, setErreur] = useState(false);
  const facettes = useFacettesDe(item.property_id);
  return (
    <CarteEteinte
      raison={item.availability}
      titre={item.property?.title ?? null}
      hrefProches={cheminDesBiensProches(facettes)}
      retraitEnCours={retrait.isPending}
      erreur={erreur}
      onRetirer={() => {
        setErreur(false);
        retrait.mutateAsync({ property_id: item.property_id }).catch(() => setErreur(true));
      }}
    />
  );
}

/**
 * La pagination de la liste du compte (l'API borne `per_page` à 50). Ici et non `Pagination` de
 * la console : celle-ci lit `console.pagination`, un espace que la coque publique ne sert pas.
 */
function Pages({ page, derniere, onPage }: { readonly page: number; readonly derniere: number; readonly onPage: (p: number) => void }) {
  const t = useTranslations('favorites.suivi.pagination');
  if (derniere <= 1) return null;
  return (
    <nav aria-label={t('aria')} className="flex items-center justify-center gap-3">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('precedente')}
      </Button>
      <span className="text-sm tabular-nums text-muted-foreground">{t('position', { page, derniere })}</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= derniere} onClick={() => onPage(page + 1)}>
        {t('suivante')}
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}
