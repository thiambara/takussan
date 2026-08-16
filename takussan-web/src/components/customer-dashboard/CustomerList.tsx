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
  CUSTOMER_STATUS_LABELS,
  PIPELINE_STAGE_LABELS,
} from '@/components/customer-form/options';

interface CustomerListProps {
  readonly page: PaginatedResponse<CustomerListItem>;
  readonly onTagClick?: (name: string) => void;
}

export function CustomerList({ page, onTagClick }: CustomerListProps) {
  const { data: customers, meta } = page;
  if (!customers || customers.length === 0) return <CustomersEmpty />;

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-xl bg-app-surface-1 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-app-surface-2/50 text-left text-xs uppercase tracking-wide text-app-ink-muted">
              <th className="px-4 py-3 font-semibold">Client</th>
              <th className="px-4 py-3 font-semibold">Contact</th>
              <th className="px-4 py-3 font-semibold">Tags</th>
              <th className="px-4 py-3 font-semibold">Pipeline</th>
              <th className="px-4 py-3 font-semibold">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-surface-2">
            {customers.map((customer) => (
              <tr key={customer.id}>
                <td className="px-4 py-3">
                  <Link
                    href={`/app/customers/${customer.id}`}
                    className="block font-semibold text-app-ink hover:text-app-topbar"
                  >
                    {customer.first_name} {customer.last_name}
                  </Link>
                  {customer.occupation ? (
                    <p className="text-xs text-app-ink-muted">{customer.occupation}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-app-ink-muted">
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
                    <span className="text-xs text-app-ink-muted">—</span>
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
              className="block rounded-xl bg-app-surface-1 p-4 transition-colors hover:bg-app-surface-2"
            >
              <p className="text-sm font-semibold text-app-ink">
                {customer.first_name} {customer.last_name}
              </p>
              <p className="text-xs text-app-ink-muted">
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

      <p className="text-xs text-app-ink-muted">
        {meta.total} client{meta.total > 1 ? 's' : ''} — page {meta.current_page} sur{' '}
        {meta.last_page}
      </p>
    </div>
  );
}

function PipelineBadge({
  stage,
}: {
  stage: CustomerListItem['pipeline_stage'];
}) {
  if (!stage) return <span className="text-xs text-app-ink-muted">—</span>;
  const label = PIPELINE_STAGE_LABELS[stage] ?? stage;
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-app-surface-3 bg-app-surface-2 text-app-ink',
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
  const label = CUSTOMER_STATUS_LABELS[status] ?? status;
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-app-surface-3 bg-app-surface-2 text-app-ink',
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
