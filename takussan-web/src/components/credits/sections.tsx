'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowUp, ChevronLeft, ChevronRight, Clock, Flame, Star, TrendingDown, type LucideIcon } from 'lucide-react';

import type { CreditLot, CreditMovement } from '@/components/boost/types';
import { EmptyState } from '@/components/feedback';
import { Progress } from '@/components/ui/progress';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { PaginationMeta } from '@/types/api';

import { joursRestants, type FamilleDOffre, type LigneDeGrille } from './lecture';
import { Delta } from './pieces';
import { useLectureDesCredits } from './useLectureDesCredits';

/**
 * TCK-2664 — les sections de la page Crédits qui ne dépendent ni d'un bien ni d'un achat : le solde,
 * la grille des offres (lue de l'API), les lots, l'historique.
 */

/* ─────────────────────────────── le solde ─────────────────────────────── */

export function CarteSolde({
  solde,
  expiration,
  libelle,
  compact,
  children,
}: {
  readonly solde: number;
  readonly expiration: { readonly date: string; readonly credits: number } | null;
  readonly libelle: string;
  readonly compact?: boolean;
  readonly children?: ReactNode;
}) {
  const t = useTranslations('credits.page');
  const f = useFormatteurs();
  return (
    <section data-slot="carte-solde" aria-label={libelle} className="rounded-xl border border-primary/15 bg-secondary p-5">
      <p className="text-sm font-medium text-primary-deep">{libelle}</p>
      <p className={cn('mt-1.5 font-display leading-none font-semibold tracking-titre tabular-nums', compact ? 'text-affiche-32' : 'text-affiche-40')}>
        {solde} <span className={cn('font-medium tracking-normal text-muted-foreground', compact ? 'text-corps' : 'text-lg')}>{t('unite', { count: solde })}</span>
      </p>
      {expiration ? (
        <p data-slot="prochaine-expiration" className="mt-3 flex items-center gap-1.5 text-sm font-medium text-warning">
          <Clock className="size-4 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('expirent', { count: expiration.credits, date: f.jourMois(expiration.date) })}
        </p>
      ) : null}
      {children}
    </section>
  );
}

/* ─────────────────────────── ce que ça coûte ─────────────────────────── */

const ICONES: Readonly<Record<FamilleDOffre, LucideIcon>> = { bump: ArrowUp, featured: Star, urgent: Flame, price_drop: TrendingDown };

