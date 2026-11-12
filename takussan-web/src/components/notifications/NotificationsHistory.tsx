'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, CheckCheck, ListChecks, Settings, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { PageHeader } from '@/components/console';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { Button, buttonVariants } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PuceDeFiltre } from '@/components/ui/puce-de-filtre';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { FAMILLES_DE_NOTIFICATION, type FamilleDeNotification, type NotificationsQuery } from '@/lib/notifications';
import { cn } from '@/lib/utils';

import { BandeauDErreur, ListeParJours, SqueletteDesNotifications, ToutEstLu, type GestesDeLaListe } from './ContenuDeLaCloche';
import { FAMILLES } from './familles';
import { useGestesDesNotifications, useHistoriqueDesNotifications } from './useNotifications';

const PER_PAGE = 20;
const PREFERENCES = '/app/profile/notifications';

type Mode = 'tout' | 'nonLues' | 'aTraiter';

/** Une famille du filtre, son icône et son compte de non-lues (« Toutes » : `famille` nulle). */
function EntreeDeFamille({
  famille,
  compte,
  active,
  onChoisir,
  className,
}: {
  readonly famille: FamilleDeNotification | null;
  readonly compte: number;
  readonly active: boolean;
  readonly onChoisir: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('nav.notifications.familles');
  const Icone = famille ? FAMILLES[famille].icone : ListChecks;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onChoisir}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring',
        active ? 'bg-foreground/7 font-medium text-foreground' : 'text-foreground',
        className,
      )}
    >
      <Icone className={cn('size-icone flex-none', active ? 'text-primary' : 'text-muted-foreground')} strokeWidth={1.5} aria-hidden="true" />
      <span className="flex-1">{t(famille ?? 'toutes')}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{compte}</span>
    </button>
  );
}

/**
 * TCK-588 — l'historique des notifications : paginé côté serveur (`page`, `per_page`), filtré côté
 * serveur, jamais sur une liste déjà récupérée.
 *
 * TCK-2634 — l'historique de la maquette retenue (`app-notifications`, écran « Historique ») :
 *  · les puces « Tout · Non lues n · À traiter n » (`filter[unread]`, `filter[a_traiter]`) et la
 *    famille (`filter[famille]`), en colonne « Familles » avec leurs comptes dès `lg`, en puce
 *    « Famille » qui ouvre une feuille en deçà ;
 *  · la liste par jours, répétitions repliées (sur la page chargée : le repli ne change ni la
 *    pagination ni les comptes), « Marquer lu » en geste secondaire ;
 *  · « Tout marquer comme lu » et « Préférences » (en-tête du téléphone, tête de page au bureau),
 *    la pagination de 20 (« 1 à 20 sur 42 · page 1 sur 3 »), le squelette et le bandeau d'erreur.
 * Les comptes sont ceux des NON LUES (`meta.counts`, filtres ignorés) : l'API n'en rend pas d'autres.
 */
