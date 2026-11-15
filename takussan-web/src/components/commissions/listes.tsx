'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, HandCoins } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { Pagination } from '@/components/console/Pagination';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUTS_DE_COMMISSION } from '@/lib/commissions/vue';
import { useAnnulees, useCompteDesCommissions, type CommissionEntryStatus, type UseCommissionEntriesParams } from '@/lib/queries/commissions';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PaginationMeta } from '@/types/api';
import { cn } from '@/lib/utils';

/**
 * Les comptes des puces : une lecture d'une ligne pour les dues et les payées ; les annulées sont
 * lues avec leur montant (« Annulé : X F », décision 7 b) ; « Toutes » en est la somme.
 */
export function useComptesParStatut(filtres: Omit<UseCommissionEntriesParams, 'status' | 'page' | 'perPage' | 'sort'>) {
  const due = useCompteDesCommissions({ ...filtres, status: 'due' });
  const paid = useCompteDesCommissions({ ...filtres, status: 'paid' });
  const annulees = useAnnulees(filtres);
  const cancelled = annulees?.compte;
  const toutes = due !== undefined && paid !== undefined && cancelled !== undefined ? due + paid + cancelled : undefined;
  return { due, paid, cancelled, toutes, annulees } as const;
}

export type ComptesParStatut = ReturnType<typeof useComptesParStatut>;

/**
 * Dues · Payées · Annulées · Toutes, avec leur compte. Au téléphone, la rangée défilante bord à bord ;
 * au bureau (`sm`), les puces basses, dans l'ordre de la maquette (« Toutes » en tête dans le registre
 * de l'admin, `toutesDAbord`).
 */
