'use client';

import type { ReactNode } from 'react';
import { CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { estEnAttente } from '@/lib/agenda/agenda';
import { cn } from '@/lib/utils';
import type { CalendarEvent, CalendarEventType, CalendarView } from '@/types/calendar';
import { paletteForType } from '@/components/calendar/event-colors';

/**
 * TCK-2597 — les pièces de l'agenda (maquette `app-agenda` a) : le type écrit en mots à côté de sa
 * pastille, le gris hachuré de l'attente, la bascule, les outils de période, la légende, le lien
 * replié vers l'occupation, le créneau libre.
 */

/** Fond hachuré : ce qui attend une confirmation (« en attente » se lit sans la couleur). */
/** Un trait de 1 px tous les `pas` (lignes d'heures, colonnes de jours), en fond de grille. */
export const traitsDeFond = (sens: 'right' | 'bottom') => `linear-gradient(to ${sens}, var(--border) 1px, transparent 1px)`;

export const HACHURE =
  'border-dashed border-foreground/30 bg-[repeating-linear-gradient(135deg,transparent_0,transparent_5px,color-mix(in_oklab,var(--foreground)_7%,transparent)_5px,color-mix(in_oklab,var(--foreground)_7%,transparent)_10px)]';

/** La clé du type d'un événement : une échéance de bail dit si c'est la fin ou le renouvellement. */
export function cleDuType(e: Pick<CalendarEvent, 'type' | 'kind'>): string {
  if (e.type === 'lease_event') return e.kind === 'renewal' ? 'lease_renewal' : 'lease_end';
  return e.type;
}

/** Pastille + type en mots ; en attente, pastille creuse et « · en attente ». */
export function TypeMot({ evenement, detail, className }: { readonly evenement: Pick<CalendarEvent, 'type' | 'kind' | 'status'>; readonly detail?: string | null; readonly className?: string }) {
  const t = useTranslations('agenda');
  const attente = estEnAttente(evenement);
  return (
    <span data-slot="type-mot" className={cn('inline-flex min-w-0 items-center gap-1.5 text-ui font-medium text-encre-douce', className)}>
      <span className={cn('size-2 flex-none rounded-full', attente ? 'border border-foreground/50' : paletteForType(evenement.type).accent)} aria-hidden="true" />
      <span className="truncate">
        {t(`types.${cleDuType(evenement)}`)}
        {attente ? <span className="font-normal text-muted-foreground"> · {t('enAttente')}</span> : detail ? <span className="font-normal text-muted-foreground"> · {detail}</span> : null}
      </span>
    </span>
  );
}

/** « Confirmée » ou « En attente » : le statut d'une visite ou d'un séjour, en mots. */
export function StatutDeLEvenement({ evenement }: { readonly evenement: Pick<CalendarEvent, 'type' | 'status'> }) {
  const t = useTranslations('agenda.statut');
  if (evenement.type !== 'visit' && evenement.type !== 'booking') return null;
  const attente = estEnAttente(evenement);
  return <StatusBadge tone={attente ? 'attention' : 'success'} label={attente ? t('enAttente') : t('confirme', { genre: evenement.type === 'visit' ? 'f' : 'm' })} />;
}

export interface OptionSegmentee<V extends string> {
  readonly valeur: V;
  readonly libelle: string;
}

/** Une bascule à segments (radiogroup) : l'actif en carte blanche, les autres en encre douce. */
export function Segmente<V extends string>({
  options,
  actif,
  onChange,
  libelle,
  compact,
  className,
}: {
  readonly options: readonly OptionSegmentee<V>[];
  readonly actif: V;
  readonly onChange: (v: V) => void;
  readonly libelle: string;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={libelle} className={cn('flex rounded-xl bg-muted p-1', className)}>
      {options.map((o) => {
        const estActif = o.valeur === actif;
        return (
          <button
            key={o.valeur}
            type="button"
            role="radio"
            aria-checked={estActif}
            data-testid={`agenda-segment-${o.valeur}`}
            onClick={() => (estActif ? null : onChange(o.valeur))}
            className={cn(
              'inline-flex min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring',
              compact ? 'h-8' : 'h-10',
              estActif ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {o.libelle}
          </button>
        );
      })}
    </div>
  );
}

const OUTIL = 'inline-flex h-11 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';

/**
 * « 14 j » : la durée que montre l'occupation au téléphone, à la place du menu de vue. Une seule
 * durée y tient (quatorze cases par bien) : un libellé, pas un menu sans choix.
 */
export function DureeDeLOccupation() {
  const t = useTranslations('agenda.periode');
  return (
    <span className={cn(OUTIL, 'hover:bg-card')} aria-label={t('quatorzeJoursLong')}>
      {t('quatorzeJours')}
    </span>
  );
}

/** Le compte d'un outil (« Filtres 2 ») : une pastille d'encre. */
export function Compte({ n }: { readonly n: number }) {
  return <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-legende font-semibold tabular-nums text-background">{n}</span>;
}

const VUES: readonly CalendarView[] = ['day', 'week', 'month', 'list'];

/** Le choix de la vue : un menu au téléphone (« Jour ▾ »). */
export function MenuDeVue({ vue, onChange, className }: { readonly vue: CalendarView; readonly onChange: (v: CalendarView) => void; readonly className?: string }) {
  const t = useTranslations('agenda');
  return (
    <DropdownMenu>
      {/* Le libellé court (« Sem. ») laisse à la période sa place dans la barre du téléphone. */}
      <DropdownMenuTrigger aria-label={t('vues.libelle')} data-testid="agenda-menu-vue" className={cn(OUTIL, className)}>
        {t(`vuesCourtes.${vue}`)}
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {VUES.map((v) => (
          <DropdownMenuItem key={v} data-testid={`calendar-view-${v}`} onClick={() => onChange(v)}>
            {t(`vues.${v}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Le choix de la vue au bureau : Jour · Semaine · Mois · Liste. */
export function BasculeDeVue({ vue, onChange }: { readonly vue: CalendarView; readonly onChange: (v: CalendarView) => void }) {
  const t = useTranslations('agenda.vues');
  return (
    <div role="radiogroup" aria-label={t('libelle')} className="flex rounded-xl bg-muted p-1 min-[90rem]:w-75">
      {VUES.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={vue === v}
          data-testid={`calendar-view-${v}`}
          onClick={() => onChange(v)}
          className={cn(
            'inline-flex h-8 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-lg px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring',
            vue === v ? 'bg-card font-semibold text-foreground shadow-sm' : 'font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {t(v)}
        </button>
      ))}
    </div>
  );
}

/** Précédent · période · Suivant, puis la vue et les filtres (téléphone). */
export function BarrePeriode({
  periode,
  onPrecedent,
  onSuivant,
  vue,
  filtres,
  onFiltres,
}: {
  readonly periode: string;
  readonly onPrecedent: () => void;
  readonly onSuivant: () => void;
  readonly vue: ReactNode;
  readonly filtres: number;
  readonly onFiltres: () => void;
}) {
  const t = useTranslations('agenda');
  const fleche = 'inline-flex size-11 max-[24rem]:size-9 flex-none items-center justify-center rounded-lg outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';
  return (
    <div data-slot="barre-periode" className="flex items-center gap-1 px-2 pt-2 max-[24rem]:gap-0">
      <button type="button" aria-label={t('nav.precedent')} onClick={onPrecedent} className={fleche}>
        <ChevronLeft className="size-5" aria-hidden="true" />
      </button>
      <h2 data-testid="calendar-focus-label" className="line-clamp-2 min-w-0 flex-1 text-balance text-center text-corps font-semibold leading-tight first-letter:uppercase">
        {periode}
      </h2>
      <button type="button" aria-label={t('nav.suivant')} onClick={onSuivant} className={fleche}>
        <ChevronRight className="size-5" aria-hidden="true" />
      </button>
      <span className="ml-1 flex flex-none">{vue}</span>
      <button type="button" data-testid="agenda-filtres" onClick={onFiltres} className={cn(OUTIL, 'mr-2')}>
        <SlidersHorizontal className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {t('filtres.bouton')}
        <Compte n={filtres} />
      </button>
    </div>
  );
}

/** Précédent · Aujourd'hui · Suivant, puis la période (bureau). */
export function NavPeriode({ periode, onPrecedent, onAujourdhui, onSuivant }: { readonly periode: string; readonly onPrecedent: () => void; readonly onAujourdhui: () => void; readonly onSuivant: () => void }) {
  const t = useTranslations('agenda.nav');
  const fleche = 'inline-flex size-9 items-center justify-center outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="inline-flex h-9 flex-none items-center overflow-hidden rounded-lg border border-border bg-card text-sm">
        <button type="button" aria-label={t('precedent')} onClick={onPrecedent} className={cn(fleche, 'border-r border-border')}>
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={onAujourdhui} className="h-9 px-3 font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring">
          {t('aujourdhui')}
        </button>
        <button type="button" aria-label={t('suivant')} onClick={onSuivant} className={cn(fleche, 'border-l border-border')}>
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </span>
      <h2 data-testid="calendar-focus-label" className="truncate font-display text-lg font-semibold tracking-titre first-letter:uppercase">
        {periode}
      </h2>
    </span>
  );
}

/** Un filtre du bureau (« Qui Moi ▾ ») : il ouvre le panneau des filtres. */
export function Filtre({ libelle, valeur, actif, onClick }: { readonly libelle: string; readonly valeur: string; readonly actif?: boolean; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring',
        actif ? 'border-foreground/40 bg-secondary/60' : 'border-border bg-card',
      )}
    >
      <span className="text-muted-foreground">{libelle}</span>
      <span className="font-medium">{valeur}</span>
      <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** La légende : les types en mots, et ce que le gris veut dire. */
export function Legende({ types, className }: { readonly types: readonly CalendarEventType[]; readonly className?: string }) {
  const t = useTranslations('agenda');
  return (
    <div data-testid="calendar-legend" className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-ui text-encre-douce', className)}>
      {types.map((type) => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', paletteForType(type).accent)} aria-hidden="true" />
          {t(`typesPluriel.${type}`)}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className={cn('h-3 w-5 rounded-sm border', HACHURE)} aria-hidden="true" />
        {t('legende.enAttente')}
      </span>
    </div>
  );
}

/** Le lien replié vers l'occupation : les séjours ne noient plus la journée. */
export function LienOccupation({
  enCours,
  arrivees,
  departs,
  court,
  haut,
  onClick,
  className,
}: {
  readonly enCours: number;
  readonly arrivees: number;
  readonly departs: number;
  /** Sous la grille du mois : le compte seul, sans « Occupation : ». */
  readonly court?: boolean;
  /** En tête de la journée (sous le mois) : un chevron vers le bas. */
  readonly haut?: boolean;
  readonly onClick: () => void;
  readonly className?: string;
}) {
  const t = useTranslations('agenda.occupation');
  const compte = t('enCours', { n: enCours });
  return (
    <button
      type="button"
      data-testid="agenda-lien-occupation"
      onClick={onClick}
      className={cn(
        'flex min-h-12 w-full items-center gap-3 rounded-xl border border-accent/30 bg-secondary px-3.5 py-2 text-left outline-none hover:bg-secondary/70 focus-visible:ring-3 focus-visible:ring-ring',
        className,
      )}
    >
      <span className="size-2 flex-none rounded-full bg-accent" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm leading-snug">
        <span className="font-semibold">{court ? compte : t('lien', { compte })}</span>
        <span className="block text-ui text-encre-douce">{t('mouvements', { arrivees, departs })}</span>
      </span>
      {haut ? <ChevronDown className="size-4 flex-none text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />}
    </button>
  );
}

/** « Mardi 10 novembre · Aujourd'hui ». */
export function TitreJour({ children, aujourdhui, className }: { readonly children: ReactNode; readonly aujourdhui?: boolean; readonly className?: string }) {
  const t = useTranslations('agenda.jour');
  return (
    <div className={cn('flex items-center gap-2 px-4 pb-3 pt-4', className)}>
      <h3 className="font-display text-lg font-semibold tracking-titre first-letter:uppercase">{children}</h3>
      {aujourdhui ? <StatusBadge tone="info" label={t('aujourdhui')} /> : null}
    </div>
  );
}

/** Un créneau libre : le toucher ouvre « Planifier une visite », jour et heure déjà remplis. */
export function CreneauLibre({ texte, onPlanifier, libelle }: { readonly texte: string; readonly onPlanifier: () => void; readonly libelle: string }) {
  const t = useTranslations('agenda.jour');
  return (
    <li className="flex gap-3 px-4">
      <div className="w-13 flex-none" />
      <button
        type="button"
        aria-label={libelle}
        onClick={onPlanifier}
        className="mb-3 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-dashed border-border px-3.5 text-left text-sm text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1">{texte}</span>
        <span className="inline-flex flex-none items-center gap-1 font-medium text-primary-deep">
          <CalendarPlus className="size-4" strokeWidth={1.75} aria-hidden="true" />
          {t('planifier')}
        </span>
      </button>
    </li>
  );
}
