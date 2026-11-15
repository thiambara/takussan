'use client';

import { useTranslations } from 'next-intl';

import { paletteFor, paletteForType } from '@/components/calendar/event-colors';
import { estEnAttente, estSansHeure, heureDeMinutes, jourDeLEvenement, lundiDe, minutesADakar } from '@/lib/agenda/agenda';
import { barresDeLaRangee, joursEntre } from '@/lib/agenda/occupation';
import { decalerJour } from '@/lib/jour-de-l-api';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';
import { useDatesDeLAgenda } from './dates';
import { HACHURE, cleDuType } from './pieces';

/** Deux pistes de séjours par semaine, puis « +N séjours ». */
const PISTES_DE_SEJOURS = 2;
/** Deux puces par jour, puis « +N ». */
const PUCES_PAR_JOUR = 2;

/** Les semaines (lundi → dimanche) qui couvrent le mois de `jour`. */
export function semainesDuMois(jour: string): readonly (readonly string[])[] {
  const premier = `${jour.slice(0, 8)}01`;
  const dernier = decalerJour(`${decalerJour(premier, 32).slice(0, 8)}01`, -1);
  const semaines: string[][] = [];
  for (let lundi = lundiDe(premier); lundi <= dernier; lundi = decalerJour(lundi, 7)) semaines.push([...joursEntre(lundi, decalerJour(lundi, 6))]);
  return semaines;
}

