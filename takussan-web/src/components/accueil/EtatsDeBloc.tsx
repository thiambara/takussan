'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

/**
 * TCK-2622 — les états d'un bloc de l'accueil (maquette `app-accueil` a, écrans « Chargement et
 * erreur » et « Rien à faire »). Chaque bloc a son squelette et son erreur : un bloc en échec n'éteint
 * pas les autres, et le dit (« Le reste de la page est à jour »).
 *
 * Les blocs « À faire » de chaque persona (TCK-2624, TCK-2625) les emploient ; le socle emploie
 * l'erreur pour « Ce mois ».
 */

interface ErreurDeBlocProps {
  /** Ce qui n'a pas pu être chargé, déjà traduit : « les chiffres du mois ». */
  readonly quoi: string;
  readonly onReessayer: () => void;
  readonly className?: string;
}

export function ErreurDeBloc({ quoi, onReessayer, className }: ErreurDeBlocProps) {
  const t = useTranslations('accueil.blocs');
  return (
    <div role="alert" data-slot="erreur-de-bloc" className={cn('flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/6 px-4 py-3', className)}>
      <CircleAlert className="size-5 flex-none text-destructive" strokeWidth={1.75} aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">{t('erreur', { quoi })}</span> <span className="text-muted-foreground">{t('resteAJour')}</span>
      </p>
      <button
        type="button"
        onClick={onReessayer}
        className="inline-flex h-11 flex-none items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {t('reessayer')}
      </button>
    </div>
  );
}

/** Le squelette d'une carte « À faire » au téléphone. */
export function SqueletteDeCarte() {
  return (
    <div data-slot="squelette-de-carte" className="rounded-2xl border border-border bg-card p-4" aria-hidden="true">
      <div className="flex items-start gap-3">
        <span className="size-9 flex-none animate-pulse rounded-full bg-muted" />
        <span className="flex-1 space-y-2 pt-1">
          <span className="block h-3.5 w-3/5 animate-pulse rounded bg-muted" />
          <span className="block h-3 w-4/5 animate-pulse rounded bg-muted" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <span className="h-11 animate-pulse rounded-lg bg-muted" />
        <span className="h-11 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
  );
}

/** Le squelette de « Ce mois » : des puces au téléphone, quatre tuiles au bureau. */
export function SqueletteDesChiffres() {
  return (
    <div data-slot="squelette-des-chiffres" aria-hidden="true">
      <div className="flex gap-2 overflow-hidden px-4 md:hidden">
        {[22, 28, 33, 24].map((l) => (
          <span key={l} className="h-11 flex-none animate-pulse rounded-full bg-muted" style={{ width: `calc(var(--spacing) * ${l})` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2.5 rounded-xl border border-border bg-card p-4">
            <span className="block h-3 w-20 animate-pulse rounded bg-muted" />
            <span className="block h-6 w-16 animate-pulse rounded bg-muted" />
            <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ToutEstAJourProps {
  /** Le texte du persona (« Aucune visite à confirmer, aucun devis à valider… »), déjà traduit. */
  readonly texte: string;
  /** Le geste positif du persona (« Proposer un bien à mon agence »), jamais « explorer les biens ». */
  readonly action?: ReactNode;
  readonly className?: string;
}

/**
 * « Tout est à jour » : quand aucun bloc « À faire » n'a de ligne. Un état POSITIF par persona,
 * jamais un état vide qui invite à « explorer les biens ».
 */
export function ToutEstAJour({ texte, action, className }: ToutEstAJourProps) {
  const t = useTranslations('accueil.toutEstAJour');
  return (
    <div data-slot="tout-est-a-jour" className={cn('flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-9 text-center md:py-16', className)}>
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="size-8" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <p className="mt-4 font-display text-lg font-semibold">{t('titre')}</p>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">{texte}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
