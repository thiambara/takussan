'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { EmptyState, ErrorState } from '@/components/feedback';
import { useAuth } from '@/context/AuthContext';
import type { Locale } from '@/i18n/config';
import { formatDate } from '@/lib/format';
import { AGENT_CRM_QUERY_KEY, fetchCustomerLinked, type LinkedKind } from '@/lib/queries/agent-crm';

const STATUS_NAMESPACE = {
  visits: 'visits.status',
  bookings: 'bookings.status',
  leases: 'lease.status',
} as const;

/** Écrites en entier : `routes-atteignables.test.ts` vérifie chaque chemin `/app` du front. */
const DETAIL_HREF: Record<LinkedKind, (id: number) => string> = {
  visits: (id) => `/app/visits/${id}`,
  bookings: (id) => `/app/bookings/${id}`,
  leases: (id) => `/app/leases/${id}`,
};

const KNOWN_STATUSES: Record<LinkedKind, ReadonlySet<string>> = {
  visits: new Set(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']),
  bookings: new Set(['pending', 'confirmed', 'rejected', 'cancelled', 'expired', 'completed']),
  leases: new Set(['draft', 'pending_signature', 'active', 'expired', 'terminating', 'terminated', 'renewed']),
};

interface CustomerLinkedRecordsProps {
  readonly customerId: number;
  readonly kind: LinkedKind;
}

/**
 * TCK-591 §4 — les visites, réservations et baux du client, sur sa fiche : l'agent n'a plus à
 * chercher dans trois listes ce qui concerne la personne qu'il a au téléphone.
 */
export function CustomerLinkedRecords({ customerId, kind }: CustomerLinkedRecordsProps) {
  const t = useTranslations('agentCrm.linked');
  const tStatus = useTranslations(STATUS_NAMESPACE[kind]);
  const locale = useLocale() as Locale;
  const { token } = useAuth();

  const query = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.linked(customerId, kind),
    queryFn: () => fetchCustomerLinked(token ?? '', customerId, kind),
    enabled: !!token,
  });

  if (query.isPending) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={t('loadFailed')} onRetry={() => void query.refetch()} retryLabel={t('retry')} />;
  }
  if (query.data.length === 0) {
    return <EmptyState icon={<CalendarDays className="size-8" aria-hidden="true" />} title={t(`empty.${kind}`)} />;
  }

  return (
    <ul className="space-y-2" data-testid={`customer-${kind}`}>
      {query.data.map((row) => (
        <li key={row.id} className="rounded-xl bg-card p-4 text-sm">
          <Link href={DETAIL_HREF[kind](row.id)} className="font-semibold text-foreground underline-offset-2 hover:underline">
            {row.property?.title ?? row.reference_number ?? t('untitled')}
          </Link>
          <p className="text-xs tabular-nums text-muted-foreground">
            {row.date ? formatDate(row.date, locale, { dateStyle: 'medium' }) : '—'}
            {row.end_date ? ` → ${formatDate(row.end_date, locale, { dateStyle: 'medium' })}` : ''}
            {' · '}
            {row.status && KNOWN_STATUSES[kind].has(row.status) ? tStatus(row.status) : t('unknownStatus')}
          </p>
        </li>
      ))}
    </ul>
  );
}
