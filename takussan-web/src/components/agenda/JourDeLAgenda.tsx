'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { GesteItineraire, GestesDuVisiteur } from '@/components/visits/par-le-temps/pieces';
import { heureDeMinutes, journeeDeLAgenda, minutesADakar, occupationDuJour, estEnAttente, pointsDuJour, type Minute } from '@/lib/agenda/agenda';
import { semaineDe } from '@/lib/journee/journee';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';
import type { PropertyVisit } from '@/types/visit';
import { paletteForType } from '@/components/calendar/event-colors';
import { useDatesDeLAgenda } from './dates';
import { CreneauLibre, HACHURE, LienOccupation, TitreJour, TypeMot } from './pieces';

/** Le titre d'un événement : « Local commercial · Dakar-Plateau » (le quartier, s'il n'y est pas déjà). */
export function titreDeLEvenement(e: CalendarEvent): string {
  const quartier = e.neighborhood?.trim();
  return quartier && !e.title.toLocaleLowerCase().includes(quartier.toLocaleLowerCase()) ? `${e.title} · ${quartier}` : e.title;
}

/** La ligne de dessous : l'adresse et le visiteur d'une visite, la référence d'un bail. */
export function sousTitreDeLEvenement(e: CalendarEvent): string | null {
  if (e.type === 'visit') return [e.address_line?.trim(), e.visitor_name?.trim()].filter(Boolean).join(' · ') || null;
  return e.reference ?? null;
}

interface CarteProps {
  readonly e: CalendarEvent;
  readonly visite: PropertyVisit | undefined;
  readonly gestes: boolean;
  readonly ouvert: boolean;
  readonly onOuvrir: (e: CalendarEvent) => void;
}

/** Un événement du jour : l'heure à gauche, la carte à droite ; toute la carte ouvre la fiche. */
function CarteDuJour({ e, visite, gestes, ouvert, onOuvrir }: CarteProps) {
  const t = useTranslations('agenda.jour');
  const titre = titreDeLEvenement(e);
  const sous = sousTitreDeLEvenement(e);
  const nom = e.visitor_name?.trim() || t('visiteur');
  return (
    <div
      data-testid={`calendar-event-row-${e.type}-${e.id}`}
      className={cn('relative mb-3 min-w-0 flex-1 rounded-xl border p-3.5', estEnAttente(e) ? HACHURE : 'border-border bg-card', ouvert && 'ring-2 ring-primary/50')}
    >
      <TypeMot evenement={e} />
      <button
        type="button"
        onClick={() => onOuvrir(e)}
        className="mt-1 block w-full text-left text-corps font-semibold leading-snug outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-3 focus-visible:after:ring-ring"
      >
        {titre}
      </button>
      {sous ? <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{sous}</p> : null}
      {gestes && visite ? (
        <div className="relative z-10 mt-3 flex gap-2">
          <GesteItineraire v={visite} className="flex-1" />
          <GestesDuVisiteur v={visite} nom={nom} bien={e.title} />
        </div>
      ) : null}
    </div>
  );
}

function Ligne({ heure, sous, children }: { readonly heure: string; readonly sous?: string | null; readonly children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4">
      <div className="w-13 flex-none pt-3.5">
        <p className="font-display text-lg font-semibold leading-none tabular-nums">{heure}</p>
        {sous ? <p className="mt-1.5 text-xs text-muted-foreground">{sous}</p> : null}
      </div>
      {children}
    </li>
  );
}

