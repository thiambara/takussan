'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowRight, ScrollText } from 'lucide-react';

import { DataState } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { fetchAuditLog } from '@/lib/queries/super-admin';
import type { AuditLogEntry, AuditLogResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/** Le bas de l'accueil : ce qui vient de se passer, pas ce qu'on peut y chercher. */
const RECENT_ENTRIES = 5;

/**
 * TCK-360 — les cinq dernières entrées d'audit, en bas de l'accueil de la console.
 *
 * Délibérément SANS filtre ni pagination : c'est un aperçu, et il porte un lien vers
 * `/super-admin/audit` — qui est, lui, l'écran de recherche (`CrossTenantAuditTable`). Recopier
 * les filtres ici referait le doublon que ce ticket supprime par ailleurs entre l'accueil et
 * `/super-admin/system`.
 */
export function ConsoleRecentActivity() {
  const t = useTranslations('superAdmin.recentActivity');
  const messageErreur = useMessageErreurApi();

  const { data, isPending, isError, error } = useQuery<AuditLogResponse, ApiError>({
    queryKey: ['super-admin', 'audit', 'recent', RECENT_ENTRIES],
    queryFn: () => fetchAuditLog({ perPage: RECENT_ENTRIES }),
    staleTime: 30_000,
  });

  const entries = data?.data ?? [];

  return (
    <section aria-labelledby="super-admin-recent" className="rounded-xl bg-card ring-1 ring-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 id="super-admin-recent" className="font-display text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <Link
          href="/super-admin/audit"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('seeAll')}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="px-5 py-4">
        <DataState
          loading={isPending}
          error={isError ? messageErreur(error, t('error')) : null}
          isEmpty={entries.length === 0}
          skeletonRows={RECENT_ENTRIES}
          skeletonRowClassName="h-10"
          emptyState={
            <EmptyState
              icon={<ScrollText className="size-8" aria-hidden="true" />}
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          }
        >
          <ul className="space-y-3" data-testid="super-admin-recent-activity">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {entry.description ?? entry.event ?? t('unknownEvent')}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{causerOf(entry, t)}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {entry.created_at ? new Date(entry.created_at).toLocaleString() : '—'}
                </span>
              </li>
            ))}
          </ul>
        </DataState>
      </div>
    </section>
  );
}

function causerOf(
  entry: AuditLogEntry,
  t: ReturnType<typeof useTranslations<'superAdmin.recentActivity'>>,
): string {
  if (!entry.causer_type) return t('systemCauser');
  return `${entry.causer_type.split('\\').pop()} #${entry.causer_id}`;
}
