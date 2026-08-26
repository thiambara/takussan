import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';

import { CustomerTagChips } from '@/components/customer-dashboard/CustomerTagPicker';
import { EmptyState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';
import {
  customerStatusValues,
  pipelineStageValues,
} from '@/lib/schemas/customer';

interface CustomerListProps {
  readonly page: PaginatedResponse<CustomerListItem>;
  readonly onTagClick?: (name: string) => void;
}

export function CustomerList({ page, onTagClick }: CustomerListProps) {
  const t = useTranslations('crm.list');
  const { data: customers, meta } = page;
  if (!customers || customers.length === 0) return <CustomersEmpty />;

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-xl bg-card md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-semibold">{t('columns.client')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.contact')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.tags')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.pipeline')}</th>
              <th className="px-4 py-3 font-semibold">{t('columns.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-muted">
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/app/customers/${customer.id}`}
                    className="block font-semibold text-foreground hover:text-foreground"
                  >
                    {customer.first_name} {customer.last_name}
                  </Link>
                  {customer.occupation ? (
                    <p className="text-xs text-muted-foreground">{customer.occupation}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {customer.email ? (
                    <a href={`mailto:${customer.email}`} className="hover:underline">
                      {customer.email}
                    </a>
                  ) : null}
                  {customer.email && customer.phone ? <br /> : null}
                  {customer.phone ? (
                    <a href={`tel:${customer.phone}`} className="hover:underline">
                      {customer.phone}
                    </a>
                  ) : null}
                  {!customer.email && !customer.phone ? '—' : null}
                </td>
                <td className="px-4 py-3">
                  {customer.tags && customer.tags.length > 0 ? (
                    <CustomerTagChips tags={customer.tags} onTagClick={onTagClick} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <PipelineBadge stage={customer.pipeline_stage} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={customer.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
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
                <StatusBadge status={customer.status} />
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
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-border bg-muted text-foreground',
        stage === 'converted' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        stage === 'negotiating' && 'border-amber-200 bg-amber-50 text-amber-700',
        stage === 'lost' && 'border-red-200 bg-red-50 text-red-700',
        stage === 'qualified' && 'border-primary/30 bg-primary/5 text-primary',
      )}
    >
      {label}
    </Badge>
  );
}

function StatusBadge({ status }: { status: CustomerListItem['status'] }) {
  const t = useTranslations('crm.customerStatus');
  const label = (customerStatusValues as readonly string[]).includes(status) ? t(status) : status;
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-border bg-muted text-foreground',
        status === 'blocked' && 'border-red-200 bg-red-50 text-red-700',
        status === 'inactive' && 'border-stone-200 bg-stone-50 text-stone-700',
      )}
    >
      {label}
    </Badge>
  );
}

/**
 * `useTranslations` (et non `getTranslations`) : ce fichier n'a pas de `'use client'` et il est
 * rendu depuis `app/customers/page.tsx`, un server component. next-intl expose le hook dans les
 * deux mondes tant que le composant n'est pas `async` — ce qui est le cas ici.
 */
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
