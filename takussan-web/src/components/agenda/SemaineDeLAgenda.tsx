'use client';

import { Navigation } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { GestesDuVisiteur, lienItineraire } from '@/components/visits/par-le-temps/pieces';
import { estEnAttente, heureDeMinutes, journeeDeLAgenda, minutesADakar, occupationDuJour, semaineDeLAgenda, type Bloc } from '@/lib/agenda/agenda';
import { heureMuraleADakar } from '@/lib/visites/heure-de-dakar';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';
import type { PropertyVisit } from '@/types/visit';
import { paletteFor, paletteForType } from '@/components/calendar/event-colors';
import { useDatesDeLAgenda } from './dates';
import { sousTitreDeLEvenement, titreDeLEvenement } from './JourDeLAgenda';
import { HACHURE, LienOccupation, TypeMot, traitsDeFond } from './pieces';

/** Une heure de la grille : 44 px (11 pas), 39,6 au bureau dense. */
const HEURE = 'calc(var(--spacing) * 11)';
const enHeures = (n: number) => `calc(${HEURE} * ${n})`;
const COLONNES = 'grid grid-cols-[calc(var(--spacing)*13)_repeat(7,minmax(0,1fr))] max-lg:min-w-160';
const LIGNES = { backgroundImage: traitsDeFond('bottom'), backgroundSize: `100% ${HEURE}` };

function BlocDeLaSemaine({ b, de, ouvert, onOuvrir }: { readonly b: Bloc; readonly de: number; readonly ouvert: boolean; readonly onOuvrir: (e: CalendarEvent) => void }) {
  const t = useTranslations('agenda');
  const e = b.evenement;
  const attente = estEnAttente(e);
  return (
    <button
      type="button"
      data-testid={`calendar-event-pill-${e.type}-${e.id}`}
      onClick={() => onOuvrir(e)}
      className={cn(
        'absolute z-10 overflow-hidden rounded-md border px-1.5 py-1 text-left text-legende leading-tight outline-none focus-visible:ring-3 focus-visible:ring-ring',
        attente ? HACHURE : paletteForType(e.type).pill,
        ouvert && 'ring-2 ring-primary',
      )}
      style={{
        top: `calc(${enHeures((b.debut - de * 60) / 60)} + 1px)`,
        height: `max(calc(var(--spacing) * 10), calc(${enHeures((b.fin - b.debut) / 60)} - 2px))`,
        left: `calc(${(b.piste / b.pistes) * 100}% + var(--spacing))`,
        width: `calc(${100 / b.pistes}% - var(--spacing) * 2)`,
      }}
    >
      <span className="flex items-center gap-1 font-semibold tabular-nums">
        <span className={cn('size-1.5 flex-none rounded-full', attente ? 'border border-foreground/50' : paletteFor(e).accent)} aria-hidden="true" />
        <span className="truncate">
          {heureDeMinutes(b.debut)} · {t(`types.${e.type === 'lease_event' ? (e.kind === 'renewal' ? 'lease_renewal' : 'lease_end') : e.type}`)}
        </span>
      </span>
      <span className="block truncate text-encre-douce">{e.title}</span>
    </button>
  );
}

/** Un créneau d'une heure : vide, il ouvre « Planifier une visite » à ce jour et à cette heure. */
function Creneau({ jour, heure, de, libelle, onPlanifier }: { readonly jour: string; readonly heure: number; readonly de: number; readonly libelle: string; readonly onPlanifier: (jour: string, heure: string) => void }) {
  const t = useTranslations('agenda.jour');
  const hh = `${String(heure).padStart(2, '0')}:00`;
  return (
    <button
      type="button"
      aria-label={libelle}
      data-testid={`agenda-creneau-${jour}-${hh}`}
      onClick={() => onPlanifier(jour, hh)}
      className="group absolute inset-x-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring"
      style={{ top: `calc(${enHeures(heure - de)} + 1px)`, height: `calc(${HEURE} - 2px)` }}
    >
      <span className="hidden h-full flex-col justify-center rounded-md border border-dashed border-primary bg-card px-1.5 text-left text-legende leading-tight text-primary-deep group-hover:flex group-focus-visible:flex">
        <span className="font-semibold tabular-nums">{hh}</span>
        <span className="truncate">+ {t('planifierCourt')}</span>
      </span>
    </button>
  );
}

