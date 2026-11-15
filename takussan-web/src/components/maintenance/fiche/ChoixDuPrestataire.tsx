'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ChevronRight, Info, Star, UserPlus } from 'lucide-react';

import { InviteServiceProviderSheet } from '@/components/service-providers/InviteServiceProviderSheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { nomAffichable } from '@/lib/identite';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { corpsDAssignation, creneauxProposes, type CleDeCreneau } from '@/lib/maintenance/fiche';
import type { InterventionEnFile } from '@/lib/maintenance/files';
import { useAssignableStaff, useUpdateMaintenanceRequest } from '@/lib/queries/maintenance';
import { nomDuCarnet, useCarnetActif, useSuggestionsDePrestataires, type PrestataireSuggere } from '@/lib/queries/maintenance-files';
import { cn } from '@/lib/utils';

/**
 * TCK-2653 — « Prestataire et créneau » (maquette « Fiche — à dispatcher ») : le geste principal de
 * « À dispatcher », et celui de « Réassigner » en retard.
 *
 *  · Les suggestions de l'API (au plus trois, métier ↔ catégorie, zone, note, interventions), puis
 *    « Voir tout le carnet » : le carnet ACTIF entier, sans filtre de métier, et l'équipe de l'agence
 *    (P120.03 — l'API accepte aussi un membre joignable). Sans suggestion, le carnet est ouvert.
 *  · « Inviter un prestataire » : la feuille d'invitation, au métier et aux zones de la demande
 *    (le lien profond assigne la demande à la fin de l'inscription).
 *  · Le créneau : « Auj. 16 h – 18 h » (avant 16 h à Dakar), « Demain 9 h – 11 h », « Demain 14 h –
 *    16 h », ou « Autre… » au sélecteur.
 *  · « Envoyer à {nom} » : `PATCH …` avec `assigned_to` (le COMPTE du prestataire, `user_id`) et
 *    `scheduled_at` — l'assignation existante (`MaintenanceRequestService::assign()`).
 */
export interface Choix {
  readonly userId: number;
  readonly nom: string;
}

export interface EtatDuChoix {
  readonly choix: Choix | null;
  readonly choisir: (c: Choix) => void;
  readonly creneau: CleDeCreneau | 'autre' | null;
  readonly setCreneau: (c: CleDeCreneau | 'autre') => void;
  readonly autre: string;
  readonly setAutre: (v: string) => void;
  readonly envoyer: () => void;
  readonly pret: boolean;
  readonly enCours: boolean;
  readonly erreur: unknown;
}