export function PucesDeStatut({
  statut,
  comptes,
  onChange,
  taille = 'default',
  toutesDAbord,
  className,
}: {
  readonly statut: CommissionEntryStatus | null;
  readonly comptes: ComptesParStatut;
  readonly onChange: (statut: CommissionEntryStatus | null) => void;
  readonly taille?: 'default' | 'sm';
  readonly toutesDAbord?: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('commissions');
  const toutes = (
    <PuceDeFiltre key="toutes" taille={taille} active={statut === null} compte={comptes.toutes} onClick={() => onChange(null)}>
      {t('puces.toutes')}
    </PuceDeFiltre>
  );
  const parStatut = STATUTS_DE_COMMISSION.map((s) => (
    <PuceDeFiltre key={s} taille={taille} active={statut === s} compte={comptes[s]} onClick={() => onChange(s)}>
      {t(`puces.${s}`)}
    </PuceDeFiltre>
  ));
  const puces = toutesDAbord ? [toutes, ...parStatut] : [...parStatut, toutes];
  if (taille === 'sm') {
    return (
      <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2', className)}>
        <div role="group" aria-label={t('filterLabel')} className="flex items-center gap-2">
          {puces}
        </div>
        <MontantAnnule annulees={comptes.annulees} />
      </div>
    );
  }
  // `className` reste sur la rangée : il y retouche son propre `py-2.5` (`pt-1`, `pt-4`).
  return (
    <>
      <RangeeDePuces aria-label={t('filterLabel')} className={className}>
        {puces}
      </RangeeDePuces>
      <MontantAnnule annulees={comptes.annulees} className="block px-4 pb-1" />
    </>
  );
}

/**
 * TCK-2662 (décision 7 b) — le total annulé de l'ancien grand livre, gardé à côté des puces, à toute
 * largeur : du texte secondaire, sans carte. Rien tant qu'aucune ligne de la sélection n'est annulée.
 */
export function MontantAnnule({ annulees, className }: { readonly annulees: ComptesParStatut['annulees']; readonly className?: string }) {
  const t = useTranslations('commissions');
  const f = useFormatteurs();
  if (!annulees || annulees.compte === 0) return null;
  const montant = f.montantCourt(annulees.montant, annulees.devise);
  return (
    <span data-slot="montant-annule" className={cn('text-ui text-muted-foreground tabular-nums', className)}>
      {annulees.tronque ? t('annulePlancher', { montant }) : t('annule', { montant })}
    </span>
  );
}

/** Intertitre d'une page de téléphone : petites capitales, action à droite. */
export function Rubrique({ children, action, className }: { readonly children: ReactNode; readonly action?: ReactNode; readonly className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 px-1 pb-2', className)}>
      <h2 className="text-xs font-semibold tracking-surtitre text-muted-foreground uppercase">{children}</h2>
      {action}
    </div>
  );
}

/** La carte de la zone de contenu (`Carte` de la maquette). */
export function Carte({ children, className, as: Balise = 'div' }: { readonly children: ReactNode; readonly className?: string; readonly as?: 'div' | 'section' | 'ul' }) {
  return <Balise className={cn('rounded-xl border border-border bg-card', className)}>{children}</Balise>;
}

export function ListeEnAttente({ lignes = 3 }: { readonly lignes?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: lignes }, (_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}

export function AucuneCommission() {
  const t = useTranslations('commissions');
  return <EmptyState icon={<HandCoins className="size-8" aria-hidden="true" />} title={t('emptyTitle')} description={t('emptyDescription')} />;
}

/** Téléphone : la pagination de la console, sous la liste (la maquette ne montre qu'une page). */
export function PaginationDuTelephone({ meta, onPage }: { readonly meta: PaginationMeta | undefined; readonly onPage: (page: number) => void }) {
  if (!meta || meta.last_page <= 1) return null;
  return <Pagination className="mt-3" page={meta.current_page} lastPage={meta.last_page} onChange={onPage} />;
}

/** Bureau : le pied du tableau — « 1 à 20 sur 120 », « Page 1 / 6 », précédent, suivant. */
export function PiedDeTableau({ meta, onPage }: { readonly meta: PaginationMeta | undefined; readonly onPage: (page: number) => void }) {
  const t = useTranslations('commissions');
  const tPagination = useTranslations('console.pagination');
  if (!meta) return null;
  const page = meta.current_page;
  const derniere = Math.max(1, meta.last_page);
  const debut = meta.total === 0 ? 0 : (page - 1) * meta.per_page + 1;
  const fin = Math.min(meta.total, page * meta.per_page);
  const bouton = 'inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:opacity-60';
  return (
    <nav aria-label={tPagination('aria')} className="flex h-12 items-center gap-3 border-t border-border px-4 text-ui text-muted-foreground">
      <span className="min-w-0 flex-1 truncate">{t('pied', { debut, fin, total: meta.total })}</span>
      <span className="tabular-nums" aria-live="polite">
        {tPagination('positionSlash', { page: String(page), lastPage: String(derniere) })}
      </span>
      <button type="button" aria-label={tPagination('previous')} disabled={page <= 1} onClick={() => onPage(page - 1)} className={bouton}>
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>
      <button type="button" aria-label={tPagination('next')} disabled={page >= derniere} onClick={() => onPage(page + 1)} className={bouton}>
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}

/**
 * Une rangée de tableau de bureau en grille (`Rangee` de la maquette) : `cols` est le gabarit des
 * colonnes dès 1440 px, `colsEtroit` celui du bureau 1280 (sous 1440). En `rem` (ADR-0107).
 */
export function Rangee({
  cols,
  colsEtroit,
  entete,
  className,
  children,
  role = 'row',
}: {
  readonly cols: string;
  readonly colsEtroit: string;
  readonly entete?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
  readonly role?: string;
}) {
  return (
    <div
      role={role}
      style={{ '--cols': cols, '--cols-etroit': colsEtroit } as React.CSSProperties}
      className={cn(
        'grid grid-cols-(--cols-etroit) items-center gap-x-4 px-4 min-[90rem]:grid-cols-(--cols)',
        entete ? 'h-10 text-xs font-medium text-muted-foreground' : 'min-h-[3.5rem] border-t border-border py-2 text-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}
