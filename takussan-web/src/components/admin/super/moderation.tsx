'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ElementType } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, EyeOff, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { DataTable, StatCard, StatusBadge, type DataTableColumn } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { postModerationDecision } from '@/lib/queries/super-admin';
import type {
  AdminModerationItem,
  ModerationDecision,
  ModerationItemStatus,
  ModerationItemType,
} from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

const ALL = '__all__';

type AgencyOption = { id: number; name: string };

/**
 * TCK-292 — la donnée porte la CLÉ, le rendu la résout (`superAdmin.moderation.*`).
 * Les valeurs (`__all__`, `property`, `-reported_at`, …) restent des jetons d'URL et d'API :
 * elles ne se traduisent pas.
 */
const TYPE_VALUES: Array<{ value: typeof ALL | ModerationItemType; key: string }> = [
  { value: ALL, key: 'types.all' },
  { value: 'property', key: 'types.property' },
  { value: 'review', key: 'types.review' },
];

const STATUS_VALUES: Array<{ value: typeof ALL | ModerationItemStatus; key: string }> = [
  { value: ALL, key: 'statuses.all' },
  { value: 'pending', key: 'statuses.pending' },
  { value: 'flagged', key: 'statuses.flagged' },
];

const SORT_VALUES = [
  { value: '-reported_at', key: 'sorts.newest' },
  { value: 'reported_at', key: 'sorts.oldest' },
];

/**
 * TCK-292 — sentinelle de développement, JAMAIS affichée : `onError` lit `messageErreur(err)`,
 * qu'un `Error` nu ne porte pas, et le panneau sort en amont quand `item` est nul. Vérifié
 * plutôt que supposé — cf. le cas `new ApiError(401, { message: 'no token' })` du ticket, où
 * la même hypothèse était fausse.
 */
const SENTINELLE_SANS_ITEM = 'moderation:no-item-selected';