/** La bande de sept jours du téléphone : le jour choisi en disque plein, un point par événement. */
export function BandeDeLaSemaine({
  jour,
  aujourdhui,
  evenements,
  onChoisir,
}: {
  readonly jour: string;
  readonly aujourdhui: string;
  readonly evenements: readonly CalendarEvent[];
  readonly onChoisir: (jour: string) => void;
}) {
  const t = useTranslations('agenda.jour');
  const d = useDatesDeLAgenda();
  return (
    <div role="group" aria-label={t('semaine')} data-slot="bande-de-la-semaine" className="grid grid-cols-7 border-b border-border px-2 pb-1.5 pt-1">
      {semaineDe(jour).map((j) => {
        const actif = j === jour;
        const points = pointsDuJour(evenements, j);
        return (
          <button
            key={j}
            type="button"
            aria-pressed={actif}
            aria-label={t('jourEtCompte', { jour: d.long(j), n: points.length })}
            onClick={() => onChoisir(j)}
            className="flex flex-col items-center gap-0.5 rounded-lg py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <span className="text-legende font-medium text-muted-foreground" aria-hidden="true">
              {d.initiale(j)}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-10 items-center justify-center rounded-full text-corps font-semibold tabular-nums',
                actif ? 'bg-foreground text-background' : j === aujourdhui ? 'text-primary-deep' : 'text-foreground',
              )}
            >
              {Number(j.slice(8, 10))}
            </span>
            <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
              {points.map((type, i) => (
                <span key={i} className={cn('size-1.5 rounded-full', paletteForType(type).accent)} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface JourDeLAgendaProps {
  readonly jour: string;
  readonly aujourdhui: string;
  /** Les événements de la fenêtre lue (la semaine du jour) : la liste ne garde que ceux du jour. */
  readonly evenements: readonly CalendarEvent[];
  /** Les visites du jour, par identifiant : le téléphone et l'adresse des gestes. */
  readonly visites: ReadonlyMap<number, PropertyVisit>;
  /** Les séjours du jour, quand « Mon agenda » ne les demande pas (l'agent) : le compte replié. */
  readonly sejoursDuJour: readonly CalendarEvent[] | null;
  readonly ouvert: CalendarEvent | null;
  readonly onOuvrir: (e: CalendarEvent) => void;
  readonly onPlanifier: (jour: string, heure: string | null) => void;
  readonly onOccupation: (() => void) | null;
  /** Sous le mois du téléphone : les séjours en cours en tête de la journée, le compte seul. */
  readonly occupationEnHaut?: boolean;
}

/**
 * « Mon agenda — jour » : les journées entières en tête, puis ce qui a une heure — Itinéraire,
 * Appeler et WhatsApp pour une visite à venir —, le temps libre d'au moins une heure (« Libre de
 * 11:30 à 16:55 · Planifier »), et en bas, repliés, les séjours en cours.
 */
export function JourDeLAgenda({ jour, aujourdhui, evenements, visites, sejoursDuJour, ouvert, onOuvrir, onPlanifier, onOccupation, occupationEnHaut = false }: JourDeLAgendaProps) {
  const t = useTranslations('agenda.jour');
  const d = useDatesDeLAgenda();
  const journee = journeeDeLAgenda(evenements, jour);
  const sejours = sejoursDuJour ?? journee.sejours;
  const occupation = occupationDuJour(sejours, jour);
  const gestes = jour >= aujourdhui;
  const vide = journee.sansHeure.length === 0 && journee.lignes.length === 0;
  const carte = (e: CalendarEvent) => <CarteDuJour e={e} visite={e.type === 'visit' ? visites.get(e.id) : undefined} gestes={gestes} ouvert={ouvert?.type === e.type && ouvert.id === e.id} onOuvrir={onOuvrir} />;
  const duree = (m: Minute) => (m.evenement.type === 'visit' && m.fin > m.debut ? t('duree', { n: m.fin - m.debut }) : null);

  return (
    <section data-slot="jour-de-l-agenda" aria-label={d.long(jour)}>
      <TitreJour aujourdhui={jour === aujourdhui}>{d.long(jour)}</TitreJour>
      {onOccupation && occupationEnHaut ? (
        <div className="px-4 pb-4">
          <LienOccupation enCours={occupation.enCours} arrivees={occupation.arrivees} departs={occupation.departs} court haut onClick={onOccupation} />
        </div>
      ) : null}
      <ul>
        {journee.sansHeure.map((e) => (
          <Ligne key={`${e.type}-${e.id}`} heure={t('journee')}>
            {carte(e)}
          </Ligne>
        ))}
        {journee.lignes.map((l) =>
          l.genre === 'libre' ? (
            <CreneauLibre
              key={`libre-${l.libre.de}`}
              texte={t('libreDe', { de: heureDeMinutes(l.libre.de), a: heureDeMinutes(l.libre.a) })}
              libelle={t('planifierA', { heure: heureDeMinutes(l.libre.de) })}
              onPlanifier={() => onPlanifier(jour, heureDeMinutes(l.libre.de))}
            />
          ) : (
            <Ligne key={`${l.m.evenement.type}-${l.m.evenement.id}`} heure={heureDeMinutes(minutesADakar(l.m.evenement.start))} sous={duree(l.m)}>
              {carte(l.m.evenement)}
            </Ligne>
          ),
        )}
        {vide ? <CreneauLibre texte={t('rien')} libelle={t('planifierLe', { jour: d.long(jour) })} onPlanifier={() => onPlanifier(jour, null)} /> : null}
      </ul>
      {onOccupation && !occupationEnHaut ? (
        <div className="px-4 pb-6 pt-1">
          <LienOccupation enCours={occupation.enCours} arrivees={occupation.arrivees} departs={occupation.departs} onClick={onOccupation} />
        </div>
      ) : null}
    </section>
  );
}
