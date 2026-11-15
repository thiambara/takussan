'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { BellOff, CheckCheck, RotateCcw, Settings, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { PuceDeFiltre } from '@/components/ui/puce-de-filtre';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import type { AppNotification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

import { LigneRepliee } from './LigneRepliee';
import { NotificationRow } from './NotificationRow';
import { grouperParJour, replier, type ElementDeLaListe } from './regroupement';
import { useGestesDesNotifications, useNotificationsDeLaCloche } from './useNotifications';

/** Les gestes qu'une liste passe à ses lignes. */
export interface GestesDeLaListe {
  readonly ouvrir: (n: AppNotification) => void;
  readonly basculer: (n: AppNotification) => void;
  readonly lireLeRepli: (lignes: readonly AppNotification[]) => void;
  readonly enCours: boolean;
}

/** Le verbe d'une seule ligne est plein : la première ligne à traiter qui mène quelque part. */
function premiereATraiter(elements: readonly ElementDeLaListe[]): number | null {
  for (const element of elements) {
    const n = element.type === 'seule' ? element.notification : null;
    if (n && n.a_traiter && n.code && n.target?.path) return n.id;
  }
  return null;
}

/**
 * TCK-2634 — la liste de la maquette : les répétitions repliées (sur les lignes CHARGÉES), puis rangées
 * par jour (« Aujourd'hui », « Hier », « Cette semaine », « Plus ancien »). Partagée par la cloche et
 * l'historique ; `page` pose les groupes du bureau en cartes bordées (`JourBureau` de la maquette).
 */
