'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CircleCheckBig, Play } from 'lucide-react';

import { DataState, DataTable, Pagination, StatusBadge, type DataTableColumn } from '@/components/console';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  fetchPaymentSummary,
  fetchPaymentSupervision,
  fetchWebhookLogs,
  replayWebhookLog,
} from '@/lib/queries/super-admin';
import type { PaymentProviderCounts, PaymentSupervisionRow, WebhookLog } from '@/types/super-admin';
import { ConfirmActionDialog } from './ConfirmActionDialog';

const PER_PAGE = 20;

/** Les fournisseurs que la console connaît ; un fournisseur inconnu s'affiche par sa valeur. */
const PROVIDERS = ['wave', 'orange_money', 'lemon_squeezy'] as const;

/** La phrase à retaper pour un rejeu. Non traduite, comme celles de `failed-jobs`. */
const REPLAY_PHRASE = 'REJOUER';

type Window = 'last_7_days' | 'last_30_days';
type ReasonFilter = '' | 'failed' | 'late';
type ChannelFilter = '' | 'payment' | 'sms' | 'whatsapp';

/**
 * TCK-602 — la console « Paiements » (ADR-0051).
 *
 * Trois lectures d'une même question, « quel argent n'arrive pas ? » : les compteurs par
 * fournisseur, les paiements en échec ou en retard, et le journal des webhooks — d'où un webhook
 * en échec ou non apparié se REJOUE, sous second facteur récent.
 *
 * « En échec » n'est pas recalculé ici : c'est la définition unique de
 * `PaymentSupervisionService`, côté API.
 */
export function PaymentsConsole() {
  return (
    <div className="space-y-8">
      <PaymentSummarySection />
      <PaymentListSection />
      <WebhookJournalSection />
    </div>
  );
}

