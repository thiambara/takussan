'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { usePathname, useSearchParams } from 'next/navigation';
import { Search, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { EnTeteDePage } from '@/components/navigation-publique/EnTeteDePage';
import { Footer } from '@/components/home/Footer';
import { EmptyState, ErrorState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompare as useCompareStore } from '@/context/CompareContext';
import { useCompare as useCompareFetch } from '@/hooks/useCompare';
import { COMPARE_MAX_IDS, idsToCsv, parseIdsCsv } from '@/lib/compare';
import type { PropertyDetail } from '@/types/property';
import { CompareColonnes, RESERVE_BARRE_PARTAGER, type CompareColumn } from '@/components/compare/CompareColonnes';
import { PartagerLaComparaison } from '@/components/compare/PartagerLaComparaison';
import { estAdresseEcrite, retenirAdresse } from '@/components/compare/adresses-ecrites';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

/**
 * TCK-082 — `/compare` route client ; TCK-2509 — colonnes alignées, « Partager », biens retirés.
 *
 * Un LIEN PARTAGÉ (`?ids=1,2,3`) fait foi : « regarde ces trois » doit montrer la même chose chez
 * le destinataire, et sa sélection locale le suit. Une adresse que le comparateur a LUI-MÊME écrite
 * (retenue en `sessionStorage`, voir `adresses-ecrites.ts`) est sa page d'historique : la sélection
 * locale l'emporte (décision de la revue adverse, 2026-11-09 — « Ajouter un bien » puis Retour
 * effaçait le bien ajouté).
 *
 * Relevé de l'audit UX (2026-11, § 6) : ouverte avec `?ids=857,93,11`, la page affichait les trois
 * biens et l'adresse devenait `?ids=530`. Deux effets se croisaient au premier rendu : l'un
 * remplaçait la sélection par l'URL, l'autre — qui voyait encore l'ancienne sélection — réécrivait
 * l'URL avec elle. Désormais :
 *
 * - un seul effet, qui tranche entre lien partagé et page à soi ;
 * - « Retirer » écrit l'URL et la sélection dans le MÊME geste, sans attendre un effet ;
 * - l'URL s'écrit par `history.replaceState`, que Next relie à `useSearchParams` — et non par
 *   `router.replace`, qui attend un aller-retour serveur avant de changer l'adresse : relevé au
 *   navigateur le 2026-11-09, un second retrait pendant cette attente partait de l'ANCIENNE URL et
 *   y remettait le bien qu'un premier retrait venait d'ôter ;
 * - sans `?ids=`, la page montre la sélection locale et l'inscrit dans l'URL.
 *
 * Un bien devenu indisponible (absent de `returned_ids`) quitte la comparaison — URL et sélection —
 * avec un avis qui le nomme quand on le connaît, et « Biens proches » : il n'occupe plus une place.
 */
export function CompareClient() {
  const t = useTranslations('compare');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ids: storeIds, previews, isHydrated, update } = useCompareStore();

  const urlIdsCsv = searchParams.get('ids');
  const urlIds = useMemo(() => parseIdsCsv(urlIdsCsv), [urlIdsCsv]);
  const urlCsv = idsToCsv(urlIds);

  // ── À qui est cette adresse ? ─────────────────────────────────────────
  // Une adresse `?ids=` que le comparateur a lui-même écrite dans cet onglet est SA page
  // d'historique : revenue par « Retour » après « Ajouter un bien », elle ne connaît pas le
  // bien ajouté entre-temps — la sélection locale l'emporte, et l'adresse est réécrite pour la
  // refléter. Toute autre adresse est un lien partagé : elle l'emporte, comme au premier jour.
  // Lu après l'hydratation seulement : le serveur ne voit pas le `sessionStorage`.
  const pageAMoi = isHydrated && estAdresseEcrite(urlCsv);

  // Les ids affichés : ceux d'un lien partagé, sinon la sélection locale (avant l'hydratation,
  // l'URL, pour que le rendu serveur et le premier rendu client concordent).
  const effectiveIds = !isHydrated ? urlIds : urlCsv !== '' && !pageAMoi ? urlIds : storeIds;
  const effectiveCsv = idsToCsv(effectiveIds);
  const storeCsv = idsToCsv(storeIds);

  /** Écrit `?ids=` (et le retient comme écrit par le comparateur), sans toucher aux autres paramètres. */
  const ecrireIds = (ids: readonly number[]) => {
    // `ids` écrit à la main : `URLSearchParams` encoderait les virgules (`11%2C13`), et le lien
    // partagé deviendrait illisible. Les autres paramètres passent tels quels.
    const autres = new URLSearchParams(searchParams.toString());
    autres.delete('ids');
    const qs = [ids.length > 0 ? `ids=${idsToCsv(ids)}` : '', autres.toString()].filter(Boolean).join('&');
    retenirAdresse(idsToCsv(ids));
    window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  };

  // ── L'adresse et la sélection se rejoignent ───────────────────────────
  // Lien partagé : la sélection prend ses ids — en gardant l'aperçu (titre, photo) de chaque bien
  // qui y reste, relu au stockage et non au rendu —, et l'adresse devient celle du comparateur. Sa
  // propre page (ou pas d'ids) : l'adresse suit la sélection. Un retrait écrit les deux dans le
  // même geste : l'effet les trouve égales et ne fait rien.
  useEffect(() => {
    if (!isHydrated) return;
    if (urlCsv !== '' && !estAdresseEcrite(urlCsv)) {
      if (urlCsv !== storeCsv) update(({ previews: apercus }) => ({ ids: [...urlIds], previews: apercus }));
      retenirAdresse(urlCsv);
      return;
    }
    if (storeCsv !== urlCsv) ecrireIds(storeIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCsv, storeCsv, isHydrated]);

  /** Retire des biens de la comparaison : l'URL ET la sélection, dans le même geste. */
  const retirer = (aRetirer: readonly number[]) => {
    update(({ ids, previews: apercus }) => ({
      ids: ids.filter((id) => !aRetirer.includes(id)),
      previews: apercus,
    }));
    ecrireIds(effectiveIds.filter((id) => !aRetirer.includes(id)));
  };

  const { properties, loading, error, requestedIds, returnedIds } =
    useCompareFetch(effectiveIds);

  // ── Les biens devenus indisponibles ──────────────────────────────────
  // Seulement sur une réponse qui porte EXACTEMENT les ids affichés : pendant le chargement d'un
  // bien qu'on vient d'ajouter, il manque à l'ancienne réponse sans être indisponible.
  const indisponibles =
    requestedIds !== null && returnedIds !== null && idsToCsv(requestedIds) === effectiveCsv
      ? requestedIds.filter((id) => !returnedIds.includes(id))
      : [];
  const indisponiblesCsv = idsToCsv(indisponibles);
  // L'avis survit au retrait : une fois sortis de l'URL, ces biens ne sont plus dans aucune réponse.
  // L'état s'ajuste PENDANT le rendu (patron React « ajuster l'état quand une valeur change »), et
  // l'effet ne touche qu'aux systèmes extérieurs — la sélection et l'URL.
  const [retires, setRetires] = useState<BienRetire[]>([]);
  const nouveauxRetires = indisponibles.filter((id) => !retires.some((r) => r.id === id));
  if (nouveauxRetires.length > 0) {
    setRetires([
      ...retires,
      ...nouveauxRetires.map((id) => ({ id, title: previews[id]?.title ?? null, slug: previews[id]?.slug ?? null })),
    ]);
  }

  useEffect(() => {
    if (indisponibles.length === 0) return;
    retirer(indisponibles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indisponiblesCsv]);

  // Un bien absent de la réponse n'a pas de colonne : il ne garde pas sa place en tirets.
  const columns: CompareColumn[] = effectiveIds
    .map((id) => ({ id, property: findProperty(properties, id) }))
    .filter((col): col is CompareColumn => col.property !== null);

  const showEmpty = effectiveIds.length - indisponibles.length < 2;
  const showLoading = !showEmpty && loading && properties === null;
  const showError = !!error;
  const placesLibres = Math.max(0, COMPARE_MAX_IDS - effectiveIds.length);
  const cheminDePartage = `${pathname}?ids=${idsToCsv(columns.map((c) => c.id))}`;
  const montreLesColonnes = !showEmpty && !showLoading && !showError;

  return (
    <div className={cn('min-h-screen bg-surface', montreLesColonnes && RESERVE_BARRE_PARTAGER)}>
      <Navbar />
      <NavbarSpacer />
      {/* TCK-2568 — au téléphone, pas de barre du site : « ← 3 biens · 1 place libre » (maquette du
          comparateur, approche A), collée au-dessus de l'en-tête des colonnes. */}
      <EnTeteDePage
        retour={{ repli: '/properties' }}
        titre={showEmpty ? undefined : t('summary', { count: effectiveIds.length, free: placesLibres })}
        titreDeLaPage={false}
      />

      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 md:px-8 focus:outline-none">
        <header className="mb-4 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Scale className="h-4 w-4" aria-hidden="true" />
            {t('eyebrow')}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground text-balance md:text-3xl">{t('title')}</h1>
          {!showEmpty && (
            <p className="hidden text-sm text-muted-foreground tabular-nums lg:block">
              {t('summary', { count: effectiveIds.length, free: placesLibres })}
            </p>
          )}
        </header>

        {retires.length > 0 && <AvisDesRetires retires={retires} />}

        {showEmpty ? (
          <CompareEmpty />
        ) : showLoading ? (
          <LoadingState count={effectiveIds.length} />
        ) : showError ? (
          <ErrorState message={error!} />
        ) : (
          <CompareColonnes
            columns={columns}
            onRemove={(id) => retirer([id])}
            partage={<PartagerLaComparaison chemin={cheminDePartage} count={columns.length} />}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}

type BienRetire = { readonly id: number; readonly title: string | null; readonly slug: string | null };

/**
 * L'avis d'un bien qui a quitté la comparaison. Il le NOMME quand la sélection en gardait le titre
 * (un lien partagé n'en porte aucun) ; « Biens proches » mène à sa fiche, qui, pour un bien loué,
 * vendu ou retiré, montre des biens similaires et la recherche de son quartier (TCK-598).
 */
function AvisDesRetires({ retires }: { readonly retires: readonly BienRetire[] }) {
  const t = useTranslations('compare.unavailable');
  return (
    <div role="status" className="mb-4">
    <ul className="space-y-2">
      {retires.map((bien) => (
        <li
          key={bien.id}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-muted px-3.5 py-2.5 text-sm leading-snug text-foreground"
        >
          <span className="min-w-0 flex-1">
            {bien.title ? t.rich('named', { title: bien.title, b: (c) => <span className="font-medium">{c}</span> }) : t('anonymous')}
          </span>
          <LienLocalise
            href={bien.slug ? `/properties/${bien.slug}` : '/properties'}
            className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4"
          >
            {t('nearby')}
          </LienLocalise>
        </li>
      ))}
    </ul>
    </div>
  );
}

function findProperty(
  properties: readonly PropertyDetail[] | null,
  id: number,
): PropertyDetail | null {
  if (!properties) return null;
  return properties.find((p) => p.id === id) ?? null;
}

function CompareEmpty() {
  const t = useTranslations('compare.empty');
  return (
    <EmptyState
      icon={<Scale className="size-8" aria-hidden="true" />}
      title={t('title')}
      description={t('description')}
      action={
        <LienLocalise href="/properties" className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-4')}>
          <Search className="size-4" aria-hidden="true" />
          {t('cta')}
        </LienLocalise>
      }
    />
  );
}

/**
 * L'attente du comparatif — la MÊME forme que ce qui va la remplacer (TCK-577, repris par TCK-2509).
 *
 * TCK-577 a payé une attente en `repeat(n, minmax(200px, 1fr))` à photos 4:3 : `/fr/compare` à
 * quatre biens élargissait la page à 864 px à 320, 360 et 390 (relevé du 2026-09-24), puis le
 * premier critère sautait à l'arrivée. L'attente reprend donc la grille de `CompareColonnes` —
 * mêmes colonnes en `minmax(0, 1fr)`, même en-tête de hauteur fixe (vignette de 56 px au téléphone),
 * même rangée de bascule — et des lignes de critères.
 */
function LoadingState({ count }: { count: number }) {
  const placeLibre = count < COMPARE_MAX_IDS;
  const style = {
    '--colonnes-mobile': `repeat(${Math.max(count, 1)}, minmax(0, 1fr))`,
    '--colonnes-bureau': `minmax(8rem, 13rem) repeat(${count + (placeLibre ? 1 : 0)}, minmax(0, 1fr))`,
  } as React.CSSProperties;
  const grille = 'grid grid-cols-(--colonnes-mobile) gap-x-2 md:grid-cols-(--colonnes-bureau) md:gap-x-6';
  return (
    <div aria-busy="true" style={style} data-testid="compare-chargement">
      <div className="mb-3 flex min-h-11 items-center">
        <Skeleton className="h-6 w-56" />
      </div>
      <div className={cn(grille, 'border-b border-border pb-3 pt-2')}>
        <div className="hidden md:block" />
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="min-w-0">
            <Skeleton className="h-14 rounded-lg md:h-24 lg:h-28" />
            <Skeleton className="mt-1.5 h-4 w-3/4" />
            <Skeleton className="mt-1 h-3.5 w-full" />
          </div>
        ))}
        {placeLibre && <div className="hidden md:block" />}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={cn(grille, 'gap-y-1 border-b border-border py-3')}>
          <Skeleton className="col-span-full h-4 w-24 md:col-span-1" />
          {Array.from({ length: count }).map((__, j) => (
            <Skeleton key={j} className="h-5" />
          ))}
        </div>
      ))}
    </div>
  );
}
