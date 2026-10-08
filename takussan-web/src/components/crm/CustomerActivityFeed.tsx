'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { History, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import type { Locale } from '@/i18n/config';
import { formatDateTime } from '@/lib/format';
import { AGENT_CRM_QUERY_KEY, fetchCustomerActivity } from '@/lib/queries/agent-crm';
import type { CustomerActivityEntry } from '@/types/agent-crm';

const KNOWN_STAGES = new Set(['lead', 'prospect', 'qualified', 'negotiating', 'converted', 'lost']);
const KNOWN_FIELDS = new Set([
  'first_name', 'last_name', 'email', 'phone', 'occupation',
  'emergency_contact_name', 'emergency_contact_phone', 'status', 'pipeline_stage',
]);

interface CustomerActivityFeedProps {
  readonly customerId: number;
}

/**
 * TCK-591 — le journal de la fiche (client, notes, tâches) par `GET /api/customers/{id}/activity`.
 *
 * Il appelait `/api/audit-log`, réservé aux administrateurs : l'agent recevait 403, que le `catch`
 * transformait en liste vide — « aucune activité » pour une fiche qui en avait. **Une erreur se dit
 * ici, et se relance** ; elle ne se confond jamais avec un journal vide.
 *
 * Chaque entrée se dit en phrase (« Awa a fait passer le client de Lead à Prospect »), jamais en
 * noms de colonnes.
 */
export function CustomerActivityFeed({ customerId }: CustomerActivityFeedProps) {
  const t = useTranslations('agentCrm.activity');
  const tStage = useTranslations('crm.pipeline.stage');
  const locale = useLocale() as Locale;
  const { token } = useAuth();

  const query = useInfiniteQuery({
    queryKey: AGENT_CRM_QUERY_KEY.activity(customerId),
    queryFn: ({ pageParam }) => fetchCustomerActivity(token ?? '', customerId, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
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
    return (
      <ErrorState
        message={t('loadFailed')}
        onRetry={() => void query.refetch()}
        retryLabel={t('retry')}
      />
    );
  }

  const rows = query.data.pages.flatMap((p) => p.data);
  if (rows.length === 0) {
    return <EmptyState icon={<History className="size-8" aria-hidden="true" />} title={t('empty')} />;
  }

  const sentence = (row: CustomerActivityEntry): string => {
    const actor = row.causer?.name || t('someone');
    const after = row.changes.attributes ?? {};
    const before = row.changes.old ?? {};
    const title = String(after.title ?? before.title ?? '');

    if (row.subject === 'customer') {
      if (row.event === 'created' || row.event === 'deleted' || row.event === 'restored') {
        return t(`customer.${row.event}`, { actor });
      }
      const stage = (v: unknown) => (typeof v === 'string' && KNOWN_STAGES.has(v) ? tStage(v) : '—');
      if ('pipeline_stage' in after) {
        return t('customer.stage', { actor, from: stage(before.pipeline_stage), to: stage(after.pipeline_stage) });
      }
      const fields = Object.keys(after).filter((f) => KNOWN_FIELDS.has(f));
      return fields.length > 0
        ? t('customer.fields', { actor, fields: fields.map((f) => t(`fields.${f}`)).join(', ') })
        : t('customer.updated', { actor });
    }

    if (row.subject === 'note') {
      if (row.event === 'created' || row.event === 'deleted') return t(`note.${row.event}`, { actor });
      return after.pinned === true ? t('note.pinned', { actor }) : t('note.updated', { actor });
    }

    if (row.subject === 'task') {
      if (row.event === 'created' || row.event === 'deleted') return t(`task.${row.event}`, { actor, title });
      return after.status === 'done' ? t('task.done', { actor, title }) : t('task.updated', { actor, title });
    }

    return t('generic', { actor });
  };

  return (
    <div className="space-y-3">
      <ol className="space-y-2" data-testid="customer-activity">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-muted bg-card p-3 text-sm">
            <p className="text-pretty text-foreground">{sentence(row)}</p>
            <time className="block text-xs tabular-nums text-muted-foreground">
              {formatDateTime(row.created_at, locale)}
            </time>
          </li>
        ))}
      </ol>
      {query.hasNextPage ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {t('loadMore')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
