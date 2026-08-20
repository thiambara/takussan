'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ElementType } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, EyeOff, ShieldCheck, Trash2, XCircle } from 'lucide-react';
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
    <div className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-stone-200 md:flex-row md:items-end md:justify-between">
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
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-stone-200">
      <table className="min-w-full divide-y divide-stone-200 text-sm" data-testid="moderation-queue-table">
        <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
          <tr>
            <th scope="col" className="px-3 py-2">{t('colSubject')}</th>
            <th scope="col" className="px-3 py-2">{t('colType')}</th>
            <th scope="col" className="px-3 py-2">{t('colAgency')}</th>
            <th scope="col" className="px-3 py-2">{t('colReporter')}</th>
            <th scope="col" className="px-3 py-2">{t('colReason')}</th>
            <th scope="col" className="px-3 py-2">{t('colAge')}</th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">{t('colAction')}</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {items.map((item) => (
            <tr
              key={item.id}
              className={cn(selectedId === item.id ? 'bg-amber-50' : 'hover:bg-stone-50')}
              data-testid={`moderation-item-${item.id}`}
            >
              <td className="px-3 py-3">
                {item.subject ? (
                  <Link href={item.subject.href} className="font-medium text-stone-950 hover:text-primary">
                    {item.subject.title}
                  </Link>
                ) : (
                  <span className="font-medium text-stone-950">{t('subjectUnavailable')}</span>
                )}
                <p className="mt-0.5 text-xs text-stone-500">{item.subject?.subtitle ?? item.id}</p>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-col gap-1">
                  <Badge variant={item.type === 'property' ? 'outline' : 'secondary'}>
                    {item.type === 'property' ? t('typeProperty') : t('typeReview')}
                  </Badge>
                  <span className="text-xs text-stone-500">
                    {item.status === 'flagged' ? t('statusFlagged') : t('statusPending')}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-stone-700">{item.agency?.name ?? t('noAgency')}</td>
              <td className="px-3 py-3">
                <span className="block text-stone-800">{item.reporter?.name ?? t('anonymous')}</span>
                {item.reporter?.email ? <span className="text-xs text-stone-500">{item.reporter.email}</span> : null}
              </td>
              <td className="max-w-xs px-3 py-3 text-stone-700">
                <span className="line-clamp-2">{item.reason}</span>
              </td>
              <td className="px-3 py-3 text-stone-600">{formatAge(item.reported_at, t)}</td>
              <td className="px-3 py-3 text-right">
                <Button type="button" variant="outline" size="sm" onClick={() => onSelect(item)}>
                  {t('process')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <aside className="rounded-xl bg-white p-5 text-sm text-stone-600 ring-1 ring-stone-200">
        <ShieldCheck className="mb-3 size-5 text-stone-500" aria-hidden="true" />
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
    <aside className="rounded-xl bg-white p-5 ring-1 ring-stone-200" data-testid="moderation-decision-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {t('decisionTitle')}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-stone-950">
            {item.subject?.title ?? item.id}
          </h2>
        </div>
        <Badge variant={item.status === 'flagged' ? 'destructive' : 'outline'}>
          {item.status === 'flagged' ? t('statusFlagged') : t('statusPending')}
        </Badge>
      </div>

      <div className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
        {item.reason}
      </div>

      <label className="mt-4 block space-y-2 text-sm font-medium text-stone-800">
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
    <label className="min-w-40 text-xs font-medium text-stone-600">
      <span className="mb-1 block">{label}</span>
      <Select value={value} onValueChange={(next) => onChange((next ?? ALL) as string)} items={options}>
        <SelectTrigger className="w-full bg-white">
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
      <Stat label={t('statTotalPage')} value={total} />
      <Stat label={t('statProperties')} value={stats.properties} />
      <Stat label={t('statReviews')} value={stats.reviews} />
      {stats.old > 0 ? (
        <div className="sm:col-span-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <AlertTriangle className="mr-2 inline size-4" aria-hidden="true" />
          {t('staleWarning', { count: stats.old })}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-stone-950">{value}</p>
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