function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value || 'all'}
          type="button"
          size="sm"
          variant={option.value === value ? 'default' : 'outline'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function useProviderLabel() {
  const t = useTranslations('superAdmin.payments');
  return (provider: string | null | undefined) =>
    provider && (PROVIDERS as readonly string[]).includes(provider) ? t(`providers.${provider}`) : (provider ?? t('providers.unknown'));
}

function PaymentSummarySection() {
  const t = useTranslations('superAdmin.payments');
  const tCommon = useTranslations('common');
  const providerLabel = useProviderLabel();
  const [window, setWindow] = useState<Window>('last_7_days');
  const summary = useQuery({ queryKey: ['super-admin', 'payments', 'summary'], queryFn: fetchPaymentSummary });

  const rows = Object.entries(summary.data?.data?.[window] ?? {}).map(([provider, counts]) => ({ provider, ...counts }));
  const columns: DataTableColumn<{ provider: string } & PaymentProviderCounts>[] = [
    { id: 'provider', header: t('summary.colProvider'), className: 'font-medium text-foreground', cell: (row) => providerLabel(row.provider) },
    { id: 'failed', header: t('summary.colFailed'), align: 'end', cell: (row) => row.failed },
    { id: 'late', header: t('summary.colLate'), align: 'end', cell: (row) => row.late },
    { id: 'unmatched', header: t('summary.colUnmatched'), align: 'end', cell: (row) => row.unmatched },
  ];

  return (
    <section className="space-y-3" aria-labelledby="payments-summary-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="payments-summary-title" className="font-display text-xl font-semibold text-foreground">
          {t('summary.title')}
        </h2>
        <ToggleGroup<Window>
          label={t('summary.windowLabel')}
          value={window}
          onChange={setWindow}
          options={[
            { value: 'last_7_days', label: t('summary.last7') },
            { value: 'last_30_days', label: t('summary.last30') },
          ]}
        />
      </div>
      <DataState
        loading={summary.isLoading}
        error={summary.isError ? t('loadError') : null}
        onRetry={() => void summary.refetch()}
        retryLabel={tCommon('actions.retry')}
        skeletonRows={3}
      >
        <DataTable
          caption={t('summary.caption')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.provider}
          rowProps={(row) => ({ 'data-testid': `payments-summary-${row.provider}` })}
        />
      </DataState>
    </section>
  );
}

function PaymentListSection() {
  const t = useTranslations('superAdmin.payments');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const providerLabel = useProviderLabel();
  const [reason, setReason] = useState<ReasonFilter>('failed');
  const [provider, setProvider] = useState<string>('');
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ['super-admin', 'payments', 'list', reason, provider, page],
    queryFn: () =>
      fetchPaymentSupervision({ status: reason || undefined, provider: provider || undefined, page, perPage: PER_PAGE }),
  });

  const columns: DataTableColumn<PaymentSupervisionRow>[] = [
    {
      id: 'reason',
      header: t('list.colReason'),
      cell: (row) => <StatusBadge label={t(`list.reasons.${row.reason}`)} tone={row.reason === 'failed' ? 'danger' : 'attention'} />,
    },
    { id: 'type', header: t('list.colType'), cell: (row) => t(`list.types.${row.type}`) },
    { id: 'reference', header: t('list.colReference'), className: 'font-mono text-xs', cell: (row) => row.reference_number ?? `#${row.id}` },
    { id: 'status', header: t('list.colStatus'), cell: (row) => row.status },
    { id: 'provider', header: t('list.colProvider'), cell: (row) => providerLabel(row.provider) },
    {
      id: 'amount',
      header: t('list.colAmount'),
      align: 'end',
      cell: (row) => (row.amount === null ? '' : fmt.montant(row.amount, row.currency ?? undefined)),
    },
    {
      id: 'at',
      header: t('list.colAt'),
      className: 'text-muted-foreground',
      cell: (row) => (row.reason === 'late' && row.due_date ? fmt.date(row.due_date) : row.event_at ? fmt.dateTime(row.event_at) : ''),
    },
  ];

  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  return (
    <section className="space-y-3" aria-labelledby="payments-list-title">
      <h2 id="payments-list-title" className="font-display text-xl font-semibold text-foreground">
        {t('list.title')}
      </h2>
      <div className="flex flex-wrap gap-4">
        <ToggleGroup<ReasonFilter>
          label={t('list.reasonLabel')}
          value={reason}
          onChange={change(setReason)}
          options={[
            { value: 'failed', label: t('list.reasons.failed') },
            { value: 'late', label: t('list.reasons.late') },
            { value: '', label: t('all') },
          ]}
        />
        <ToggleGroup<string>
          label={t('list.providerLabel')}
          value={provider}
          onChange={change(setProvider)}
          options={[{ value: '', label: t('all') }, ...PROVIDERS.map((p) => ({ value: p, label: providerLabel(p) }))]}
        />
      </div>
      <DataState
        loading={list.isLoading}
        error={list.isError ? t('loadError') : null}
        onRetry={() => void list.refetch()}
        retryLabel={tCommon('actions.retry')}
        skeletonRows={5}
        skeletonRowClassName="h-10"
      >
        <div className="space-y-4">
          <DataTable
            caption={t('list.caption')}
            columns={columns}
            rows={list.data?.data ?? []}
            rowKey={(row) => `${row.type}-${row.reason}-${row.id}`}
            rowProps={(row) => ({ 'data-testid': `payment-row-${row.type}-${row.id}` })}
            emptyState={
              <EmptyState
                className="border-0"
                icon={<CircleCheckBig className="size-8" aria-hidden="true" />}
                title={t('list.empty_title')}
                description={t('list.empty_description')}
              />
            }
          />
          <Pagination page={page} lastPage={list.data?.meta.last_page ?? 1} onChange={setPage} />
        </div>
      </DataState>
    </section>
  );
}