function EvtCompact({ e, visite, onOuvrir }: { readonly e: CalendarEvent; readonly visite: PropertyVisit | undefined; readonly onOuvrir: (e: CalendarEvent) => void }) {
  const t = useTranslations('agenda.jour');
  const tV = useTranslations('visits.parLeTemps');
  const sous = sousTitreDeLEvenement(e);
  const itineraire = visite ? lienItineraire(visite) : null;
  return (
    <li className="relative px-4 py-3">
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-corps font-semibold tabular-nums">{e.all_day ? t('journee') : heureDeMinutes(minutesADakar(e.start))}</span>
        <TypeMot evenement={e} />
      </div>
      <button type="button" onClick={() => onOuvrir(e)} className="mt-1 block w-full text-left text-sm font-medium leading-snug outline-none after:absolute after:inset-0 focus-visible:after:ring-3 focus-visible:after:ring-ring">
        {titreDeLEvenement(e)}
      </button>
      {sous ? <p className="text-ui leading-snug text-muted-foreground">{sous}</p> : null}
      {visite ? (
        <div className="relative z-10 mt-2.5 flex items-center gap-2 [&_a[data-slot^=geste-]]:size-8">
          {itineraire ? (
            <a
              href={itineraire}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
            >
              <Navigation className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              {tV('itineraire')}
            </a>
          ) : null}
          <GestesDuVisiteur v={visite} nom={e.visitor_name?.trim() || t('visiteur')} bien={e.title} />
        </div>
      ) : null}
    </li>
  );
}

export interface SemaineDeLAgendaProps {
  readonly jour: string;
  readonly aujourdhui: string;
  readonly maintenant: Date;
  readonly evenements: readonly CalendarEvent[];
  readonly visites: ReadonlyMap<number, PropertyVisit>;
  readonly sejoursDuJour: readonly CalendarEvent[] | null;
  readonly ouvert: CalendarEvent | null;
  readonly onOuvrir: (e: CalendarEvent) => void;
  readonly onChoisirJour: (jour: string) => void;
  readonly onPlanifier: (jour: string, heure: string | null) => void;
  readonly onOccupation: (() => void) | null;
}

/**
 * « Mon agenda — semaine » (bureau) : 8 h → 20 h (élargi à ce qui en sort), visites et tâches en
 * blocs à l'heure de Dakar, la ligne « maintenant » ; un créneau vide ouvre la planification à son
 * jour et à son heure. À droite (dès 1440), le jour choisi et le lien replié vers l'occupation ;
 * dessous en deux colonnes plus étroit. Sous `lg`, la grille garde 640 px et défile dans sa carte.
 */