/** L'état du choix, levé dans la fiche : l'en-tête du bureau porte aussi « Envoyer à … ». */
export function useChoixDuPrestataire(request: InterventionEnFile, maintenant: Date, onEnvoye?: () => void): EtatDuChoix {
  const update = useUpdateMaintenanceRequest(request.id);
  const [choix, setChoix] = useState<Choix | null>(null);
  const [creneau, setCreneau] = useState<CleDeCreneau | 'autre' | null>(null);
  const [autre, setAutre] = useState('');
  const debut = (() => {
    if (creneau === 'autre') return autre ? new Date(autre).toISOString() : null;
    return creneauxProposes(maintenant).find((c) => c.cle === creneau)?.debut ?? null;
  })();
  return {
    choix,
    choisir: setChoix,
    creneau,
    setCreneau,
    autre,
    setAutre,
    pret: choix !== null && !update.isPending,
    enCours: update.isPending,
    erreur: update.error,
    envoyer: () => {
      if (!choix) return;
      update.mutate(corpsDAssignation(choix.userId, debut), { onSuccess: () => onEnvoye?.() });
    },
  };
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ChoixDuPrestataire({
  request,
  etat,
  maintenant,
  titre,
  titreTelephone = titre,
}: {
  readonly request: InterventionEnFile;
  readonly etat: EtatDuChoix;
  readonly maintenant: Date;
  readonly titre: string;
  /** Le titre au téléphone (maquette : « Prestataire suggéré »), sinon celui du bureau. */
  readonly titreTelephone?: string;
}) {
  const t = useTranslations('maintenance.fiche.choix');
  const tMetier = useTranslations('maintenance.category');
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
  const agencyId = request.property?.agency?.id ?? user?.agency_id ?? null;
  const suggestions = useSuggestionsDePrestataires(request.id, true);
  const liste = suggestions.data?.data ?? [];
  const sansSuggestion = suggestions.isError || (suggestions.isSuccess && liste.length === 0);
  const [carnetOuvert, setCarnetOuvert] = useState(false);
  const [invitation, setInvitation] = useState(false);
  const voirLeCarnet = carnetOuvert || sansSuggestion;

  return (
    <section data-slot="choix-du-prestataire" aria-labelledby="titre-choix" className="rounded-xl border border-border bg-card p-4 md:p-5">
      <h2 id="titre-choix" className="font-display text-lg font-semibold tracking-titre">
        <span className="md:hidden">{titreTelephone}</span>
        <span className="max-md:hidden">{titre}</span>
      </h2>
      <p className="mt-0.5 text-ui text-muted-foreground">
        {suggestions.isPending ? ' ' : sansSuggestion ? t('aucuneSuggestion', { metier: tMetier(request.category) }) : t('suggestions', { n: liste.length, metier: tMetier(request.category) })}
      </p>

      <div className="mt-4 space-y-2">
        {suggestions.isPending ? (
          <Skeleton className="h-16 rounded-xl" />
        ) : (
          liste.map((p) => <Suggestion key={p.id} p={p} choisi={etat.choix?.userId === p.user_id} onChoisir={() => p.user_id !== null && etat.choisir({ userId: p.user_id, nom: p.name ?? '' })} />)
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 text-sm font-medium text-primary-deep">
        {sansSuggestion ? (
          <span />
        ) : (
          <button type="button" aria-expanded={voirLeCarnet} onClick={() => setCarnetOuvert((o) => !o)} className="inline-flex h-11 items-center gap-1 outline-none focus-visible:ring-3 focus-visible:ring-ring">
            {t('voirLeCarnet')}
            {voirLeCarnet ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
          </button>
        )}
        {agencyId !== null ? (
          <button type="button" onClick={() => setInvitation(true)} className="inline-flex h-11 items-center gap-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring">
            <UserPlus className="size-4" aria-hidden="true" />
            {t('inviter')}
          </button>
        ) : null}
      </div>

      {voirLeCarnet ? <CarnetComplet agencyId={agencyId} etat={etat} exclus={liste.map((p) => p.user_id)} /> : null}

      <p className="mt-3 text-sm font-semibold">{t('creneau')}</p>
      <Creneaux etat={etat} maintenant={maintenant} />

      {etat.choix ? (
        <p className="mt-3 flex gap-2 text-ui leading-snug text-muted-foreground">
          <Info className="mt-0.5 size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('acceptation', { nom: etat.choix.nom })}
        </p>
      ) : null}

      <Button type="button" size="xl" className="mt-5 w-full max-md:hidden" disabled={!etat.pret} onClick={etat.envoyer}>
        {etat.choix ? t('envoyer', { nom: etat.choix.nom }) : t('choisirDAbord')}
      </Button>
      {etat.erreur ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageErreur(etat.erreur, t('echec'))}
        </p>
      ) : null}

      {agencyId !== null ? (
        <InviteServiceProviderSheet
          open={invitation}
          onOpenChange={setInvitation}
          agencyId={agencyId}
          prefilledTrades={[request.category]}
          prefilledZones={[request.property?.location?.quarter, request.property?.location?.city].filter((z): z is string => Boolean(z))}
          fromMaintenanceRequestId={request.id}
        />
      ) : null}
    </section>
  );
}

function Note({ note, interventions }: { readonly note: number | null; readonly interventions: number }) {
  const t = useTranslations('maintenance.fiche.choix');
  const f = useFormatteurs();
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-ui text-muted-foreground">
      {note !== null ? (
        <span className="inline-flex items-center gap-1 text-foreground tabular-nums">
          <Star className="size-3.5 fill-current text-primary" aria-hidden="true" />
          <span className="font-semibold">{f.nombre(note, { maximumFractionDigits: 1 })}</span>
        </span>
      ) : (
        <span className="whitespace-nowrap">{t('pasEncoreNote')}</span>
      )}
      <span className="whitespace-nowrap">· {t('interventions', { count: interventions })}</span>
    </span>
  );
}

function Suggestion({ p, choisi, onChoisir }: { readonly p: PrestataireSuggere; readonly choisi: boolean; readonly onChoisir: () => void }) {
  const t = useTranslations('maintenance.fiche.choix');
  const tMetier = useTranslations('maintenance.category');
  const nom = p.name ?? '';
  const raison = [tMetier.has(p.matching_trade as never) ? tMetier(p.matching_trade as never) : p.matching_trade, p.matching_zone ? t('couvre', { zone: p.matching_zone }) : null].filter(Boolean).join(' · ');
  return (
    <div data-slot="suggestion" data-user={p.user_id ?? ''} className={cn('flex items-center gap-3 rounded-xl border p-3', choisi ? 'border-primary bg-secondary/50' : 'border-border bg-card')}>
      <Avatar size="40">
        <AvatarFallback>{initiales(nom)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-base font-semibold">{nom}</span>
        <Note note={p.average_rating} interventions={p.completed_interventions_count} />
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{raison}</span>
      </span>
      <Button type="button" variant={choisi ? 'default' : 'outline'} aria-pressed={choisi} disabled={p.user_id === null} onClick={onChoisir} className="h-11 flex-none px-3">
        {choisi ? <Check className="size-4" aria-hidden="true" /> : null}
        {choisi ? t('choisie') : t('choisir')}
        <span className="sr-only"> {nom}</span>
      </Button>
    </div>
  );
}

/** Le carnet actif entier, puis l'équipe : un choix par ligne. Les suggestions n'y sont pas doublées. */
function CarnetComplet({ agencyId, etat, exclus }: { readonly agencyId: number | null; readonly etat: EtatDuChoix; readonly exclus: readonly (number | null)[] }) {
  const t = useTranslations('maintenance.fiche.choix');
  const carnet = useCarnetActif(agencyId);
  const equipe = useAssignableStaff(agencyId);
  const lignes = (carnet.data?.data ?? []).filter((l) => l.user_id !== null && !exclus.includes(l.user_id));
  const membres = (equipe.data?.data ?? []).filter((m) => !exclus.includes(m.id) && !lignes.some((l) => l.user_id === m.id));
  const option = (userId: number, nom: string, detail: string | null) => {
    const choisi = etat.choix?.userId === userId;
    return (
      <li key={userId}>
        <button type="button" aria-pressed={choisi} onClick={() => etat.choisir({ userId, nom })} className="flex min-h-11 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted">
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium">{nom}</span>
            {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
          </span>
          {choisi ? <Check className="size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
        </button>
      </li>
    );
  };
  return (
    <div data-slot="carnet-complet" className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-border p-1">
      {carnet.isPending ? <Skeleton className="h-10" /> : null}
      {carnet.isError ? <p className="px-2.5 py-2 text-xs text-muted-foreground">{t('carnetIndisponible')}</p> : null}
      {lignes.length > 0 ? <ul aria-label={t('carnet')}>{lignes.map((l) => option(l.user_id as number, nomDuCarnet(l), (l.service_areas ?? []).join(', ') || null))}</ul> : null}
      {membres.length > 0 ? (
        <>
          <p className="px-2.5 pt-1 text-xs font-semibold text-muted-foreground">{t('equipe')}</p>
          <ul aria-label={t('equipe')}>{membres.map((m) => option(m.id, nomAffichable(m), null))}</ul>
        </>
      ) : null}
      {carnet.isSuccess && lignes.length === 0 && membres.length === 0 ? <p className="px-2.5 py-2 text-xs text-muted-foreground">{t('carnetVide')}</p> : null}
    </div>
  );
}

function Creneaux({ etat, maintenant }: { readonly etat: EtatDuChoix; readonly maintenant: Date }) {
  const t = useTranslations('maintenance.fiche.choix.creneaux');
  const creneaux = creneauxProposes(maintenant);
  const puce = (actif: boolean) => cn('inline-flex h-11 items-center rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring', actif ? 'border-foreground bg-foreground text-background' : 'border-border bg-card');
  return (
    <>
      <div role="group" aria-label={t('label')} className="mt-2 flex flex-wrap gap-2">
        {creneaux.map((c) => (
          <button key={c.cle} type="button" aria-pressed={etat.creneau === c.cle} onClick={() => etat.setCreneau(c.cle)} className={puce(etat.creneau === c.cle)}>
            {t(c.cle)}
          </button>
        ))}
        <button type="button" aria-pressed={etat.creneau === 'autre'} onClick={() => etat.setCreneau('autre')} className={puce(etat.creneau === 'autre')}>
          {t('autre')}
        </button>
      </div>
      {etat.creneau === 'autre' ? (
        <div className="mt-2">
          <DateTimePicker id="fiche-creneau-autre" value={etat.autre} onValueChange={etat.setAutre} />
        </div>
      ) : null}
    </>
  );
}
