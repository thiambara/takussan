'use client';

import { Bell, BookmarkCheck, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState, ErrorState } from '@/components/feedback';
import { useResumeDeCriteres } from '@/components/favorites/resume-de-criteres';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { requeteDesCriteres } from '@/lib/favoris-suivi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  useMarquerRechercheVue,
  type NouveauxDUneRecherche,
  type SavedSearch,
} from '@/lib/queries/saved-searches';

export interface OngletRecherchesProps {
  readonly recherches: readonly SavedSearch[];
  readonly nouveaux: ReadonlyMap<number, NouveauxDUneRecherche | undefined>;
  readonly chargement: boolean;
  readonly erreur: boolean;
  readonly onReessayer: () => void;
}

/**
 * TCK-2508 — l'onglet « Recherches » de la page Favoris : chaque recherche sauvegardée, ce
 * qu'elle cherche, son alerte, et les biens publiés depuis sa dernière ouverture (« 3 nouveaux »,
 * avec leurs vignettes). L'ouvrir — la recherche ou l'un de ses nouveaux biens, ici ou dans un
 * nouvel onglet — la marque vue (`POST …/viewed`, en arrière-plan : la navigation n'attend pas) ;
 * au retour, le compte repart de zéro.
 *
 * Le réglage fin de l'alerte et la suppression restent dans `/app/saved-searches`, où ils vivent
 * déjà (« Gérer mes alertes ») : rien de ce qu'ils font n'est réécrit ici.
 */
export function OngletRecherches({ recherches, nouveaux, chargement, erreur, onReessayer }: OngletRecherchesProps) {
  const t = useTranslations('favorites.suivi.recherches');
  const tCommon = useTranslations('common');

  if (chargement) {
    return (
      <div className="space-y-3 pt-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (erreur) {
    return <ErrorState message={t('erreur')} onRetry={onReessayer} retryLabel={tCommon('actions.retry')} />;
  }
  if (recherches.length === 0) {
    return (
      <EmptyState
        icon={<BookmarkCheck className="size-8" aria-hidden="true" />}
        title={t('videTitre')}
        description={t('videTexte')}
        action={
          <LienLocalise href="/properties" className={buttonVariants()}>
            {t('videCta')}
          </LienLocalise>
        }
      />
    );
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {recherches.map((r) => (
          <LigneDeRecherche key={r.id} recherche={r} nouveaux={nouveaux.get(r.id)} />
        ))}
      </ul>
      <p className="pt-4 text-sm text-muted-foreground">
        {t('astuce')}{' '}
        <LienLocalise href="/app/saved-searches" className="font-medium text-foreground underline underline-offset-4">
          {t('gerer')}
        </LienLocalise>
      </p>
    </div>
  );
}

function LigneDeRecherche({
  recherche,
  nouveaux,
}: {
  readonly recherche: SavedSearch;
  readonly nouveaux: NouveauxDUneRecherche | undefined;
}) {
  const t = useTranslations('favorites.suivi.recherches');
  const tCanaux = useTranslations('search.alertChannels');
  const resume = useResumeDeCriteres();
  const { montant } = useFormatteurs();
  const marquerVue = useMarquerRechercheVue();

  const qs = requeteDesCriteres(recherche.criteria ?? {});
  const hrefRecherche = `/properties${qs ? `?${qs}` : ''}`;
  const total = nouveaux?.total ?? 0;

  /**
   * Le lien navigue de lui-même, tout de suite (même onglet ou nouvel onglet) : le marquage part à
   * côté, sans `preventDefault` ni attente — sous charge, attendre le `POST` laissait le clic sans
   * réponse visible plusieurs secondes (revue du 2026-11-09).
   */
  const ouvrir = () => marquerVue(recherche.id);
  /** Le clic du milieu ouvre un onglet ; le clic droit n'ouvre rien (le menu n'est pas un geste). */
  const ouvrirAuMilieu = (event: React.MouseEvent) => {
    if (event.button === 1) ouvrir();
  };

  const frequence = recherche.notification_frequency ?? 'off';
  const canaux = recherche.alert_channels ?? [];
  const alerte =
    frequence === 'off' || canaux.length === 0
      ? t('sansAlerte')
      : t('alerte', { frequence: t(`frequence.${frequence}`), canaux: canaux.map((c) => tCanaux(c)).join(', ') });

  return (
    <li className="py-4" data-testid="recherche-suivie" data-search-id={recherche.id}>
      <LienLocalise
        href={hrefRecherche}
        onClick={ouvrir}
        onAuxClick={ouvrirAuMilieu}
        aria-label={t('ouvrirAria', { name: recherche.name })}
        className="flex items-start gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold">{recherche.name}</p>
          <p className="truncate text-sm text-muted-foreground">{resume(recherche.criteria ?? {})}</p>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
            <Bell className="size-3.5" aria-hidden="true" />
            {alerte}
          </p>
        </div>
        {total > 0 ? (
          <span
            data-testid="compte-nouveaux"
            className="inline-flex h-7 flex-none items-center rounded-full bg-primary px-2.5 text-[0.8125rem] font-semibold tabular-nums text-primary-foreground"
          >
            {t('nouveaux', { count: total })}
          </span>
        ) : (
          <ChevronRight className="mt-1 size-5 flex-none text-muted-foreground" aria-hidden="true" />
        )}
      </LienLocalise>
      {total > 0 && nouveaux && nouveaux.biens.length > 0 ? (
        <ul className="-mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label={t('nouveauxAria', { name: recherche.name })}>
          {nouveaux.biens.map((b) => {
            const fiche = `/properties/${encodeURIComponent(b.slug)}`;
            return (
              <li key={b.id} className="w-[150px] flex-none">
                <LienLocalise href={fiche} onClick={ouvrir} onAuxClick={ouvrirAuMilieu} className="block">
                  <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-muted @container">
                    <PropertyPhoto src={b.main_photo_url} alt="" compact sizes="150px" className="object-cover" />
                  </div>
                  <p className="mt-1.5 text-sm font-semibold tabular-nums">{montant(b.price, b.currency)}</p>
                  <p className="truncate text-[0.8125rem] text-muted-foreground">{b.title}</p>
                </LienLocalise>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