/** La grille des prix, en crédits, telle que `GET /api/boost-products` la rend (AC1). */
export function GrilleDesOffres({ lignes }: { readonly lignes: readonly LigneDeGrille[] }) {
  const t = useTranslations('credits');
  return (
    <ul data-slot="grille-des-offres" className="divide-y divide-border">
      {lignes.map(({ famille, offres }) => {
        const Icone = ICONES[famille];
        const unique = offres.length === 1 ? offres[0] : null;
        return (
          <li key={famille} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 inline-flex size-8 flex-none items-center justify-center rounded-lg bg-secondary text-primary-deep">
              <Icone className="size-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="flex items-baseline gap-2">
                <p className="min-w-0 flex-1 text-corps font-medium">{t(`offres.${famille}.nom`)}</p>
                {unique ? (
                  <p className="flex-none text-corps font-semibold tabular-nums">
                    {unique.price_credits} <span className="text-ui font-normal text-muted-foreground">{t('page.unite', { count: unique.price_credits })}</span>
                  </p>
                ) : null}
              </div>
              <p className="mt-0.5 text-ui text-muted-foreground">{t(`offres.${famille}.detail`, { jours: offres[0].duration_days })}</p>
              {unique ? null : (
                <p className="mt-1 text-ui font-medium tabular-nums">
                  {t('offres.paliers', {
                    paliers: offres.map((o) => t('offres.palier', { jours: o.duration_days, prix: o.price_credits })).join(' · '),
                    count: offres[offres.length - 1].price_credits,
                  })}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ──────────────────────────────── les lots ──────────────────────────────── */

export function LotDeCredits({ lot, maintenant }: { readonly lot: CreditLot; readonly maintenant: number }) {
  const t = useTranslations('credits');
  const f = useFormatteurs();
  return (
    <li data-slot="lot-de-credits" className="px-4 py-3.5">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 truncate text-corps font-medium">{t(`lots.origines.${lot.origin}`)}</p>
        <p className="flex-none text-corps font-semibold tabular-nums">
          {lot.remaining_amount} <span className="text-ui font-normal text-muted-foreground">{t('lots.surInitial', { initial: lot.initial_amount })}</span>
        </p>
      </div>
      <p className="mt-0.5 text-ui text-muted-foreground">{[lot.reason, t('lots.recus', { date: f.jourMois(lot.created_at) })].filter(Boolean).join(' · ')}</p>
      <Progress
        value={lot.initial_amount > 0 ? Math.round((lot.remaining_amount / lot.initial_amount) * 100) : 0}
        aria-label={t('lots.jaugeAria', { remaining: lot.remaining_amount, initial: lot.initial_amount })}
        className="mt-2.5"
      />
      {lot.expires_at ? (
        <p className="mt-2 flex items-center gap-1.5 text-ui font-medium text-warning">
          <Clock className="size-3.5" aria-hidden="true" />
          {t('lots.expireDans', { date: f.jourMois(lot.expires_at), count: joursRestants(lot.expires_at, maintenant) })}
        </p>
      ) : (
        <p className="mt-2 text-ui text-muted-foreground">{t('lots.noExpiry')}</p>
      )}
    </li>
  );
}

export function ListeDesLots({ lots, maintenant }: { readonly lots: readonly CreditLot[]; readonly maintenant: number }) {
  const t = useTranslations('credits');
  if (lots.length === 0) return <EmptyState className="py-8" title={t('lots.empty')} />;
  return (
    <ul className="divide-y divide-border">
      {lots.map((lot) => (
        <LotDeCredits key={lot.id} lot={lot} maintenant={maintenant} />
      ))}
    </ul>
  );
}

/* ───────────────────────────── l'historique ───────────────────────────── */

/** L'objet d'une opération ; celui d'une mise en avant mène à son bien. */
function ObjetDOperation({ m }: { readonly m: CreditMovement }) {
  const l = useLectureDesCredits();
  const bien = m.boost?.property;
  if (!bien) return <>{l.objet(m)}</>;
  return (
    <Link href={`/app/properties/${bien.id}`} className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
      {l.objet(m)}
    </Link>
  );
}

/** Une opération au téléphone : objet et ± à droite, puis opération, date et motif (AC4 : 3 lignes au plus). */
export function LigneDOperation({ m }: { readonly m: CreditMovement }) {
  const l = useLectureDesCredits();
  return (
    <li data-slot="ligne-d-operation" className="px-4 py-3">
      <div className="flex items-baseline gap-3">
        <p className="min-w-0 flex-1 truncate text-corps leading-tight font-medium">
          <ObjetDOperation m={m} />
        </p>
        <Delta n={m.amount} className="flex-none text-corps" />
      </div>
      <p className="mt-1 line-clamp-2 text-ui text-muted-foreground">{l.detail(m)}</p>
    </li>
  );
}

/** L'historique du bureau : date, objet et détail, ± crédits. */
export function TableDeLHistorique({ mouvements }: { readonly mouvements: readonly CreditMovement[] }) {
  const t = useTranslations('credits');
  const f = useFormatteurs();
  const l = useLectureDesCredits();
  return (
    <div role="table" aria-label={t('movements.caption')}>
      <div role="rowgroup">
        {mouvements.map((m) => (
          <div
            key={m.id}
            role="row"
            className="grid min-h-[3.5rem] grid-cols-[4.75rem_minmax(0,1fr)_3.5rem] items-center gap-x-4 border-t border-border px-4 py-2 text-sm first:border-t-0"
          >
            <span role="cell" className="text-foreground tabular-nums">
              {f.jourMois(m.created_at)}
            </span>
            <span role="cell" className="min-w-0 leading-tight">
              <span className="block truncate font-medium">
                <ObjetDOperation m={m} />
              </span>
              <span className="mt-0.5 block truncate text-ui text-muted-foreground">{l.detail(m, { avecDate: false })}</span>
            </span>
            <span role="cell" className="text-right">
              <Delta n={m.amount} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Le pied d'un tableau paginé : « 1 à 5 sur 42 », la page, précédente et suivante. */
export function PiedDeTableau({ meta, onPage }: { readonly meta: PaginationMeta | undefined; readonly onPage: (page: number) => void }) {
  const t = useTranslations('credits');
  const tPagination = useTranslations('console.pagination');
  if (!meta || meta.total === 0) return null;
  const page = meta.current_page;
  const derniere = Math.max(1, meta.last_page);
  const debut = (page - 1) * meta.per_page + 1;
  const fin = Math.min(meta.total, page * meta.per_page);
  const bouton =
    'inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:opacity-60';
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
