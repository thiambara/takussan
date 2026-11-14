'use client';

import type { MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Phone } from 'lucide-react';

import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { StatusBadge } from '@/components/console/StatusBadge';
import { isReachable, telHref } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Button, buttonVariants } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { PaymentHistoryRow } from '@/types/invoice';

import { AvatarDuPayeur } from '../argent/LigneDEncaissement';
import { useNoterLaRelance } from './useNoterLaRelance';
import { useLectureDImpaye } from './lecture';
import { RETARD_GRAVE } from './tranches';
import { CLASSE_JAMAIS_EN_ALERTE, useJamaisRelanceEnAlerte } from './ton-de-la-relance';

/**
 * TCK-2660 — les impayés au bureau (`lg` et au-delà), maquette `TableImpayes` : Locataire · Bien ·
 * Bailleur · Montant dû · Retard · Dernière relance · gestes, trié par retard. Un clic sur la ligne
 * (ou sur le nom, au clavier) ouvre le dossier ; « Relancer » l'ouvre sur la relance.
 *
 * TCK-2682 — la première colonne coche l'échéance (relance en lot) ; l'en-tête coche ou décoche
 * toutes les échéances AFFICHÉES. Une rangée cochée prend le fond de la sélection, celle que la file
 * présente (`enCours`) un fond plus soutenu et `aria-current`. Pendant la file, ni coche ni dossier.
 * Sous 1440 px, le bailleur rejoint la ligne du bien (maquette `COLS_IMPAYES_ETROIT`).
 */
