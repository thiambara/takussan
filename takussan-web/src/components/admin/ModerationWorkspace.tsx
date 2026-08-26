'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldAlert } from 'lucide-react';

import { EmptyState } from '@/components/feedback';

import { useAuth } from '@/context/AuthContext';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchModerationQueue,
  type ModerationReview,
  type ModerationStatus,
} from '@/lib/queries/reviews-moderation';
import { ModerationQueueList } from './ModerationQueueList';
import { ModerationDetail } from './ModerationDetail';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-292 — la DONNÉE porte la clé : les options transportent la valeur d'API
 * (le statut, ou le FQCN du sujet) et une clé de libellé ; le rendu la résout.
 */
const STATUS_KEYS = ['all', 'pending', 'flagged', 'approved', 'rejected'] as const;

const SUBJECT_TYPE_KEYS: ReadonlyArray<{ key: string; value: string }> = [
  { key: 'all', value: 'all' },
  { key: 'property', value: 'App\\Models\\Property' },
  { key: 'agency', value: 'App\\Models\\Agency' },
  { key: 'user', value: 'App\\Models\\User' },
];

export function ModerationWorkspace() {
  const t = useTranslations('admin.moderation.workspace');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const statusOptions = STATUS_KEYS.map((k) => ({ value: k, label: t(`status.${k}`) }));
  const subjectTypeOptions = SUBJECT_TYPE_KEYS.map((st) => ({
    value: st.value,
    label: t(`subjects.${st.key}`),
  }));
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<ModerationStatus | ''>('');
  const [reported, setReported] = useState<boolean>(false);
  const [subjectType, setSubjectType] = useState<string>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const queryKey = useMemo(
    () => ['reviews-moderation', 'queue', { status, reported, subjectType }],
    [status, reported, subjectType],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchModerationQueue(token ?? '', {
        status: status || undefined,
        reported: reported || undefined,
        subjectType: subjectType || undefined,
      }),
    enabled: Boolean(token),
  });

  const reviews = data?.data ?? [];
  const selected = reviews.find((r) => r.id === selectedId) ?? reviews[0] ?? null;

  const onModerated = () => {
    queryClient.invalidateQueries({ queryKey: ['reviews-moderation'] });
    setSelectedId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status || 'all'}
          onValueChange={(value) => setStatus(value === 'all' ? '' : ((value ?? '') as ModerationStatus | ''))}
          items={statusOptions}
        >
          <SelectTrigger className="h-9" aria-label={t('statusAria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subjectType || 'all'}
          onValueChange={(value) => setSubjectType(value === 'all' ? '' : (value ?? ''))}
          items={subjectTypeOptions}
        >
          <SelectTrigger className="h-9" aria-label={t('subjectAria')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {subjectTypeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={reported}
            onChange={(e) => setReported(e.target.checked)}
            className="size-4 rounded border-input"
          />
          {t('reportedOnly')}
        </label>
        {data?.meta ? (
          <p className="ml-auto text-xs text-muted-foreground">
            {t('queued', { count: String(data.meta.pending_count) })}
          </p>
        ) : null}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl bg-card p-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t('loading')}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-sm text-destructive">
          {messageErreur(error, t('loadError'))}
        </div>
      ) : reviews.length === 0 ? (
        <ModerationEmpty />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          <ModerationQueueList
            reviews={reviews}
            selectedId={selected?.id ?? null}
            onSelect={(r: ModerationReview) => setSelectedId(r.id)}
          />
          {selected ? (
            <ModerationDetail review={selected} onModerated={onModerated} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ModerationEmpty() {
  const t = useTranslations('admin.moderation.reviews');
  return (
    <EmptyState
      icon={<ShieldAlert className="size-8" aria-hidden="true" />}
      title={t('empty_title')}
      description={t('empty_description')}
    />
  );
}