export function ModerationFilters({ agencies }: { agencies: AgencyOption[] }) {
  const t = useTranslations('superAdmin.moderation');
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentType = (searchParams.get('filter[type]') as ModerationItemType | null) ?? ALL;
  const currentStatus = (searchParams.get('filter[status]') as ModerationItemStatus | null) ?? ALL;
  const currentAgency = searchParams.get('filter[agency_id]') ?? ALL;
  const currentSort = searchParams.get('sort') ?? '-reported_at';

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === ALL) params.delete(key);
      else params.set(key, value);
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-border md:flex-row md:items-end md:justify-between">
      <div className="flex flex-wrap gap-2" aria-label={t('typesAria')}>
        {TYPE_VALUES.map((option) => {
          const active = currentType === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              variant={active ? 'default' : 'outline'}
              onClick={() => updateParam('filter[type]', option.value)}
              aria-pressed={active}
            >
              {t(option.key)}
            </Button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterSelect
          label={t('status')}
          value={currentStatus}
          options={STATUS_VALUES.map(({ value, key }) => ({ value, label: t(key) }))}
          onChange={(value) => updateParam('filter[status]', value)}
        />
        <FilterSelect
          label={t('agency')}
          value={currentAgency}
          options={[
            { value: ALL, label: t('allAgencies') },
            ...agencies.map((agency) => ({ value: String(agency.id), label: agency.name })),
          ]}
          onChange={(value) => updateParam('filter[agency_id]', value)}
        />
        <FilterSelect
          label={t('age')}
          value={currentSort}
          options={SORT_VALUES.map(({ value, key }) => ({ value, label: t(key) }))}
          onChange={(value) => updateParam('sort', value)}
        />
      </div>
    </div>
  );
}

export function ModerationQueueTable({
  items,
  selectedId,
  onSelect,
}: {
  items: AdminModerationItem[];
  selectedId: string | null;
  onSelect: (item: AdminModerationItem) => void;
}) {
  const t = useTranslations('superAdmin.moderation');

  const columns: DataTableColumn<AdminModerationItem>[] = [
    {
      id: 'subject',
      header: t('colSubject'),
      cell: (item) => (
        <>
          {item.subject ? (
            <Link href={item.subject.href} className="font-medium text-foreground hover:text-primary">
              {item.subject.title}
            </Link>
          ) : (
            <span className="font-medium text-foreground">{t('subjectUnavailable')}</span>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">{item.subject?.subtitle ?? item.id}</p>
        </>
      ),
    },
    {
      id: 'type',
      header: t('colType'),
      cell: (item) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={item.type === 'property' ? 'outline' : 'secondary'}>
            {item.type === 'property' ? t('typeProperty') : t('typeReview')}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {item.status === 'flagged' ? t('statusFlagged') : t('statusPending')}
          </span>
        </div>
      ),
    },
    { id: 'agency', header: t('colAgency'), cell: (item) => item.agency?.name ?? t('noAgency') },
    {
      id: 'reporter',
      header: t('colReporter'),
      cell: (item) => (
        <>
          <span className="block">{item.reporter?.name ?? t('anonymous')}</span>
          {item.reporter?.email ? (
            <span className="text-xs text-muted-foreground">{item.reporter.email}</span>
          ) : null}
        </>
      ),
    },
    {
      id: 'reason',
      header: t('colReason'),
      className: 'max-w-xs',
      cell: (item) => <span className="line-clamp-2">{item.reason}</span>,
    },
    {
      id: 'age',
      header: t('colAge'),
      className: 'text-muted-foreground',
      cell: (item) => formatAge(item.reported_at, t),
    },
    {
      id: 'action',
      header: t('colAction'),
      headerSrOnly: true,
      align: 'end',
      cell: (item) => (
        <Button type="button" variant="outline" size="sm" onClick={() => onSelect(item)}>
          {t('process')}
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      data-testid="moderation-queue-table"
      caption={t('tableCaption')}
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      rowProps={(item) => ({
        'data-testid': `moderation-item-${item.id}`,
        className: cn(selectedId === item.id && 'bg-muted'),
      })}
    />
  );
}

export function ModerationDecisionPanel({
  item,
  onDone,
}: {
  item: AdminModerationItem | null;
  onDone: () => void;
}) {
  const t = useTranslations('superAdmin.moderation');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ decision }: { decision: ModerationDecision }) => {
      if (!item) throw new Error(SENTINELLE_SANS_ITEM);
      return postModerationDecision(item.id, { decision, reason: reason.trim() });
    },
    onSuccess: () => {
      setReason('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'moderation'] });
      onDone();
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  const canSubmit = Boolean(item && reason.trim().length > 0 && !mutation.isPending);

  if (!item) {
    return (
      <aside className="rounded-xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border">
        <ShieldCheck className="mb-3 size-5 text-muted-foreground" aria-hidden="true" />
        {t('selectRow')}
      </aside>
    );
  }

  const actions: Array<{ decision: ModerationDecision; label: string; icon: ElementType; variant?: 'outline' | 'destructive' | 'default' }> = [
    { decision: 'approve', label: t('decisions.approve'), icon: CheckCircle2, variant: 'default' },
    { decision: 'hide', label: t('decisions.hide'), icon: EyeOff, variant: 'outline' },
    { decision: 'reject', label: t('decisions.reject'), icon: XCircle, variant: 'outline' },
    { decision: 'remove', label: t('decisions.remove'), icon: Trash2, variant: 'destructive' },
  ];

  return (
    <aside className="rounded-xl bg-card p-5 ring-1 ring-border" data-testid="moderation-decision-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t('decisionTitle')}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-foreground">
            {item.subject?.title ?? item.id}
          </h2>
        </div>
        <StatusBadge
          tone={item.status === 'flagged' ? 'danger' : 'attention'}
          label={item.status === 'flagged' ? t('statusFlagged') : t('statusPending')}
        />
      </div>

      <div className="mt-4 rounded-lg bg-muted p-3 text-sm text-foreground">
        {item.reason}
      </div>

      <label className="mt-4 block space-y-2 text-sm font-medium text-foreground">
        <span>{t('decisionReason')}</span>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t('decisionReasonPlaceholder')}
          rows={4}
        />
      </label>

      {error ? <ErrorState className="mt-3" message={error} /> : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Button
              key={action.decision}
              type="button"
              variant={action.variant}
              disabled={!canSubmit}
              onClick={() => mutation.mutate({ decision: action.decision })}
            >
              <Icon className="size-4" aria-hidden="true" />
              {action.label}
            </Button>
          );
        })}
      </div>
    </aside>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-40 text-xs font-medium text-muted-foreground">
      <span className="mb-1 block">{label}</span>
      <Select value={value} onValueChange={(next) => onChange((next ?? ALL) as string)} items={options}>
        <SelectTrigger className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

export function ModerationStats({ items, total }: { items: AdminModerationItem[]; total: number }) {
  const t = useTranslations('superAdmin.moderation');
  const stats = useMemo(() => {
    const properties = items.filter((item) => item.type === 'property').length;
    const reviews = items.filter((item) => item.type === 'review').length;
    const old = items.filter((item) => daysSince(item.reported_at) > 7).length;
    return { properties, reviews, old };
  }, [items]);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard label={t('statTotalPage')} value={total} />
      <StatCard label={t('statProperties')} value={stats.properties} />
      <StatCard label={t('statReviews')} value={stats.reviews} />
      {stats.old > 0 ? (
        <div className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary ring-1 ring-primary/20 sm:col-span-3">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />
          {t('staleWarning', { count: stats.old })}
        </div>
      ) : null}
    </div>
  );
}

export function formatAge(
  value: string | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const days = daysSince(value);
  if (days < 0) return '—';
  if (days === 0) return t('ageToday');
  if (days === 1) return t('ageOneDay');
  return t('ageDays', { days });
}

function daysSince(value: string | null): number {
  if (!value) return -1;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return -1;
  return Math.floor((Date.now() - timestamp) / 86_400_000);
}
