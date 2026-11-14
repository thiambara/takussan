'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, Lock, MapPin, Navigation, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { directionsUrl } from '@/components/maintenance/MaintenanceAccessKit';
import { Button, buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { estAccepte, gesteDuCreneau, journeeDuPrestataire, type GesteDuCreneau } from '@/lib/accueil/journee-du-prestataire';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { jourRelatif } from '@/lib/maintenance/mes-demandes';
import { semaineDe, type SemaineDuPrestataire } from '@/lib/maintenance/semaine-du-prestataire';
import { useAChiffrer } from '@/lib/queries/accueil-prestataire';
import { useMaintenanceRequest, useTransitionMaintenanceStatus } from '@/lib/queries/maintenance';
import { useInterventionsAAccepter, useSemaineDuPrestataire } from '@/lib/queries/maintenance-signalement';
import { cn } from '@/lib/utils';
import type { MaintenanceAccess } from '@/types/maintenance';

import { ErreurDeBloc, SqueletteDeCarte } from '../EtatsDeBloc';
import { Disque, LienTonal, TitreBloc, TitreColonne } from '../pieces';

/**
 * TCK-2625 (ADR-0096, maquette `app-accueil` a, écran « Prestataire ») — l'accueil du prestataire est
 * sa liste de travail : « Aujourd'hui », « À venir », « À chiffrer ». Ni tableau de bord ni
 * « Rapports » (spec § 2.5), ni « Explorez les biens ».
 *
 * Les lectures sont celles de « Mes interventions » (TCK-2654) — la semaine, la file `a_accepter`, la
 * fiche —, mêmes clés, même cache ; seule « À chiffrer » est neuve (`useAChiffrer`).
 *
 *  · L'adresse exacte et le téléphone du locataire viennent du SEUL bloc `access` de la fiche, que
 *    l'API n'ouvre qu'après acceptation — et la fiche n'est lue que pour un créneau ACCEPTÉ : un
 *    créneau seulement assigné ne porte que le verrou (AC5).
 *  · « Commencer » et « Terminé » naissent des drapeaux de la fiche (`gesteDuCreneau`).
 *
 * Écarts de donnée à la maquette (rien d'inventé) : le nom du locataire (non servi au prestataire),
 * « Mes devis en attente » au-delà de « À chiffrer » (le devis envoyé et son montant).
 */

/** La lecture de la journée, partagée par le résumé, les blocs et la colonne : une requête. */
function useJournee() {
  const { user } = useAuth();
  const moi = user?.id;
  const [semaine] = useState<SemaineDuPrestataire>(() => semaineDe(new Date()));
  const lue = useSemaineDuPrestataire(moi, semaine);
  return { moi, semaine, lue, journee: journeeDuPrestataire(lue.data?.data ?? [], semaine) };
}

/** « Vendredi 13 novembre · 2 interventions aujourd'hui, 3 à venir cette semaine ». */
export function ResumeDuPrestataire({ jour }: { readonly jour: string }) {
  const t = useTranslations('accueil.prestataire');
  const { lue, journee } = useJournee();
  if (!lue.isSuccess) return <>{jour}</>;
  return <>{t('resume', { jour, aujourdhui: journee.aujourdhui.length, aVenir: journee.aVenir.length })}</>;
}

/** Les blocs de gauche : la file à accepter (s'il y en a), « Aujourd'hui », puis « À venir ». */
export function JourneeDuPrestataire() {
  const t = useTranslations('accueil.prestataire');
  const tSemaine = useTranslations('maintenance.prestataire.semaine');
  const { lue, journee } = useJournee();
  const aAccepter = useInterventionsAAccepter();
  const nbAAccepter = aAccepter.data?.meta?.total ?? aAccepter.data?.data.length ?? 0;

  if (lue.isPending) {
    return (
      <div className="space-y-3 max-md:px-4" data-slot="journee-du-prestataire">
        <SqueletteDeCarte />
        <SqueletteDeCarte />
      </div>
    );
  }
  if (lue.isError) {
    return <ErreurDeBloc quoi={t('quoi')} onReessayer={() => void lue.refetch()} className="max-md:mx-4" />;
  }

  return (
    <div className="space-y-7 md:space-y-5" data-slot="journee-du-prestataire">
      {nbAAccepter > 0 ? (
        <Link
          href="/app/maintenance"
          data-slot="a-accepter"
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-primary/40 bg-secondary/60 px-4 py-2.5 outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring max-md:mx-4"
        >
          <Disque icone={Lock} />
          <span className="min-w-0 flex-1 text-corps font-semibold">{t('aAccepter', { n: nbAAccepter })}</span>
          <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        </Link>
      ) : null}

      <section aria-labelledby="prestataire-aujourdhui" className="space-y-2 md:space-y-0">
        <TitreBloc id="prestataire-aujourdhui" className="md:hidden">
          {t('aujourdhui.titre')}
        </TitreBloc>
        {journee.aujourdhui.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-3 text-ui text-muted-foreground max-md:mx-4" data-slot="aujourdhui-vide">
            {t('aujourdhui.vide')}
          </p>
        ) : (
          <>
            <ul className="space-y-3 px-4 md:hidden" data-slot="aujourdhui-telephone">
              {journee.aujourdhui.map((i, k) => (
                <li key={i.id}>
                  <CarteDuCreneau ligne={i} enTete={k === 0} />
                </li>
              ))}
            </ul>
            <section aria-label={t('aujourdhui.titre')} className="overflow-hidden rounded-xl border border-border bg-card max-md:hidden" data-slot="aujourdhui-bureau">
              <h3 className="flex h-11 items-center border-b border-border px-4 text-sm font-semibold">{t('aujourdhui.titre')}</h3>
              <ul className="divide-y divide-border">
                {journee.aujourdhui.map((i, k) => (
                  <RangeeDuCreneau key={i.id} ligne={i} enTete={k === 0} />
                ))}
              </ul>
            </section>
          </>
        )}
      </section>

      <section aria-labelledby="prestataire-a-venir" className="space-y-2" data-slot="a-venir">
        <div className="flex items-baseline justify-between max-md:pr-4">
          <TitreBloc id="prestataire-a-venir" className="md:px-0">
            {t('aVenir.titre')}
          </TitreBloc>
          <Link href="/app/maintenance" className="rounded text-ui font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
            {t('aVenir.toutes')}
          </Link>
        </div>
        {journee.aVenir.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-3 text-ui text-muted-foreground max-md:mx-4">{tSemaine('vide')}</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card max-md:mx-4">
            {journee.aVenir.map((i) => (
              <LigneAVenir key={i.id} ligne={i} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** La colonne : « À chiffrer » — les devis demandés, « Chiffrer » mène à la fiche. Rien s'il n'y en a pas. */
export function AChiffrer() {
  const t = useTranslations('accueil.prestataire.aChiffrer');
  const f = useFormatteurs();
  const { user } = useAuth();
  const lue = useAChiffrer(user?.id);
  const lignes = lue.data?.data ?? [];
  if (lue.isError) return <ErreurDeBloc quoi={t('quoi')} onReessayer={() => void lue.refetch()} className="max-md:mx-4" />;
  if (lignes.length === 0) return null;
  const jourDe = (d: Date) => f.date(d, { dateStyle: undefined, year: 'numeric', month: '2-digit', day: '2-digit' });

  return (
    <section aria-labelledby="prestataire-a-chiffrer" className="space-y-2" data-slot="a-chiffrer">
      <div className="md:hidden">
        <TitreBloc id="prestataire-a-chiffrer">{t('titre')}</TitreBloc>
      </div>
      <div className="max-md:hidden">
        <TitreColonne>{t('titre')}</TitreColonne>
      </div>
      <ul className="space-y-3 max-md:px-4">
        {lignes.map((l) => {
          const lieu = lieuDe(l);
          const depuis = l.waiting_since ?? l.created_at;
          const relatif = jourRelatif(depuis, new Date(), jourDe);
          return (
            <li key={l.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <Disque icone={FileText} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-corps font-semibold">{l.title}</p>
                <p className="truncate text-ui text-muted-foreground">
                  {t('demande', { lieu: lieu ?? '', aLieu: lieu ? 'oui' : 'non', jour: relatif, date: f.jourMois(depuis) })}
                </p>
              </div>
              <LienTonal href={`/app/maintenance/${l.id}`} className="flex-none">
                {t('chiffrer')}
              </LienTonal>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** « Appartement F2 · Grand Yoff » : le bien, et son quartier s'il n'est pas déjà dans le titre. */
function lieuDe(i: InterventionEnFile): string | null {
  const bien = i.property?.title ?? null;
  const quartier = i.property?.location?.quarter ?? null;
  return [bien, quartier && !bien?.includes(quartier) ? quartier : null].filter(Boolean).join(' · ') || null;
}

/**
 * La fiche d'un créneau ACCEPTÉ seulement (`null` sinon : aucune requête) : l'adresse, le téléphone
 * et les drapeaux des gestes y vivent.
 */
function useFicheDuCreneau(ligne: InterventionEnFile) {
  const accepte = estAccepte(ligne);
  const lue = useMaintenanceRequest(accepte ? ligne.id : null);
  const fiche = accepte && lue.data?.data?.id === ligne.id ? lue.data.data : undefined;
  return {
    accepte,
    acces: fiche?.access ?? null,
    geste: gesteDuCreneau(ligne, fiche?.abilities),
  };
}

function adresseDe(acces: MaintenanceAccess): string {
  return acces.street || [acces.quarter, acces.city].filter(Boolean).join(', ');
}

/** Le statut d'un créneau d'aujourd'hui, en clair. */
function useStatutDuCreneau(ligne: InterventionEnFile, geste: GesteDuCreneau | null) {
  const t = useTranslations('accueil.prestataire.statut');
  if (geste === 'repondre') return { label: t('aAccepter'), tone: 'attention' as const };
  if (ligne.status === 'in_progress') return { label: t('enCours'), tone: 'primary' as const };
  if (geste === 'commencer') return { label: t('aCommencer'), tone: 'primary' as const };
  return { label: t('planifiee'), tone: 'neutral' as const };
}

/** Téléphone : une carte par passage — l'heure, le titre, l'adresse et le téléphone une fois accepté, puis les gestes. */
function CarteDuCreneau({ ligne, enTete }: { readonly ligne: InterventionEnFile; readonly enTete: boolean }) {
  const t = useTranslations('maintenance.prestataire');
  const f = useFormatteurs();
  const { accepte, acces, geste } = useFicheDuCreneau(ligne);
  const lieu = lieuDe(ligne);
  const itineraire = acces ? directionsUrl(acces) : null;

  return (
    <article className="rounded-2xl border border-border bg-card p-4" data-slot="carte-du-creneau" data-accepte={accepte}>
      <div className="flex items-start gap-3">
        <span className="flex w-12 flex-none flex-col items-center rounded-lg bg-secondary py-1.5 leading-none text-primary-deep">
          <span className="text-corps font-semibold tabular-nums">{f.heure(ligne.scheduled_at)}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-corps font-semibold">
            <Link href={`/app/maintenance/${ligne.id}`} className="hover:underline">
              {ligne.title}
            </Link>
          </p>
          {acces ? (
            <>
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5 flex-none" aria-hidden="true" />
                <span className="truncate">{[adresseDe(acces), lieu].filter(Boolean).join(' · ')}</span>
              </p>
              {acces.requester_phone ? (
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                  <Phone className="size-3.5 flex-none" aria-hidden="true" />
                  <a href={`tel:${acces.requester_phone.replace(/\s+/g, '')}`} className="truncate tabular-nums hover:underline">
                    {acces.requester_phone}
                  </a>
                </p>
              ) : null}
            </>
          ) : (
            <>
              {lieu ? <p className="mt-0.5 truncate text-sm text-muted-foreground">{lieu}</p> : null}
              {!accepte ? (
                <p className="mt-1 flex items-center gap-1.5 text-ui text-encre-douce">
                  <Lock className="size-3.5 flex-none" aria-hidden="true" />
                  {t('aAccepter.verrou')}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
      {itineraire || geste ? (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          {itineraire ? (
            <a href={itineraire} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11')}>
              <Navigation className="size-4" aria-hidden="true" />
              {t('semaine.itineraire')}
            </a>
          ) : null}
          {geste ? <GesteDuCreneauVue ligne={ligne} geste={geste} plein={enTete} className={cn('h-11', !itineraire && 'col-span-2')} /> : null}
        </div>
      ) : null}
    </article>
  );
}

/** Bureau : une rangée par passage — l'heure, le titre et le lieu, le statut, « Itinéraire » et le geste. */
function RangeeDuCreneau({ ligne, enTete }: { readonly ligne: InterventionEnFile; readonly enTete: boolean }) {
  const t = useTranslations('maintenance.prestataire');
  const f = useFormatteurs();
  const { accepte, acces, geste } = useFicheDuCreneau(ligne);
  const statut = useStatutDuCreneau(ligne, geste);
  const lieu = lieuDe(ligne);
  const itineraire = acces ? directionsUrl(acces) : null;
  const detail = acces ? [lieu, adresseDe(acces), acces.requester_phone].filter(Boolean).join(' · ') : lieu;

  return (
    <li className="flex min-h-16 items-center gap-4 px-4 py-2 max-lg:flex-wrap" data-slot="rangee-du-creneau" data-accepte={accepte}>
      <span className="w-12 flex-none text-corps font-semibold tabular-nums">{f.heure(ligne.scheduled_at)}</span>
      <div className="min-w-0 flex-1 leading-tight">
        <Link href={`/app/maintenance/${ligne.id}`} className="block truncate text-sm font-semibold hover:underline">
          {ligne.title}
        </Link>
        {detail ? <p className="mt-0.5 line-clamp-2 text-ui tabular-nums text-muted-foreground">{detail}</p> : null}
        {!accepte ? (
          <p className="mt-0.5 flex items-center gap-1 text-ui text-encre-douce">
            <Lock className="size-3 flex-none" aria-hidden="true" />
            {t('aAccepter.verrou')}
          </p>
        ) : null}
      </div>
      <StatusBadge label={statut.label} tone={statut.tone} />
      {itineraire ? (
        <a href={itineraire} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2')}>
          {t('semaine.itineraire')}
        </a>
      ) : null}
      {geste ? <GesteDuCreneauVue ligne={ligne} geste={geste} plein={enTete} className="h-8 px-3 text-ui" /> : null}
    </li>
  );
}

/**
 * Le geste d'un créneau : « Commencer » passe la demande `in_progress` comme la fiche le fait
 * (`PUT …/status`) ; « Terminé » mène à la fiche, où vit le rapport de fin ; « Répondre » à la file
 * à accepter de « Mes interventions ».
 */
function GesteDuCreneauVue({
  ligne,
  geste,
  plein,
  className,
}: {
  readonly ligne: InterventionEnFile;
  readonly geste: GesteDuCreneau;
  readonly plein: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('accueil.prestataire.gestes');
  const messageErreur = useMessageErreurApi();
  const transition = useTransitionMaintenanceStatus(ligne.id);

  if (geste === 'repondre') {
    return (
      <LienTonal href="/app/maintenance" className={className}>
        {t('repondre')}
      </LienTonal>
    );
  }
  if (geste === 'terminer') {
    return (
      <LienTonal href={`/app/maintenance/${ligne.id}`} className={className}>
        {t('termine')}
      </LienTonal>
    );
  }
  return (
    <span className="contents">
      <Button
        type="button"
        variant={plein ? 'default' : 'secondary'}
        size="lg"
        className={cn('font-semibold', className)}
        disabled={transition.isPending}
        onClick={() => transition.mutate({ status: 'in_progress' })}
      >
        {t('commencer')}
      </Button>
      {transition.error ? (
        <span role="alert" className="col-span-2 basis-full text-xs text-destructive">
          {messageErreur(transition.error, t('echec'))}
        </span>
      ) : null}
    </span>
  );
}

/** « Mer. 11 nov. · 10:00 », le titre, le lieu. */
function LigneAVenir({ ligne }: { readonly ligne: InterventionEnFile }) {
  const t = useTranslations('accueil.prestataire');
  const f = useFormatteurs();
  const lieu = lieuDe(ligne);
  const quand = ligne.scheduled_at
    ? t('aVenir.quand', { date: f.date(ligne.scheduled_at, { dateStyle: undefined, weekday: 'short', day: 'numeric', month: 'short' }), heure: f.heure(ligne.scheduled_at) })
    : null;
  return (
    <li>
      <Link
        href={`/app/maintenance/${ligne.id}`}
        className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring md:h-14 md:py-0"
      >
        <span className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
          {quand ? <span className="block text-xs font-medium tabular-nums text-primary-deep first-letter:uppercase md:w-40 md:flex-none md:text-ui">{quand}</span> : null}
          <span className="block truncate text-corps font-medium md:min-w-0 md:flex-1 md:text-sm">{ligne.title}</span>
          {lieu ? <span className="block truncate text-ui text-muted-foreground md:w-72 md:flex-none">{lieu}</span> : null}
        </span>
        {!estAccepte(ligne) ? <StatusBadge label={t('statut.aAccepter')} tone="attention" className="max-md:hidden" /> : null}
        <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
