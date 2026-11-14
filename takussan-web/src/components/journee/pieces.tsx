'use client';

import type { ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { FUSEAU_DES_VISITES } from '@/lib/visites/heure-de-dakar';
import { jourADakar, type ResumeDuJour } from '@/lib/journee/journee';
import { jourEnClair } from '@/lib/journee/jour-en-clair';
import { cn } from '@/lib/utils';

/**
 * TCK-2596 — les pièces de « Ma journée » (maquette `app-aujourdhui` a, pièces de `app-visites-pieces`) :
 * l'intertitre compté, le cercle à cocher de 44 px, la bande de la semaine du téléphone et celle du
 * bureau, la navigation de jour.
 */

/** Un jour `AAAA-MM-JJ` en `Date` (midi UTC : aucun fuseau ne le fait changer de jour). */
export function dateDuJour(jour: string): Date {
  return new Date(`${jour}T12:00:00Z`);
}

/** « Mardi 10 novembre » : le jour, en toutes lettres, au calendrier de Dakar. */
export function useJourEnClair() {
  const locale = useLocale();
  return (jour: string) => jourEnClair(locale, jour);
}

/** L'intertitre d'un bloc : petites capitales, son compte, et à droite une action (lien). */
export function Etiquette({ children, compte, action, className }: { readonly children: ReactNode; readonly compte?: number | null; readonly action?: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <h2 className="text-xs font-semibold uppercase tracking-surtitre text-muted-foreground">{children}</h2>
      {compte != null ? <span className="text-xs font-semibold tabular-nums text-muted-foreground">{compte}</span> : null}
      {action ? <span className="ml-auto text-ui leading-normal font-medium text-primary">{action}</span> : null}
    </div>
  );
}

/** Le cercle à cocher d'une tâche, dans une cible de 44 px. */
export function Cocher({
  faite,
  libelle,
  onClick,
  disabled,
  className,
}: {
  readonly faite: boolean;
  readonly libelle: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={faite}
      aria-label={libelle}
      onClick={onClick}
      disabled={disabled}
      data-slot="cocher"
      className={cn('inline-flex size-11 flex-none items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60', className)}
    >
      <span className={cn('inline-flex size-6 items-center justify-center rounded-full border-2', faite ? 'border-success bg-success text-success-foreground' : 'border-foreground/30')}>
        {faite ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}

/** Les classes d'un geste de 44 px (maquette `Geste`). */
export const GESTE = 'inline-flex h-11 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring';
export const GESTE_CONTOUR = 'border border-border bg-card text-foreground hover:bg-muted';
export const GESTE_SOMBRE = 'bg-foreground text-background hover:bg-foreground/90';
export const ROND = 'inline-flex size-11 flex-none items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring';

/** « 2 visites · 3 tâches », ou « Libre ». */
export function useResumeEnClair() {
  const t = useTranslations('journee.semaine');
  return (r: ResumeDuJour | undefined) => {
    if (!r || (r.visites === 0 && r.taches === 0)) return t('libre');
    return [r.visites > 0 ? t('visites', { n: r.visites }) : null, r.taches > 0 ? t('taches', { n: r.taches }) : null].filter(Boolean).join(' · ');
  };
}

interface BandeProps {
  readonly semaine: readonly string[];
  readonly jour: string;
  readonly maintenant: Date;
  readonly resume: Readonly<Record<string, ResumeDuJour>>;
  readonly onChoisir: (jour: string) => void;
  readonly className?: string;
}

/**
 * La bande de sept jours du téléphone : le jour choisi en disque plein, aujourd'hui en terracotta,
 * et sous chaque jour un point par visite (terracotta) et par tâche (encre), trois au plus.
 */
export function BandeDeSemaine({ semaine, jour, maintenant, resume, onChoisir, className }: BandeProps) {
  const locale = useLocale();
  const enClair = useResumeEnClair();
  const jourEnClair = useJourEnClair();
  const initiale = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: FUSEAU_DES_VISITES });
  const aujourdhui = jourADakar(maintenant);
  return (
    <div role="group" aria-label={useTranslations('journee.semaine')('libelle')} data-slot="bande-de-semaine" className={cn('grid grid-cols-7 px-2 pb-1.5 pt-1', className)}>
      {semaine.map((j) => {
        const actif = j === jour;
        const r = resume[j];
        const points = [...Array.from({ length: r?.visites ?? 0 }, () => 'bg-primary'), ...Array.from({ length: r?.taches ?? 0 }, () => 'bg-foreground')].slice(0, 3);
        return (
          <button
            key={j}
            type="button"
            aria-pressed={actif}
            aria-label={`${jourEnClair(j)} : ${enClair(r)}`}
            onClick={() => onChoisir(j)}
            className="flex flex-col items-center gap-0.5 rounded-lg py-1 outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            <span className="text-legende font-medium text-muted-foreground" aria-hidden="true">
              {initiale.format(dateDuJour(j)).toLocaleUpperCase(locale)}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                'inline-flex size-10 items-center justify-center rounded-full text-corps font-semibold tabular-nums',
                actif ? 'bg-foreground text-background' : j === aujourdhui ? 'text-primary' : 'text-foreground',
              )}
            >
              {Number(j.slice(8, 10))}
            </span>
            <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
              {points.map((c, i) => (
                <span key={i} className={cn('size-1.5 rounded-full', c)} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** La semaine du bureau : sept cases « Mar. 10 · 2 visites · 3 tâches » ; sous `lg`, elle défile. */
export function SemaineBureau({ semaine, jour, resume, onChoisir }: Omit<BandeProps, 'maintenant' | 'className'>) {
  const locale = useLocale();
  const enClair = useResumeEnClair();
  const jourEnClair = useJourEnClair();
  const court = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: FUSEAU_DES_VISITES });
  return (
    <div
      role="group"
      aria-label={useTranslations('journee.semaine')('libelle')}
      data-slot="semaine-bureau"
      className="grid grid-cols-7 gap-2 max-lg:grid-cols-[repeat(7,minmax(calc(var(--spacing)*24),1fr))] max-lg:overflow-x-auto"
    >
      {semaine.map((j) => {
        const actif = j === jour;
        const nom = court.format(dateDuJour(j));
        return (
          <button
            key={j}
            type="button"
            aria-pressed={actif}
            aria-label={`${jourEnClair(j)} : ${enClair(resume[j])}`}
            onClick={() => onChoisir(j)}
            className={cn(
              'rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring',
              actif ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted',
            )}
          >
            <span className="block text-sm font-semibold tabular-nums" aria-hidden="true">
              {nom.charAt(0).toLocaleUpperCase(locale) + nom.slice(1)} {Number(j.slice(8, 10))}
            </span>
            <span className={cn('block truncate text-xs max-xl:whitespace-normal', actif ? 'text-background/70' : 'text-muted-foreground')} aria-hidden="true">
              {enClair(resume[j])}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Jour précédent · Aujourd'hui · Jour suivant (bureau). */
export function NavJour({ onPrecedent, onAujourdhui, onSuivant }: { readonly onPrecedent: () => void; readonly onAujourdhui: () => void; readonly onSuivant: () => void }) {
  const t = useTranslations('journee');
  const bouton = 'inline-flex size-9 items-center justify-center outline-none focus-visible:ring-3 focus-visible:ring-ring hover:bg-muted';
  return (
    <span className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-border bg-card text-sm font-medium">
      <button type="button" aria-label={t('jourPrecedent')} onClick={onPrecedent} className={bouton}>
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={onAujourdhui} className="h-9 border-x border-border px-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
        {t('aujourdhui')}
      </button>
      <button type="button" aria-label={t('jourSuivant')} onClick={onSuivant} className={bouton}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </span>
  );
}