export function NotificationsHistory() {
  const t = useTranslations('notifications.history');
  const tCloche = useTranslations('nav.notifications');
  const tPage = useTranslations('dashboard.pages.notifications');
  const messageErreur = useMessageErreurApi();
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState<Mode>('tout');
  const [famille, setFamille] = useState<FamilleDeNotification | null>(null);
  const [feuilleDesFamilles, setFeuilleDesFamilles] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const requete: NotificationsQuery = {
    page,
    perPage: PER_PAGE,
    unread: mode === 'nonLues',
    aTraiter: mode === 'aTraiter',
    familles: famille ? [famille] : [],
  };
  const query = useHistoriqueDesNotifications(requete);
  const gestes = useGestesDesNotifications(
    (err) => setActionError(messageErreur(err)),
    () => setActionError(null),
  );

  const notifications = query.data?.data ?? [];
  const meta = query.data?.meta;
  const unread = meta?.unread ?? 0;
  const aTraiter = meta?.counts?.a_traiter_non_lues ?? 0;
  const parFamille = meta?.counts?.par_famille ?? {};
  const lastPage = Math.max(1, meta?.last_page ?? 1);
  const total = meta?.total ?? 0;

  const choisirMode = (suivant: Mode) => {
    setMode(suivant);
    setPage(1);
  };
  const choisirFamille = (suivante: FamilleDeNotification | null) => {
    setFamille(suivante);
    setPage(1);
    setFeuilleDesFamilles(false);
  };

  const gestesDeLaListe: GestesDeLaListe = {
    ouvrir: gestes.ouvrir,
    basculer: gestes.basculer,
    lireLeRepli: gestes.lireLeRepli,
    enCours: gestes.enCours,
  };

  const resume = tCloche('resume', { nonLues: unread, aTraiter });
  /** La colonne du bureau (`h-9`) ou la feuille du téléphone (`h-11`, la cible du pouce). */
  const familles = (hauteur: string) => (
    <>
      <EntreeDeFamille famille={null} compte={unread} active={famille === null} onChoisir={() => choisirFamille(null)} className={hauteur} />
      {FAMILLES_DE_NOTIFICATION.map((f) => (
        <EntreeDeFamille key={f} famille={f} compte={parFamille[f] ?? 0} active={famille === f} onChoisir={() => choisirFamille(f)} className={hauteur} />
      ))}
    </>
  );

  return (
    // TCK-2691 — pleine largeur au téléphone (la maquette : puces collées sous l'en-tête, rangées bord à
    // bord) : chaque élément pose sa marge. Dès `md`, l'enveloppe de la coque garde la sienne.
    <PagePleineLargeur>
      {/* Au téléphone : l'en-tête de détail de la maquette (← · Notifications · ⚙ · Tout lire). */}
      <DeclarerEnTete
        forme="detail"
        repli="/app"
        droite={
          <>
            <Link
              href={PREFERENCES}
              aria-label={tCloche('preferencesLong')}
              className="inline-flex size-11 flex-none items-center justify-center rounded-full text-encre-douce outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
            >
              <Settings className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </Link>
            {unread > 0 ? (
              <button
                type="button"
                disabled={gestes.toutLireEnCours}
                onClick={gestes.toutLire}
                className="inline-flex h-11 flex-none items-center rounded-md px-2 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50"
              >
                {tCloche('markAllRead')}
              </button>
            ) : null}
          </>
        }
      />

      {/* Le titre de la page : visible dès `md`, lu seulement en deçà (l'en-tête du téléphone le porte). */}
      <div className="max-md:sr-only">
        <PageHeader
          title={tPage('title')}
          description={meta ? resume : tPage('subtitle')}
          actions={
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              <Link href={PREFERENCES} className={buttonVariants({ variant: 'outline' })}>
                <Settings className="size-4" strokeWidth={1.75} aria-hidden="true" />
                {tCloche('preferences')}
              </Link>
              <Button type="button" variant="outline" disabled={unread === 0 || gestes.toutLireEnCours} onClick={gestes.toutLire}>
                <CheckCheck className="size-4" aria-hidden="true" />
                {t('markAllRead')}
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex gap-8 md:mt-6">
        {/* La maquette : 200 px de familles et 820 px de liste au plus, à toute densité. */}
        <nav aria-label={tCloche('familles.titre')} className="hidden w-[12.5rem] flex-none lg:block">
          <p className="px-2 pb-1 text-xs text-muted-foreground">{tCloche('familles.titre')}</p>
          {familles('h-9')}
        </nav>

        <section className="min-w-0 max-w-[51.25rem] flex-1">
          <div
            role="group"
            aria-label={t('filterLabel')}
            className="sticky top-0 z-10 flex items-center gap-2 overflow-x-auto border-b border-border/70 bg-background px-4 py-2.5 md:static md:border-0 md:p-0"
          >
            <PuceDeFiltre className="md:h-8 md:px-3 md:text-ui" active={mode === 'tout'} onClick={() => choisirMode('tout')}>
              {tCloche('tout')}
            </PuceDeFiltre>
            <PuceDeFiltre className="md:h-8 md:px-3 md:text-ui" active={mode === 'nonLues'} compte={unread} onClick={() => choisirMode('nonLues')}>
              {tCloche('nonLues')}
            </PuceDeFiltre>
            <PuceDeFiltre className="md:h-8 md:px-3 md:text-ui" active={mode === 'aTraiter'} compte={aTraiter} onClick={() => choisirMode('aTraiter')}>
              {tCloche('aTraiter')}
            </PuceDeFiltre>
            <PuceDeFiltre
              className="md:h-8 md:px-3 md:text-ui lg:hidden"
              active={famille !== null}
              onClick={() => setFeuilleDesFamilles(true)}
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {famille ? tCloche(`familles.${famille}`) : tCloche('familleFiltre')}
            </PuceDeFiltre>
          </div>

          {actionError ? (
            <p role="alert" className="mt-3 px-4 text-sm text-destructive md:px-0">
              {actionError}
            </p>
          ) : null}

          <div aria-busy={query.isLoading || undefined}>
            {query.isError && !query.data ? (
              <BandeauDErreur className="mx-4 mt-5 md:mx-0" onReessayer={() => void query.refetch()} />
            ) : query.isLoading ? (
              <SqueletteDesNotifications />
            ) : notifications.length === 0 ? (
              mode === 'tout' && famille === null ? (
                <EmptyState
                  variant="nue"
                  className="py-16"
                  icon={<Bell className="size-6" strokeWidth={1.5} aria-hidden="true" />}
                  title={t('empty')}
                />
              ) : mode === 'nonLues' ? (
                <EmptyState
                  variant="nue"
                  className="py-16"
                  icon={<Bell className="size-6" strokeWidth={1.5} aria-hidden="true" />}
                  title={t('emptyUnread')}
                />
              ) : (
                <ToutEstLu aTraiter={mode === 'aTraiter' && unread > 0} />
              )
            ) : (
              <>
                <ListeParJours notifications={notifications} gestes={gestesDeLaListe} niveau="h2" page />
                <p className="px-4 py-5 text-center text-xs text-muted-foreground md:hidden">{tCloche('glisser')}</p>
              </>
            )}
          </div>

          {lastPage > 1 ? (
            <nav aria-label={t('pagination')} className="mt-5 flex items-center gap-3 px-4 pb-6 text-sm text-muted-foreground md:px-0 md:pb-0">
              <span className="flex-1 tabular-nums">
                {tCloche('plage', {
                  debut: (page - 1) * PER_PAGE + 1,
                  fin: Math.min(page * PER_PAGE, total),
                  total,
                  page,
                  last: lastPage,
                })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('previous')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= lastPage || query.isFetching}
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              >
                {t('next')}
              </Button>
            </nav>
          ) : null}
        </section>
      </div>

      <FeuilleDuBas open={feuilleDesFamilles} onOpenChange={setFeuilleDesFamilles} titre={tCloche('familles.titre')}>
        <div className="grid gap-1 py-2">{familles('h-11')}</div>
      </FeuilleDuBas>
    </PagePleineLargeur>
  );
}
