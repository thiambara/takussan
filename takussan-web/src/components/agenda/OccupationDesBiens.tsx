'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { estEnAttente } from '@/lib/agenda/agenda';
import { barresDeLaRangee, biensDesEvenements, etatDuBien, joursEntre, jourDe, lignesDOccupation, resumeDeLOccupation, sejourLaNuitDu, nuitsOccupees, type EtatDuBien, type LigneDOccupation } from '@/lib/agenda/occupation';
import { useBienDeLAgenda, useBiensLocatifs, useBiensParIdentifiants, type BienDeLAgenda } from '@/lib/queries/agenda';
import { cn } from '@/lib/utils';
import type { CalendarEvent } from '@/types/calendar';
import { useDatesDeLAgenda } from './dates';
import { HACHURE, traitsDeFond } from './pieces';

/** Les nuits d'un séjour : la barre les dit (l'agenda ne sert pas le nom du client). */
function nombreDeNuits(e: CalendarEvent): number {
  const { premiere, derniere } = nuitsOccupees(e);
  return Math.round((Date.parse(`${derniere}T12:00:00Z`) - Date.parse(`${premiere}T12:00:00Z`)) / 86_400_000) + 1;
}

/** Le libellé de la ligne d'un bien : son état vu d'aujourd'hui. */
function useEtatEnClair() {
  const t = useTranslations('agenda.occupation.etat');
  return (etat: EtatDuBien) => (etat.genre === 'libre' ? t('libre') : t(etat.genre, { jour: Number(etat.jusqua.slice(8, 10)) }));
}