export function ListeParJours({
  notifications,
  gestes,
  niveau,
  page = false,
}: {
  readonly notifications: readonly AppNotification[];
  readonly gestes: GestesDeLaListe;
  readonly niveau: 'h2' | 'h3';
  readonly page?: boolean;
}) {
  const t = useTranslations('nav.notifications.jours');
  const maintenant = useMinuteCourante();
  const elements = replier(notifications);
  const groupes = grouperParJour(elements, maintenant);
  // Sur les lignes RENDUES : une ligne à traiter repliée (lue) n'a pas de verbe visible.
  const principal = premiereATraiter(elements);
  const Titre = niveau;

  return (
    <>
      {groupes.map((groupe) => (
        <section key={`${groupe.jour}-${groupe.elements.length}`} data-jour={groupe.jour} className={cn(page && 'md:mt-5')}>
          <Titre
            data-slot="titre-de-jour"
            className={cn('bg-background px-4 pt-4 pb-1.5 text-xs font-medium text-muted-foreground', page && 'md:bg-transparent md:px-0 md:pt-0')}
          >
            {t(groupe.jour)}
          </Titre>
          <ul className={cn('divide-y divide-border/70 border-y border-border/70', page && 'md:overflow-hidden md:rounded-xl md:border md:border-border')}>
            {groupe.elements.map((element) =>
              element.type === 'seule' ? (
                <NotificationRow
                  key={element.notification.id}
                  notification={element.notification}
                  variant={page ? 'page' : 'bell'}
                  pending={gestes.enCours}
                  maintenant={maintenant}
                  verbePrincipal={element.notification.id === principal}
                  onOpen={gestes.ouvrir}
                  onToggleRead={gestes.basculer}
                />
              ) : (
                <LigneRepliee
                  key={`${element.cle}-${element.lignes[0].id}`}
                  lignes={element.lignes}
                  pending={gestes.enCours}
                  maintenant={maintenant}
                  onOpen={gestes.ouvrir}
                  onToggleRead={gestes.basculer}
                  onLireTout={gestes.lireLeRepli}
                />
              ),
            )}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Le squelette d'une liste de notifications (maquette « Chargement et erreur »). */
export function SqueletteDesNotifications() {
  return (
    <div className="divide-y divide-border/70" aria-hidden="true" data-slot="squelette-des-notifications">
      {[70, 55, 82, 60, 74, 50].map((largeur) => (
        <div key={largeur} className="flex items-center gap-3 px-4 py-3.5">
          <span className="size-9 flex-none animate-pulse rounded-full bg-muted" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 animate-pulse rounded bg-muted" style={{ width: `${largeur}%` }} />
            <span className="block h-3 w-2/5 animate-pulse rounded bg-muted" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** « Impossible de charger les notifications · Réessayer » : le bandeau de la maquette. */
export function BandeauDErreur({ onReessayer, className }: { readonly onReessayer: () => void; readonly className?: string }) {
  const t = useTranslations('nav.notifications');
  return (
    <div
      role="alert"
      className={cn('flex items-center gap-3 rounded-xl border border-bord-danger bg-destructive/6 px-4 py-3 text-sm', className)}
    >
      <TriangleAlert className="size-5 flex-none text-destructive" strokeWidth={1.75} aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{t('erreur.titre')}</span> {t('erreur.texte')}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onReessayer}>
        <RotateCcw aria-hidden="true" />
        {t('reessayer')}
      </Button>
    </div>
  );
}

/**
 * « Vous êtes à jour » : l'état positif de la maquette, sans grand vide. Sous la puce « À traiter »
 * quand des non lues restent, « Rien à traiter » : aucune n'attend de geste, mais tout n'est pas lu
 * (sans non lue, « Vous êtes à jour », comme l'écran « Tout lu » de la maquette, puce « À traiter 0 »).
 */
export function ToutEstLu({ className, aTraiter = false }: { readonly className?: string; readonly aTraiter?: boolean }) {
  const t = useTranslations('nav.notifications');
  return (
    <EmptyState
      variant="nue"
      className={cn('py-16', className)}
      icon={<BellOff className="size-6" strokeWidth={1.5} aria-hidden="true" />}
      title={aTraiter ? t('rienATraiter') : t('aJour.titre')}
      description={t('aJour.texte')}
    />
  );
}

interface ContenuDeLaClocheProps {
  /** `feuille` : le téléphone (pleine hauteur, ✕) ; `panneau` : le bureau (400 px, « Tout lire » en bouton). */
  readonly surface: 'feuille' | 'panneau';
  /** Ferme la surface ; `parNavigation` quand une ligne ou un lien du pied vient d'être suivi. */
  readonly onFermer: (parNavigation: boolean) => void;
  /** Le bouton ✕ de la feuille. */
  readonly fermer?: ReactNode;
}

/**
 * TCK-2634 — ce que la cloche montre, sur le téléphone (feuille) comme au bureau (panneau) : l'en-tête
 * (« Notifications », « N non lues · N à traiter », « Tout lire »), les puces « À traiter · Tout »
 * (`filter[a_traiter]=1`, côté serveur), la liste par jours, et le pied (« Tout l'historique »,
 * « Préférences »). La pastille de la cloche lit le même cache.
 */
export function ContenuDeLaCloche({ surface, onFermer, fermer }: ContenuDeLaClocheProps) {
  const t = useTranslations('nav.notifications');
  const [aTraiter, setATraiter] = useState(false);
  const [erreurDeGeste, setErreurDeGeste] = useState<string | null>(null);
  const query = useNotificationsDeLaCloche(aTraiter);
  // Les comptes (`meta`, filtres ignorés par l'API) : ceux de la liste, sinon ceux de « Tout » — la
  // requête de la pastille, déjà en cache — pendant que « À traiter » charge.
  const tout = useNotificationsDeLaCloche(false);
  const gestes = useGestesDesNotifications(
    setErreurDeGeste,
    () => setErreurDeGeste(null),
  );

  const notifications = query.data?.data ?? [];
  const meta = query.data?.meta ?? tout.data?.meta;
  const nonLues = meta?.unread ?? 0;
  const aTraiterNonLues = meta?.counts?.a_traiter_non_lues ?? 0;
  const feuille = surface === 'feuille';

  const gestesDeLaListe: GestesDeLaListe = {
    ouvrir: (n) => {
      // TCK-588 — ouvrir une notification la marque lue, et ferme la cloche.
      gestes.ouvrir(n);
      onFermer(true);
    },
    basculer: gestes.basculer,
    lireLeRepli: gestes.lireLeRepli,
    enCours: gestes.enCours,
  };

  return (
    <>
      <div
        className={cn(
          'flex flex-none items-center',
          // La maquette : « Tout lire » et ✕ côte à côte dans la feuille, `gap-2` dans le panneau.
          feuille ? 'min-h-12 py-1 pr-1 pl-4' : 'gap-2 px-4 pt-3.5 pb-2.5',
        )}
      >
        <div className="min-w-0 flex-1 leading-tight">
          {/* TCK-1035 (P68.08) — un titre, pas un `<header>` : rendu en portail sous `body`, il ferait un
              second repère `banner`. */}
          <h2 className="truncate text-titre-court font-semibold">{t('label')}</h2>
          <p className="truncate text-ui text-muted-foreground">
            {feuille ? t('unread', { count: nonLues }) : t('resume', { nonLues, aTraiter: aTraiterNonLues })}
          </p>
        </div>
        {nonLues > 0 ? (
          feuille ? (
            <button
              type="button"
              disabled={gestes.toutLireEnCours}
              onClick={gestes.toutLire}
              className="inline-flex h-11 items-center rounded-md px-2 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
            >
              {t('markAllRead')}
            </button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={gestes.toutLireEnCours} onClick={gestes.toutLire}>
              <CheckCheck className="size-4" aria-hidden="true" />
              {t('markAllRead')}
            </Button>
          )
        ) : null}
        {fermer}
      </div>

      <div role="group" aria-label={t('puces')} className={cn('flex flex-none items-center gap-2 px-4', feuille ? 'pb-2.5' : 'pb-3')}>
        <PuceDeFiltre
          taille={feuille ? 'default' : 'sm'}
          active={aTraiter}
          compte={aTraiterNonLues}
          onClick={() => setATraiter(true)}
        >
          {t('aTraiter')}
        </PuceDeFiltre>
        <PuceDeFiltre taille={feuille ? 'default' : 'sm'} active={!aTraiter} onClick={() => setATraiter(false)}>
          {t('tout')}
        </PuceDeFiltre>
      </div>

      {erreurDeGeste ? (
        <p role="alert" className="flex-none px-4 pb-2 text-sm text-destructive">
          {erreurDeGeste}
        </p>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border/70"
        data-slot="liste-de-la-cloche"
        aria-busy={query.isLoading || undefined}
      >
        {query.isError && !query.data ? (
          <BandeauDErreur className="m-4" onReessayer={() => void query.refetch()} />
        ) : query.isLoading ? (
          <SqueletteDesNotifications />
        ) : notifications.length === 0 ? (
          <ToutEstLu aTraiter={aTraiter && nonLues > 0} />
        ) : (
          <ListeParJours notifications={notifications} gestes={gestesDeLaListe} niveau="h3" />
        )}
      </div>

      <div
        className={cn(
          'flex flex-none items-center border-t border-border px-4 text-sm font-medium',
          feuille ? 'min-h-12 pb-[env(safe-area-inset-bottom)]' : 'h-12',
        )}
      >
        <Link
          href="/app/notifications"
          onClick={() => onFermer(true)}
          className="flex min-h-11 flex-1 items-center rounded-md text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {t('historique')}
        </Link>
        <Link
          href="/app/profile/notifications"
          onClick={() => onFermer(true)}
          aria-label={t('preferencesLong')}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-encre-douce outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <Settings className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('preferences')}
        </Link>
      </div>
    </>
  );
}
