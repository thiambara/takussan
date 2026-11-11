'use client';

import { useState } from 'react';
import { Bell, BookmarkCheck, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState, ErrorState } from '@/components/feedback';
import { ReglageDAlerte } from '@/components/favorites/ReglageDAlerte';
import { useResumeDeCriteres } from '@/components/favorites/resume-de-criteres';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { requeteDesCriteres } from '@/lib/favoris-suivi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  useDeleteSavedSearchMutation,
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
  /**
   * TCK-2618 — la page rendue dans la coque de `/app` (`/app/saved-searches`) : chaque ligne porte le
   * réglage de son alerte et sa suppression, que la page `/app` d'avant portait (TCK-599, P210-03). Sur
   * le site public, ils restent derrière « Gérer mes alertes », qui mène justement là.
   */
  readonly gestion?: boolean;
}

/**
 * TCK-2508 — l'onglet « Recherches » de la page Favoris : chaque recherche sauvegardée, ce
 * qu'elle cherche, son alerte, et les biens publiés depuis sa dernière ouverture (« 3 nouveaux »,
 * avec leurs vignettes). L'ouvrir — la recherche ou l'un de ses nouveaux biens, ici ou dans un
 * nouvel onglet — la marque vue (`POST …/viewed`, en arrière-plan : la navigation n'attend pas) ;
 * au retour, le compte repart de zéro.
 *
 * Le réglage fin de l'alerte et la suppression vivent dans `/app/saved-searches` (« Gérer mes
 * alertes ») — qui rend, depuis TCK-2618, cette même page dans la coque de `/app`, `gestion` levé.
 */
export function OngletRecherches({ recherches, nouveaux, chargement, erreur, onReessayer, gestion = false }: OngletRecherchesProps) {
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
          <LigneDeRecherche key={r.id} recherche={r} nouveaux={nouveaux.get(r.id)} gestion={gestion} />
        ))}
      </ul>
      {/* Dans la coque de `/app`, « Gérer mes alertes » serait un lien vers la page même. */}
      {gestion ? null : (
        <p className="pt-4 text-sm text-muted-foreground">
          {t('astuce')}{' '}
          <LienLocalise href="/app/saved-searches" className="font-medium text-foreground underline underline-offset-4">
            {t('gerer')}
          </LienLocalise>
        </p>
      )}
    </div>
  );
}

function LigneDeRecherche({
  recherche,
  nouveaux,
  gestion,
}: {
  readonly recherche: SavedSearch;
  readonly nouveaux: NouveauxDUneRecherche | undefined;
  readonly gestion: boolean;
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
      {gestion ? <GestionDeLaRecherche recherche={recherche} /> : null}
    </li>
  );
}

/**
 * TCK-2618 — ce que `/app/saved-searches` faisait de chaque ligne (`SavedSearchesList`) : régler
 * l'alerte en place (TCK-599 — les canaux sont déjà nommés par la ligne) et supprimer la recherche,
 * le refus de l'API dit sur SA ligne, qui reste (P210-03, ADR-0019). Hors du lien de la ligne : un
 * bouton ne se pose pas dans un `<a>`.
 */
function GestionDeLaRecherche({ recherche }: { readonly recherche: SavedSearch }) {
  const t = useTranslations('search.saved');
  const suppression = useDeleteSavedSearchMutation();
  const messageErreur = useMessageErreurApi();
  const [refus, setRefus] = useState<string | null>(null);

  async function supprimer() {
    setRefus(null);
    try {
      await suppression.mutateAsync({ id: recherche.id });
    } catch (erreur) {
      setRefus(messageErreur(erreur));
    }
  }

  return (
    <div data-slot="gestion-de-la-recherche">
      <div className="flex items-start justify-between gap-3">
        <ReglageDAlerte search={recherche} canaux={false} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void supprimer()}
          disabled={suppression.isPending}
          aria-label={t('deleteAria', { name: recherche.name })}
          className="mt-3 text-muted-foreground hover:text-destructive"
        >
          {suppression.isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      {refus ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {refus}
        </p>
      ) : null}
    </div>
  );
}
