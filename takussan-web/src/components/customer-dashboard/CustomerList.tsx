'use client';

/**
 * ⚠ `'use client'` est PORTANT (revue design 2026-09-16) : ce composant est rendu depuis
 * `app/customers/(liste)/page.tsx`, un server component, et passe à `DataTable` (client) des
 * FONCTIONS — `cell`, `rowKey`. Sans la directive, React refuse de les sérialiser à la frontière
 * (« Functions cannot be passed directly to Client Components ») et `/app/customers` rendait
 * l'écran de panne du dashboard depuis TCK-380 (2026-08-27). Les tests jsdom ne franchissent
 * aucune frontière RSC : ils étaient verts.
 */
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';

import { DataTable, type DataTableColumn, StatusBadge } from '@/components/console';
import { CustomerTagChips } from '@/components/customer-dashboard/CustomerTagPicker';
import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';
import {
  customerStatusValues,
  pipelineStageValues,
} from '@/lib/schemas/customer';
import { CUSTOMER_STATUS_TONE, PIPELINE_STAGE_TONE } from '@/components/customer-form/options';

interface CustomerListProps {
  readonly page: PaginatedResponse<CustomerListItem>;
  readonly onTagClick?: (name: string) => void;
}

export function CustomerList({ page, onTagClick }: CustomerListProps) {
  const t = useTranslations('crm.list');
  const { data: customers, meta } = page;
  if (!customers || customers.length === 0) return <CustomersEmpty />;

  /**
   * Les colonnes, dans l'ORDRE EXACT de la table faite main qu'elles remplacent
   * (client · contact · étiquettes · pipeline · statut), éprouvé par test.
   *
   * ⚠ La liste de CARTES sous `lg` reste une liste de cartes : `DataTable` remplace la table du
   * bureau, pas la forme mobile — cf. la Direction UX de TCK-380, « ne pas convertir en table ce
   * qui se lit mieux en cartes ». Le seuil est `lg` et non `md` : sous la barre latérale, 768 ne
   * laisse que 464 px, et la table y coupait les colonnes pipeline et statut (TCK-505).
   */
  const colonnes: readonly DataTableColumn<CustomerListItem>[] = [
    {
      id: 'client',
      header: t('columns.client'),
      cell: (customer) => (
        <>
          <Link
            href={`/app/customers/${customer.id}`}
            className="block font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {customer.first_name} {customer.last_name}
          </Link>
          {customer.occupation ? (
            <p className="text-xs text-muted-foreground">{customer.occupation}</p>
          ) : null}
        </>
      ),
    },
    {
      id: 'contact',
      header: t('columns.contact'),
      className: 'text-muted-foreground',
      cell: (customer) => (
        <>
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="hover:underline">
              {customer.email}
            </a>
          ) : null}
          {customer.email && customer.phone ? <br /> : null}
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="tabular-nums hover:underline">
              {customer.phone}
            </a>
          ) : null}
          {!customer.email && !customer.phone ? '—' : null}
        </>
      ),
    },
    {
      id: 'tags',
      header: t('columns.tags'),
      cell: (customer) =>
        customer.tags && customer.tags.length > 0 ? (
          <CustomerTagChips tags={customer.tags} onTagClick={onTagClick} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: 'pipeline',
      header: t('columns.pipeline'),
      cell: (customer) => <PipelineBadge stage={customer.pipeline_stage} />,
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (customer) => <CustomerStatusBadge status={customer.status} />,
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        className="hidden lg:block"
        caption={t('caption')}
        columns={colonnes}
        rows={customers}
        rowKey={(customer) => customer.id}
      />

      <ul className="space-y-3 lg:hidden">
        {customers.map((customer) => (
          <li key={customer.id}>
            <Link
              href={`/app/customers/${customer.id}`}
              className="block rounded-xl bg-card p-4 transition-colors hover:bg-muted"
            >
              <p className="text-sm font-semibold text-foreground">
                {customer.first_name} {customer.last_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {customer.email ?? customer.phone ?? '—'}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <PipelineBadge stage={customer.pipeline_stage} />
                <CustomerStatusBadge status={customer.status} />
              </div>
              {customer.tags && customer.tags.length > 0 && (
                <div className="mt-1.5">
                  <CustomerTagChips tags={customer.tags} onTagClick={onTagClick} />
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">
        {t('pagination', {
          total: meta.total,
          page: meta.current_page,
          pages: meta.last_page,
        })}
      </p>
    </div>
  );
}

function PipelineBadge({
  stage,
}: {
  stage: CustomerListItem['pipeline_stage'];
}) {
  const t = useTranslations('crm.pipeline.stage');
  if (!stage) return <span className="text-xs text-muted-foreground">—</span>;
  // Repli sur le jeton brut : même invariant que le `?? stage` d'avant, pour une
  // valeur de fil que le front ne connaîtrait pas.
  const label = (pipelineStageValues as readonly string[]).includes(stage) ? t(stage) : stage;
  return <StatusBadge label={label} tone={PIPELINE_STAGE_TONE[stage] ?? 'neutral'} />;
}

function CustomerStatusBadge({ status }: { status: CustomerListItem['status'] }) {
  const t = useTranslations('crm.customerStatus');
  const label = (customerStatusValues as readonly string[]).includes(status) ? t(status) : status;
  return <StatusBadge label={label} tone={CUSTOMER_STATUS_TONE[status] ?? 'neutral'} />;
}

function CustomersEmpty() {
  const t = useTranslations('crm.list');
  return (
    <EmptyState
      icon={<UserPlus className="size-8" aria-hidden="true" />}
      title={t('empty_title')}
      description={t('empty_description')}
      action={
        <Link href="/app/customers/new" className={buttonVariants()}>
          {t('empty_cta')}
        </Link>
      }
    />
  );
}