export function TableDesImpayes({
  rows,
  meta,
  totalDu,
  onPage,
  onOuvrir,
  selection,
  enCours = null,
}: {
  readonly rows: readonly PaymentHistoryRow[];
  readonly meta: { readonly current_page: number; readonly last_page: number; readonly total: number; readonly per_page: number } | undefined;
  readonly totalDu: string | null;
  readonly onPage: (page: number) => void;
  readonly onOuvrir: (row: PaymentHistoryRow, relancer: boolean) => void;
  /** TCK-2682 — la sélection à relancer ; absente : pas de colonne de coche. */
  readonly selection?: {
    readonly coche: (id: number) => boolean;
    readonly changer: (rows: readonly PaymentHistoryRow[], cochees: boolean) => void;
    /** La file tourne : la sélection est figée. */
    readonly figee: boolean;
  };
  /** TCK-2682 — l'échéance que la file présente. */
  readonly enCours?: number | null;
}) {
  const t = useTranslations('admin.finances.impayes');
  const tPagination = useTranslations('console.pagination');
  const l = useLectureDImpaye();
  const noter = useNoterLaRelance();
  const jamaisEnAlerte = useJamaisRelanceEnAlerte();
  const page = meta?.current_page ?? 1;
  const derniere = meta?.last_page ?? 1;
  const debut = (page - 1) * (meta?.per_page ?? 20) + 1;
  const fin = debut + rows.length - 1;

  const cochables = rows.filter((row) => row.source === 'lease');
  const toutes = cochables.length > 0 && cochables.every((row) => selection?.coche(row.id));
  const certaines = !toutes && cochables.some((row) => selection?.coche(row.id));

  const colonneDeCoche: DataTableColumn<PaymentHistoryRow> | null = selection
    ? {
        id: 'coche',
        header: (
          <span className="flex">
            <Checkbox
              checked={toutes}
              indeterminate={certaines}
              disabled={selection.figee || cochables.length === 0}
              onCheckedChange={() => selection.changer(cochables, !toutes)}
              aria-label={t('lot.toutCocher')}
            />
          </span>
        ),
        className: 'align-middle w-[2.125rem] pr-0',
        cell: (row) =>
          row.source === 'lease' ? (
            <span className="flex">
              <Checkbox
                checked={selection.coche(row.id)}
                disabled={selection.figee}
                onCheckedChange={(c) => selection.changer([row], c === true)}
                aria-label={t('lot.cocher', { nom: l.nom(row) })}
              />
            </span>
          ) : null,
      }
    : null;

  const colonnes: DataTableColumn<PaymentHistoryRow>[] = [
    ...(colonneDeCoche ? [colonneDeCoche] : []),
    {
      id: 'locataire',
      header: t('colonnes.locataire'),
      className: 'align-middle',
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <AvatarDuPayeur nom={l.nom(row)} taille="32" />
          <span className="min-w-0 leading-tight">
            <button
              type="button"
              onClick={() => onOuvrir(row, false)}
              aria-label={t('gestes.ouvrirDossier', { nom: l.nom(row) })}
              className="block max-w-full truncate rounded-sm text-left font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
            >
              {l.nom(row)}
            </button>
            <span className="mt-0.5 block truncate text-ui text-muted-foreground tabular-nums">{row.payer?.phone ?? t('sansTelephoneCourt')}</span>
          </span>
        </span>
      ),
    },
    {
      id: 'bien',
      header: t('colonnes.bien'),
      className: 'align-middle w-[22%] min-[90rem]:w-[19%]',
      cell: (row) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate">{l.bien(row) ?? '—'}</span>
          {row.landlord?.name ? <span className="mt-0.5 block truncate text-ui text-muted-foreground min-[90rem]:hidden">{row.landlord.name}</span> : null}
        </span>
      ),
    },
    {
      id: 'bailleur',
      header: t('colonnes.bailleur'),
      className: 'hidden align-middle min-[90rem]:table-cell min-[90rem]:w-[12%]',
      cell: (row) => <span className="block truncate text-encre-douce">{row.landlord?.name ?? '—'}</span>,
    },
    {
      id: 'montant',
      header: t('colonnes.montant'),
      align: 'end',
      className: 'align-middle w-[8.5rem]',
      cell: (row) => (
        <span className="block leading-tight">
          <span className="block font-semibold whitespace-nowrap tabular-nums">{l.montantDu(row)}</span>
          <span className="mt-0.5 block truncate text-ui text-muted-foreground">{l.periode(row, true)}</span>
        </span>
      ),
    },
    {
      id: 'retard',
      header: t('colonnes.retard'),
      className: 'align-middle w-[4.75rem]',
      cell: (row) => <StatusBadge tone={(row.days_late ?? 0) > RETARD_GRAVE ? 'danger' : 'attention'} label={t('retardCourt', { count: row.days_late ?? 0 })} />,
    },
    {
      id: 'relance',
      header: t('colonnes.relance'),
      className: 'align-middle w-[15%]',
      cell: (row) =>
        row.last_reminder ? (
          <span className="block min-w-0 leading-tight">
            <span className="block truncate">{l.relance(row)}</span>
            <span className="mt-0.5 block truncate text-ui text-muted-foreground">{l.canal(row.last_reminder)}</span>
          </span>
        ) : (
          <span className={jamaisEnAlerte ? CLASSE_JAMAIS_EN_ALERTE : 'text-muted-foreground'} data-slot="jamais-relance">
            {l.relance(row)}
          </span>
        ),
    },
    {
      id: 'gestes',
      header: t('colonnes.gestes'),
      headerSrOnly: true,
      className: 'align-middle w-[9.5rem]',
      cell: (row) => {
        const telephone = row.payer?.phone ?? null;
        return (
          <span className="flex items-center justify-end gap-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOuvrir(row, true)} className="gap-1.5">
              <IconeWhatsApp className="size-3.5 text-success lg:size-3.5" />
              {t('gestes.relancer')}
            </Button>
            {isReachable(telephone) ? (
              <a
                href={telHref(telephone)}
                aria-label={t('gestes.appelerNom', { nom: l.nom(row) })}
                onClick={() => noter.mutate({ paymentId: row.id, channel: 'call' })}
                className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'text-muted-foreground')}
              >
                <Phone className="size-4" aria-hidden="true" />
              </a>
            ) : null}
          </span>
        );
      },
    },
  ];

  /**
   * Un clic sur la ligne ouvre le dossier, sauf s'il part d'un bouton, d'un lien ou de la case (une
   * `span[role=checkbox]` de Base UI, pas un bouton) — et jamais pendant la file.
   */
  const clicDeLigne = (row: PaymentHistoryRow) => (event: MouseEvent<HTMLTableRowElement>) => {
    if (selection?.figee) return;
    if ((event.target as HTMLElement).closest('a, button, label, input, [role="checkbox"]')) return;
    onOuvrir(row, false);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="max-xl:overflow-x-auto">
        <div className="min-w-[56.25rem]">
          <DataTable
            caption={t('legende')}
            columns={colonnes}
            rows={rows}
            rowKey={(row) => `${row.source}-${row.id}`}
            rowProps={(row) => ({
              onClick: clicDeLigne(row),
              className: cn(
                'cursor-pointer',
                selection?.coche(row.id) && 'bg-primary/5 hover:bg-primary/7',
                enCours === row.id && 'bg-primary/10 hover:bg-primary/10',
              ),
              'data-slot': 'rangee-impaye',
              'data-cochee': selection?.coche(row.id) ? '' : undefined,
              'aria-current': enCours === row.id ? 'true' : undefined,
            })}
            className="rounded-none border-0 [&_table]:table-fixed"
          />
        </div>
      </div>
      <div className="flex h-12 items-center gap-3 border-t border-border px-4 text-ui text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">
          {totalDu ? t('piedAvecTotal', { debut, fin, total: meta?.total ?? rows.length, montant: totalDu }) : t('pied', { debut, fin, total: meta?.total ?? rows.length })}
        </span>
        <span className="tabular-nums">{tPagination('positionSlash', { page: String(page), lastPage: String(derniere) })}</span>
        <button
          type="button"
          aria-label={tPagination('previous')}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:opacity-60"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={tPagination('next')}
          disabled={page >= derniere}
          onClick={() => onPage(page + 1)}
          className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:opacity-60"
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