export function SemaineDeLAgenda({ jour, aujourdhui, maintenant, evenements, visites, sejoursDuJour, ouvert, onOuvrir, onChoisirJour, onPlanifier, onOccupation }: SemaineDeLAgendaProps) {
  const t = useTranslations('agenda');
  const d = useDatesDeLAgenda();
  const s = semaineDeLAgenda(evenements, jour);
  const heures = Array.from({ length: s.a - s.de }, (_, i) => s.de + i);
  const minutesMaintenant = (() => {
    const murale = heureMuraleADakar(maintenant);
    const m = Number(murale.slice(11, 13)) * 60 + Number(murale.slice(14, 16));
    return m / 60 >= s.de && m / 60 <= s.a ? m : null;
  })();
  const journee = journeeDeLAgenda(evenements, jour);
  const duJour = [...journee.sansHeure, ...journee.lignes.flatMap((l) => (l.genre === 'evenement' ? [l.m.evenement] : []))];
  const sejours = sejoursDuJour ?? journee.sejours;
  const occupation = occupationDuJour(sejours, jour);

  return (
    <div data-slot="semaine-de-l-agenda" className="grid grid-cols-1 items-start gap-5 min-[90rem]:grid-cols-[minmax(0,1fr)_calc(var(--spacing)*72)]">
      <div aria-label={t('vues.semaineAria')} role="group" className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className={cn(COLONNES, 'border-b border-border')}>
          <span />
          {s.jours.map((j) => (
            <button
              key={j}
              type="button"
              aria-pressed={j === jour}
              onClick={() => onChoisirJour(j)}
              className={cn(
                'border-l border-border px-2 py-2 text-left text-ui outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring',
                j === aujourdhui ? 'bg-primary/5 font-semibold text-primary-deep' : 'text-encre-douce',
                j === jour && 'underline decoration-2 underline-offset-4',
              )}
            >
              {d.nomCourt(j)} <span className="tabular-nums">{Number(j.slice(8, 10))}</span>
            </button>
          ))}
        </div>
        <div className={cn(COLONNES, 'border-b border-border')}>
          <span className="px-2 py-1.5 text-legende leading-tight text-muted-foreground">{t('jour.sansHeure')}</span>
          {s.jours.map((j) => {
            const liste = s.sansHeure[j] ?? [];
            return (
              <span key={j} className={cn('flex min-h-8 min-w-0 flex-col gap-0.5 border-l border-border p-1', j === aujourdhui && 'bg-primary/5')}>
                {liste.slice(0, 2).map((e) => (
                  <button
                    key={`${e.type}-${e.id}`}
                    type="button"
                    data-testid={`calendar-event-pill-${e.type}-${e.id}`}
                    onClick={() => onOuvrir(e)}
                    className={cn('flex min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 text-left text-legende leading-tight outline-none focus-visible:ring-3 focus-visible:ring-ring', estEnAttente(e) ? HACHURE : paletteForType(e.type).pill)}
                  >
                    <span className={cn('size-1.5 flex-none rounded-full', paletteFor(e).accent)} aria-hidden="true" />
                    <span className="truncate">{e.title}</span>
                  </button>
                ))}
                {liste.length > 2 ? (
                  <button type="button" onClick={() => onChoisirJour(j)} className="px-1 text-left text-legende font-medium text-primary-deep outline-none focus-visible:ring-3 focus-visible:ring-ring">
                    {t('jour.enPlus', { n: liste.length - 2 })}
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
        <div className={COLONNES}>
          <div>
            {heures.map((h) => (
              <span key={h} className="block pr-2 text-right text-legende tabular-nums text-muted-foreground" style={{ height: HEURE }}>
                {t('jour.heure', { h })}
              </span>
            ))}
          </div>
          {s.jours.map((j) => (
            <div key={j} className={cn('relative border-l border-border', j === aujourdhui && 'bg-primary/5')} style={{ height: enHeures(heures.length), ...LIGNES }}>
              {heures.map((h) => (
                <Creneau key={h} jour={j} heure={h} de={s.de} libelle={t('jour.planifierCreneau', { jour: d.long(j), heure: `${String(h).padStart(2, '0')}:00` })} onPlanifier={onPlanifier} />
              ))}
              {s.blocs
                .filter((b) => b.jour === j)
                .map((b) => (
                  <BlocDeLaSemaine key={`${b.evenement.type}-${b.evenement.id}`} b={b} de={s.de} ouvert={ouvert?.type === b.evenement.type && ouvert.id === b.evenement.id} onOuvrir={onOuvrir} />
                ))}
              {j === aujourdhui && minutesMaintenant !== null ? (
                <span data-slot="maintenant" aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: enHeures((minutesMaintenant - s.de * 60) / 60) }}>
                  <span className="-ml-1 size-2 rounded-full bg-destructive" />
                  <span className="h-px flex-1 bg-destructive" />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 items-start gap-4 max-lg:grid-cols-1 min-[90rem]:block min-[90rem]:space-y-4">
        <section aria-label={d.long(jour)} className="rounded-xl border border-border bg-card" data-testid="calendar-selected-day">
          <h3 className="border-b border-border px-4 py-3 font-display text-corps font-semibold tracking-titre">{d.long(jour)}</h3>
          {duJour.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">{t('jour.rien')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {duJour.map((e) => (
                <EvtCompact key={`${e.type}-${e.id}`} e={e} visite={e.type === 'visit' && jour >= aujourdhui ? visites.get(e.id) : undefined} onOuvrir={onOuvrir} />
              ))}
            </ul>
          )}
        </section>
        {onOccupation ? <LienOccupation enCours={occupation.enCours} arrivees={occupation.arrivees} departs={occupation.departs} onClick={onOccupation} /> : null}
      </div>
    </div>
  );
}
