'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { ClipboardCheck } from 'lucide-react';

import { useAgencyOnboardingPending } from '@/lib/queries/tenant-onboarding';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { TenantOnboardingChecklist } from '@/types/tenant-onboarding';

/**
 * TCK-266 — Liste agence des checklists d'onboarding ouvertes > 7 j.
 *
 * Côté serveur le filtre `created_at < now()-7d` est appliqué dans le
 * controller, donc on n'a rien à recalculer ici. On affiche pour chaque
 * ligne : référence du bail, date de signature, jours écoulés, items
 * manquants. Au-delà de 14 j, badge "destructive" pour signaler une
 * relance prioritaire.
 */
type Props = { agencyId: number };

type Row = TenantOnboardingChecklist & { lease?: { reference_number: string | null; signed_at: string | null } | null };

const CHECK_FIELDS = {
  welcome_seen_at: true,
  inventory_completed_at: true,
  first_payment_at: true,
  documents_acknowledged_at: true,
};

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return 0;
  const diffMs = Date.now() - created;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * La donnée porte la CLÉ (`agency.tenantOnboardingPending.items.*`), le rendu la résout — patron
 * posé par TCK-286. Une table de libellés hors composant ne peut pas appeler `useTranslations`.
 */
function missingItems(row: Row, label: (field: string) => string): string[] {
  return (Object.keys(CHECK_FIELDS) as Array<keyof typeof CHECK_FIELDS>)
    .filter((field) => row[field as keyof TenantOnboardingChecklist] == null)
    .map((field) => label(field));
}

export function TenantOnboardingPendingList({ agencyId }: Props) {
  const t = useTranslations('agency.tenantOnboardingPending');
  const locale = useLocale() as Locale;
  const query = useAgencyOnboardingPending({ agencyId, per_page: 30 });

  return (
    <QueryBoundary
      query={query}
      loadingFallback={[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-app-surface-1" />
      ))}
    >
      {(data) => {
        const rows = (data.data ?? []) as Row[];

        if (rows.length === 0) {
          return (
            <EmptyState
              icon={<ClipboardCheck className="size-8" aria-hidden="true" />}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          );
        }

        return (
          <ul className="space-y-3">
            {rows.map((row) => {
              const days = daysSince(row.created_at);
              const missing = missingItems(row, (field) => t(`items.${field}`));
              const reference = row.lease?.reference_number ?? `#${row.lease_id}`;
              const signedAt = row.lease?.signed_at ?? row.created_at;

              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-app-border bg-app-surface-1 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/app/leases/${row.lease_id}`}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {t('leaseReference', { reference })}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('signedAt', { date: formatDate(signedAt ?? '', locale) })}
                      </p>
                      {missing.length > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t('missing', { items: missing.join(' · ') })}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={days > 14 ? 'destructive' : 'outline'}>
                      {t('daysOpen', { count: days })}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        );
      }}
    </QueryBoundary>
  );
}