/** Ce qui se pose sur un jour du mois : tout sauf les séjours, qui sont des barres. */
function evenementsDuJour(evenements: readonly CalendarEvent[], jour: string): readonly CalendarEvent[] {
  return evenements
    .filter((e) => {
      if (e.type === 'booking' || !e.start) return false;
      if (e.all_day && e.end && e.end.slice(0, 10) > e.start.slice(0, 10)) return e.start.slice(0, 10) <= jour && jour <= e.end.slice(0, 10);
      return jourDeLEvenement(e) === jour;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export interface MoisDeLAgendaProps {
  readonly jour: string;
  readonly aujourdhui: string;
  readonly evenements: readonly CalendarEvent[];
  readonly onOuvrir: (e: CalendarEvent) => void;
  readonly onChoisirJour: (jour: string) => void;
}

/**
 * Le mois du téléphone : sept initiales, un disque par jour (le jour choisi plein), trois points au
 * plus des types du jour — les séjours n'y sont pas, ils sont comptés sous la grille.
 */
export function MoisCompact({ jour, aujourdhui, evenements, onChoisirJour }: Omit<MoisDeLAgendaProps, 'onOuvrir'>) {
  const t = useTranslations('agenda');
  const d = useDatesDeLAgenda();
  const semaines = semainesDuMois(jour);
  const mois = jour.slice(0, 7);
  return (
    <div data-slot="mois-compact" className="border-b border-border px-2 pb-2 pt-1">
      <div className="grid grid-cols-7 text-center text-legende font-medium text-muted-foreground" aria-hidden="true">
        {(semaines[0] ?? []).map((j) => (
          <span key={j} className="py-1">
            {d.initiale(j)}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {semaines.flat().map((j) => {
          if (j.slice(0, 7) !== mois) return <span key={j} />;
          const duJour = evenementsDuJour(evenements, j);
          const choisi = j === jour;
          return (
            <button
              key={j}
              type="button"
              data-testid={`calendar-day-${j}`}
              aria-pressed={choisi}
              aria-label={t('jour.jourEtCompte', { jour: d.long(j), n: duJour.length })}
              onClick={() => onChoisirJour(j)}
              className="flex flex-col items-center gap-0.5 rounded-lg py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  'inline-flex size-10 items-center justify-center rounded-full text-corps tabular-nums',
                  choisi ? 'bg-foreground font-semibold text-background' : j === aujourdhui ? 'font-semibold text-primary-deep' : j < aujourdhui ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {Number(j.slice(8, 10))}
              </span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                {duJour.slice(0, 3).map((e) => (
                  <span key={`${e.type}-${e.id}`} className={cn('size-1.5 rounded-full', paletteFor(e).accent)} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Le mois du bureau : une carte, sept colonnes ; par semaine, les séjours en barres continues (un
 * élément par semaine traversée, deux pistes puis « +N séjours »), puis deux puces par jour
 * (« 10:57 · Visite ») et « +N », qui ouvre le jour.
 */
export function MoisDeLAgenda({ jour, aujourdhui, evenements, onOuvrir, onChoisirJour }: MoisDeLAgendaProps) {
  const t = useTranslations('agenda');
  const d = useDatesDeLAgenda();
  const semaines = semainesDuMois(jour);
  const mois = jour.slice(0, 7);
  const sejours = evenements.filter((e) => e.type === 'booking');
  return (
    <div data-slot="mois-de-l-agenda" role="group" aria-label={d.mois(jour)} className="overflow-x-auto rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground max-lg:min-w-160" aria-hidden="true">
        {(semaines[0] ?? []).map((j) => (
          <span key={j} className="px-2 py-2">
            {d.nomCourt(j)}
          </span>
        ))}
      </div>
      {semaines.map((semaine) => {
        const dansLeMois = semaine.map((j) => j.slice(0, 7) === mois);
        const premier = dansLeMois.indexOf(true);
        const dernier = dansLeMois.lastIndexOf(true);
        const { barres, enPlus } = barresDeLaRangee(sejours, semaine.slice(premier, dernier + 1), PISTES_DE_SEJOURS);
        return (
          <div key={semaine[0]} className="grid grid-cols-7 border-b border-border last:border-0 max-lg:min-w-160" style={{ gridTemplateRows: 'auto auto auto auto 1fr' }}>
            {semaine.map((j, i) => (
              <span
                key={`fond-${j}`}
                aria-hidden="true"
                className={cn('min-h-34 border-l border-border first:border-l-0', !dansLeMois[i] && 'bg-muted/40', j === aujourdhui && dansLeMois[i] && 'bg-primary/5')}
                style={{ gridColumn: i + 1, gridRow: '1 / -1' }}
              />
            ))}
            {semaine.map((j, i) =>
              dansLeMois[i] ? (
                <button
                  key={`n-${j}`}
                  type="button"
                  data-testid={`calendar-day-${j}`}
                  aria-label={t('jour.jourEtCompte', { jour: d.long(j), n: evenementsDuJour(evenements, j).length })}
                  onClick={() => onChoisirJour(j)}
                  className={cn(
                    'z-10 justify-self-start px-2 pb-0.5 pt-1.5 text-left text-ui tabular-nums outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring',
                    j === aujourdhui ? 'font-semibold text-primary-deep' : 'text-encre-douce',
                    j === jour && 'underline decoration-2 underline-offset-4',
                  )}
                  style={{ gridColumn: i + 1, gridRow: 1 }}
                >
                  {j === aujourdhui ? t('mois.aujourdhui', { n: Number(j.slice(8, 10)) }) : Number(j.slice(8, 10))}
                </button>
              ) : null,
            )}
            {barres.map((b) => (
              <button
                key={`sejour-${b.evenement.id}`}
                type="button"
                data-testid={`calendar-sejour-${b.evenement.id}`}
                onClick={() => onOuvrir(b.evenement)}
                className={cn(
                  'z-10 mb-0.5 flex h-4.5 min-w-0 items-center px-1.5 text-left text-legende font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
                  estEnAttente(b.evenement) ? cn('border text-encre-douce', HACHURE) : 'bg-accent text-accent-foreground',
                  b.commence && 'ml-1 rounded-l',
                  b.finit && 'mr-1 rounded-r',
                )}
                style={{ gridColumn: `${premier + b.debut + 1} / ${premier + b.fin + 2}`, gridRow: b.piste + 2 }}
              >
                <span className="truncate">{t('mois.sejour', { titre: b.evenement.title })}</span>
              </button>
            ))}
            {enPlus > 0 ? (
              <span
                className="z-10 mx-1 mb-0.5 flex h-4.5 items-center rounded bg-secondary px-1.5 text-legende font-medium text-encre-douce"
                style={{ gridColumn: `${premier + 1} / ${dernier + 2}`, gridRow: PISTES_DE_SEJOURS + 2 }}
              >
                {t('mois.sejoursEnPlus', { n: enPlus })}
              </span>
            ) : null}
            {semaine.map((j, i) => {
              if (!dansLeMois[i]) return null;
              const duJour = evenementsDuJour(evenements, j);
              return (
                <span key={`p-${j}`} className="z-10 flex min-w-0 flex-col gap-0.5 px-1 pb-1.5 pt-0.5" style={{ gridColumn: i + 1, gridRow: PISTES_DE_SEJOURS + 3 }}>
                  {duJour.slice(0, PUCES_PAR_JOUR).map((e) => (
                    <button
                      key={`${e.type}-${e.id}`}
                      type="button"
                      data-testid={`calendar-event-pill-${e.type}-${e.id}`}
                      onClick={() => onOuvrir(e)}
                      className={cn('flex h-4.5 min-w-0 items-center gap-1 rounded border px-1 text-left text-legende outline-none focus-visible:ring-3 focus-visible:ring-ring', estEnAttente(e) ? HACHURE : paletteForType(e.type).pill)}
                    >
                      <span className={cn('size-1.5 flex-none rounded-full', estEnAttente(e) ? 'border border-foreground/50' : paletteFor(e).accent)} aria-hidden="true" />
                      <span className="block truncate">
                        {estSansHeure(e) ? e.title : <span className="tabular-nums">{heureDeMinutes(minutesADakar(e.start))}</span>} · {t(`types.${cleDuType(e)}`)}
                      </span>
                    </button>
                  ))}
                  {duJour.length > PUCES_PAR_JOUR ? (
                    <button
                      type="button"
                      data-testid={`calendar-day-overflow-${j}`}
                      onClick={() => onChoisirJour(j)}
                      className="self-start px-1 text-legende font-medium text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      {t('jour.enPlus', { n: duJour.length - PUCES_PAR_JOUR })}
                    </button>
                  ) : null}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