function WebhookJournalSection() {
  const t = useTranslations('superAdmin.payments');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const providerLabel = useProviderLabel();
  const messageErreur = useMessageErreurApi();
  const garde = useGardeDoubleFacteur();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<ChannelFilter>('payment');
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<WebhookLog | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const logs = useQuery({
    queryKey: ['super-admin', 'webhook-logs', channel, onlyUnmatched, page],
    queryFn: () => fetchWebhookLogs({ channel: channel || undefined, unmatched: onlyUnmatched, page, perPage: PER_PAGE }),
  });

  const replay = useMutation({
    mutationFn: (id: number) => avecGardeDoubleFacteur(() => replayWebhookLog(id), garde),
    onSuccess: (result) => {
      setPending(null);
      setActionError(null);
      setOutcome(t('journal.replayOutcome', { status: t(`journal.statuses.${result.data.status}`) }));
      return queryClient.invalidateQueries({ queryKey: ['super-admin'] });
    },
    onError: (err) => {
      setPending(null);
      setOutcome(null);
      setActionError(messageErreur(err, t('journal.replayError')));
    },
  });

  const statusTone = (status: string) =>
    status === 'processed' ? 'success' : status === 'failed' ? 'danger' : status === 'rejected' ? 'attention' : 'neutral';

  const columns: DataTableColumn<WebhookLog>[] = [
    {
      id: 'received',
      header: t('journal.colReceived'),
      className: 'text-muted-foreground',
      cell: (log) => (log.created_at ? fmt.dateTime(log.created_at) : ''),
    },
    {
      id: 'source',
      header: t('journal.colSource'),
      cell: (log) => `${t(`journal.channels.${log.channel}`)} · ${providerLabel(log.provider)}`,
    },
    {
      id: 'status',
      header: t('journal.colStatus'),
      cell: (log) => (
        <StatusBadge
          label={log.status === 'processed' && log.matched_count === 0 ? t('journal.unmatched') : t(`journal.statuses.${log.status}`)}
          tone={log.status === 'processed' && log.matched_count === 0 ? 'attention' : statusTone(log.status)}
        />
      ),
    },
    { id: 'http', header: t('journal.colHttp'), cell: (log) => log.http_status ?? '' },
    { id: 'error', header: t('journal.colError'), className: 'font-mono text-xs', cell: (log) => log.error_code ?? '' },
    { id: 'external', header: t('journal.colExternal'), className: 'max-w-48 truncate font-mono text-xs', cell: (log) => log.external_id ?? '' },
    {
      id: 'actions',
      header: t('journal.colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (log) =>
        log.replayable ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setPending(log)}>
            <Play className="size-4" aria-hidden="true" />
            {t('journal.replay')}
          </Button>
        ) : null,
    },
  ];

  return (
    <section className="space-y-3" aria-labelledby="webhook-journal-title">
      <div>
        <h2 id="webhook-journal-title" className="font-display text-xl font-semibold text-foreground">
          {t('journal.title')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('journal.retention')}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <ToggleGroup<ChannelFilter>
          label={t('journal.channelLabel')}
          value={channel}
          onChange={(value) => {
            setChannel(value);
            setPage(1);
          }}
          options={[
            { value: 'payment', label: t('journal.channels.payment') },
            { value: 'sms', label: t('journal.channels.sms') },
            { value: 'whatsapp', label: t('journal.channels.whatsapp') },
            { value: '', label: t('all') },
          ]}
        />
        <Button
          type="button"
          size="sm"
          variant={onlyUnmatched ? 'default' : 'outline'}
          aria-pressed={onlyUnmatched}
          onClick={() => {
            setOnlyUnmatched((value) => !value);
            setPage(1);
          }}
        >
          {t('journal.onlyUnmatched')}
        </Button>
      </div>

      {outcome ? (
        <p role="status" className="text-sm text-foreground" data-testid="webhook-replay-outcome">
          {outcome}
        </p>
      ) : null}
      {actionError ? (
        <ErrorState
          data-testid="webhook-replay-error"
          message={actionError}
          onRetry={() => setActionError(null)}
          retryLabel={tCommon('actions.close')}
        />
      ) : null}

      <DataState
        loading={logs.isLoading}
        error={logs.isError ? t('loadError') : null}
        onRetry={() => void logs.refetch()}
        retryLabel={tCommon('actions.retry')}
        skeletonRows={5}
        skeletonRowClassName="h-10"
      >
        <div className="space-y-4">
          <DataTable
            caption={t('journal.caption')}
            columns={columns}
            rows={logs.data?.data ?? []}
            rowKey={(log) => log.id}
            rowProps={(log) => ({ 'data-testid': `webhook-log-${log.id}` })}
            emptyState={
              <EmptyState
                className="border-0"
                icon={<CircleCheckBig className="size-8" aria-hidden="true" />}
                title={t('journal.empty_title')}
                description={t('journal.empty_description')}
              />
            }
          />
          <Pagination page={page} lastPage={logs.data?.meta.last_page ?? 1} onChange={setPage} />
        </div>
      </DataState>

      {pending ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={t('journal.confirmTitle')}
          description={t('journal.confirmDescription', {
            source: `${t(`journal.channels.${pending.channel}`)} · ${providerLabel(pending.provider)}`,
          })}
          confirmPhrase={REPLAY_PHRASE}
          confirmLabel={t('journal.replay')}
          pending={replay.isPending}
          onConfirm={() => replay.mutate(pending.id)}
        />
      ) : null}
    </section>
  );
}