function LegendeDeLOccupation({ className }: { readonly className?: string }) {
  const t = useTranslations('agenda.occupation.legende');
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-ui text-encre-douce', className)}>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm bg-accent" aria-hidden="true" />
        {t('sejour')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={cn('h-3 w-5 rounded-sm border', HACHURE)} aria-hidden="true" />
        {t('enAttente')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rotate-45 bg-warning" aria-hidden="true" />
        {t('echeance')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-info" aria-hidden="true" />
        {t('intervention')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-5 rounded-sm border border-border bg-card" aria-hidden="true" />
        {t('libre')}
      </span>
    </div>
  );
}

/** Téléphone : quatorze cases par bien — nuits occupées en aplat, libres en blanc. */
function BandeDuBien({ ligne, jours }: { readonly ligne: LigneDOccupation; readonly jours: readonly string[] }) {
  const echeances = new Set(ligne.echeances.map(jourDe));
  const interventions = new Set(ligne.interventions.map(jourDe));
  return (
    <div className="mt-2 grid grid-cols-14 gap-px" aria-hidden="true">
      {jours.map((j) => {
        const s = sejourLaNuitDu(ligne, j);
        const { premiere, derniere } = s ? nuitsOccupees(s) : { premiere: '', derniere: '' };
        return (
          <span
            key={j}
            className={cn(
              'relative flex h-6 items-center justify-center',
              s ? (estEnAttente(s) ? cn('border-y', HACHURE) : 'bg-accent') : 'rounded-sm border border-border bg-card',
              s && j === premiere && 'rounded-l-md',
              s && j === derniere && 'rounded-r-md',
            )}
          >
            {echeances.has(j) ? <span className="size-2.5 rotate-45 bg-warning" /> : interventions.has(j) ? <span className="size-2.5 rounded-full bg-info" /> : null}
          </span>
        );
      })}
    </div>
  );
}

export interface ParametresDeLOccupation {
  readonly jour: string;
  readonly de: string;
  readonly a: string;
  readonly aujourdhui: string;
  readonly evenements: readonly CalendarEvent[];
  /** Le filtre « Bien » : sa seule ligne. */
  readonly bien: number | null;
  /** `false` : aucune lecture (« Mon agenda » est affiché). */
  readonly actif: boolean;
}

/**
 * Les lignes de l'occupation et leur résumé (« 8 séjours en cours · 2 biens libres ce soir ») : lus
 * par la page, qui pose le résumé dans la tête de page au bureau. Les biens touchés par la fenêtre
 * d'abord, puis le reste du parc en location.
 */
export function useOccupationDesBiens({ jour, de, a, aujourdhui, evenements, bien, actif }: ParametresDeLOccupation) {
  const t = useTranslations('agenda.occupation');
  const ids = biensDesEvenements(evenements);
  const concernes = useBiensParIdentifiants(ids, actif && bien === null);
  const seul = useBienDeLAgenda(actif ? bien : null);
  const locatifs = useBiensLocatifs(actif && bien === null);
  const reference = jour >= de && jour <= a ? jour : de;
  const biens: BienDeLAgenda[] = (() => {
    if (bien !== null) return seul.data?.data ?? [];
    const premiers = concernes.data?.data ?? [];
    const vus = new Set(premiers.map((b) => b.id));
    const reste = (locatifs.data?.pages ?? []).flatMap((p) => p.data).filter((b) => !vus.has(b.id));
    return [...premiers, ...reste];
  })();
  const charge = bien !== null ? seul.isPending : (ids.length > 0 && concernes.isPending) || locatifs.isPending;
  const lignes = lignesDOccupation(biens.map((b) => ({ id: b.id, titre: b.title })), evenements);
  const resume = resumeDeLOccupation(lignes, aujourdhui >= de && aujourdhui <= a ? aujourdhui : reference);
  const enTete = [t('enCours', { n: resume.enCours }), t('libres', { n: resume.libres }), resume.enAttente > 0 ? t('enAttente', { n: resume.enAttente }) : null].filter(Boolean).join(' · ');
  return { lignes, charge, enTete, reference, voirPlus: locatifs.hasNextPage && bien === null ? { chargement: locatifs.isFetchingNextPage, suivante: () => void locatifs.fetchNextPage() } : null };
}

export type OccupationLue = ReturnType<typeof useOccupationDesBiens>;

export interface OccupationDesBiensProps {
  readonly de: string;
  readonly a: string;
  readonly aujourdhui: string;
  readonly bureau: boolean;
  readonly occupation: OccupationLue;
  readonly onOuvrir: (e: CalendarEvent) => void;
}

/**
 * « Occupation des biens » : un bien par ligne. Au bureau, les jours du mois en colonnes, séjours en
 * barres, échéances de bail en losanges, interventions en points (le résumé est dans la tête de
 * page) ; au téléphone, quatorze cases par bien sous un résumé collant. Toucher une ligne ouvre le
 * bien.
 */
export function OccupationDesBiens({ de, a, aujourdhui, bureau, occupation, onOuvrir }: OccupationDesBiensProps) {
  const t = useTranslations('agenda.occupation');
  const d = useDatesDeLAgenda();
  const etatEnClair = useEtatEnClair();
  const { lignes, charge, enTete, reference, voirPlus } = occupation;
  const jours = joursEntre(de, a);

  if (charge) return <Skeleton className="mx-4 h-96 rounded-xl md:mx-0" aria-busy="true" />;

  const plus = voirPlus ? (
    <div className="flex justify-center px-4 py-4">
      <Button type="button" variant="outline" disabled={voirPlus.chargement} onClick={voirPlus.suivante}>
        {t('voirPlus')}
      </Button>
    </div>
  ) : null;

  if (!bureau) {
    return (
      <div data-slot="occupation-des-biens">
        <div className="sticky top-0 z-10 border-b border-border bg-background px-4 pb-2 pt-3">
          <p className="text-sm" data-testid="occupation-resume">
            {enTete}
          </p>
          <div className="mt-2 grid grid-cols-14 gap-px" aria-hidden="true">
            {jours.map((j) => (
              <span key={j} className={cn('text-center text-legende tabular-nums', j === aujourdhui ? 'font-semibold text-primary-deep' : 'text-muted-foreground')}>
                {Number(j.slice(8, 10))}
              </span>
            ))}
          </div>
        </div>
        {lignes.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">{t('aucunBien')}</p> : null}
        <ul className="divide-y divide-border">
          {lignes.map((l) => (
            <li key={l.bien.id} data-testid={`occupation-bien-${l.bien.id}`}>
              <Link href={`/app/properties/${l.bien.id}`} className="block px-4 py-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="block text-corps font-medium leading-snug">{l.bien.titre}</span>
                <span className="mt-0.5 block text-ui text-muted-foreground">{etatEnClair(etatDuBien(l, reference))}</span>
                <BandeDuBien ligne={l} jours={jours} />
              </Link>
            </li>
          ))}
        </ul>
        {plus}
        <div className="border-t border-border px-4 py-4">
          <LegendeDeLOccupation />
          <p className="mt-2 text-ui text-muted-foreground">{t('toucher')}</p>
        </div>
      </div>
    );
  }

  const colonnes = { gridTemplateColumns: `repeat(${jours.length}, minmax(0, 1fr))` };
  const lignesDeFond = { ...colonnes, backgroundImage: traitsDeFond('right'), backgroundSize: `calc(100% / ${jours.length}) 100%` };
  const indexDuJour = jours.indexOf(aujourdhui);
  return (
    <div data-slot="occupation-des-biens" className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="grid grid-cols-[calc(var(--spacing)*58)_minmax(0,1fr)] border-b border-border bg-muted/40 max-xl:min-w-220">
          <span className="px-4 py-2 text-xs font-medium text-muted-foreground">{t('nbBiens', { n: lignes.length })}</span>
          <div className="grid" style={colonnes}>
            {jours.map((j) => (
              <span
                key={j}
                className={cn('flex flex-col items-center py-1 text-legende leading-tight tabular-nums', j === aujourdhui ? 'bg-primary font-semibold text-primary-foreground' : 'text-encre-douce')}
              >
                <span className={j === aujourdhui ? undefined : 'text-muted-foreground'}>{d.initiale(j)}</span>
                {Number(j.slice(8, 10))}
              </span>
            ))}
          </div>
        </div>
        {lignes.length === 0 ? <p className="px-4 py-6 text-sm text-muted-foreground">{t('aucunBien')}</p> : null}
        {lignes.map((l) => {
          const { barres } = barresDeLaRangee(l.sejours, jours, 1);
          return (
            <div key={l.bien.id} data-testid={`occupation-bien-${l.bien.id}`} className="grid grid-cols-[calc(var(--spacing)*58)_minmax(0,1fr)] border-b border-border last:border-0 max-xl:min-w-220">
              <Link href={`/app/properties/${l.bien.id}`} className="min-w-0 px-4 py-2 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="block truncate text-sm font-medium">{l.bien.titre}</span>
                <span className="block truncate text-xs text-muted-foreground">{etatEnClair(etatDuBien(l, reference))}</span>
              </Link>
              <div className="grid h-12" style={lignesDeFond}>
                {indexDuJour >= 0 ? <span className="bg-primary/10" style={{ gridColumn: `${indexDuJour + 1} / ${indexDuJour + 2}`, gridRow: 1 }} /> : null}
                {barres.map((b) => (
                  <button
                    key={b.evenement.id}
                    type="button"
                    data-testid={`occupation-sejour-${b.evenement.id}`}
                    onClick={() => onOuvrir(b.evenement)}
                    className={cn(
                      'z-10 mx-px my-2 flex min-w-0 items-center overflow-hidden px-2 text-left text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
                      estEnAttente(b.evenement) ? cn('border text-encre-douce', HACHURE) : 'bg-accent text-accent-foreground',
                      b.commence && 'rounded-l-md',
                      b.finit && 'rounded-r-md',
                    )}
                    style={{ gridColumn: `${b.debut + 1} / ${b.fin + 2}`, gridRow: 1 }}
                  >
                    <span className="truncate">{t(estEnAttente(b.evenement) ? 'sejourEnAttente' : 'sejour', { nuits: nombreDeNuits(b.evenement), reference: b.evenement.reference ?? '' })}</span>
                  </button>
                ))}
                {[...l.echeances, ...l.interventions].map((e) => {
                  const i = jours.indexOf(jourDe(e));
                  if (i < 0) return null;
                  return (
                    <button
                      key={`${e.type}-${e.id}-${e.kind ?? ''}`}
                      type="button"
                      aria-label={e.title}
                      onClick={() => onOuvrir(e)}
                      className="z-20 flex items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring"
                      style={{ gridColumn: `${i + 1} / ${i + 2}`, gridRow: 1 }}
                    >
                      <span className={cn('size-3', e.type === 'lease_event' ? 'rotate-45 bg-warning' : 'rounded-full bg-info')} />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {plus}
      <LegendeDeLOccupation />
    </div>
  );
}
