'use client';

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, ShieldAlert } from 'lucide-react';

import { EmptyState } from '@/components/feedback';

import { useAuth } from '@/context/AuthContext';
import { FilterBar, Pagination } from '@/components/console';
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

import { useEtatUrl } from '@/hooks/useEtatUrl';
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

/**
 * Les clés d'URL portent le NOM DU FILTRE D'API, pas un alias.
 *
 * `/admin/team` et `/admin/users` avaient déjà tranché ainsi (`filter[role]`, `filter[status]`) :
 * une URL qu'on lit dit alors ce que la requête demande, et il n'existe pas de table de
 * correspondance à tenir entre deux vocabulaires.
 */
const P_STATUT = 'filter[moderation_status]';
const P_SIGNALES = 'filter[reported]';
const P_SUJET = 'filter[subject_type]';

const PAR_PAGE = 20;

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

  // TCK-376 — l'état vit dans l'URL, plus dans quatre `useState`. Un rechargement le gardait
  // pour zéro écran ; un lien collé n'en transportait rien.
  const url = useEtatUrl();
  const status = url.lire(P_STATUT) as ModerationStatus | '';
  const reported = url.lireBooleen(P_SIGNALES);
  const subjectType = url.lire(P_SUJET);
  const page = url.page;
  const selectedId = Number.parseInt(url.lire('selected'), 10) || null;

  const queryKey = useMemo(
    () => ['reviews-moderation', 'queue', { status, reported, subjectType, page }],
    [status, reported, subjectType, page],
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () =>
      fetchModerationQueue(token ?? '', {
        status: status || undefined,
        reported: reported || undefined,
        subjectType: subjectType || undefined,
        page,
        perPage: PAR_PAGE,
      }),
    enabled: Boolean(token),
  });

  const reviews = data?.data ?? [];
  const selected = reviews.find((r) => r.id === selectedId) ?? reviews[0] ?? null;
  const meta = data?.meta;

  const onModerated = () => {
    queryClient.invalidateQueries({ queryKey: ['reviews-moderation'] });
    url.selectionner(null);
  };

  return (
    <div className="space-y-4">
      <FilterBar
        controlsClassName="flex flex-wrap items-center gap-3"
        resultCount={meta ? t('queued', { count: String(meta.pending_count) }) : undefined}
      >
        <Select
          value={status || 'all'}
          onValueChange={(value) =>
            url.poserFiltres({ [P_STATUT]: value === 'all' ? null : (value ?? null) })
          }
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
          onValueChange={(value) =>
            url.poserFiltres({ [P_SUJET]: value === 'all' ? null : (value ?? null) })
          }
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
            onChange={(e) => url.poserFiltres({ [P_SIGNALES]: e.target.checked ? '1' : null })}
            className="size-4 rounded border-input"
          />
          {t('reportedOnly')}
        </label>
      </FilterBar>

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
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <ModerationQueueList
              reviews={reviews}
              selectedId={selected?.id ?? null}
              onSelect={(r: ModerationReview) => url.selectionner(r.id)}
            />
            {selected ? (
              <ModerationDetail review={selected} onModerated={onModerated} />
            ) : null}
          </div>
          {/*
            `Pagination` ne rend rien à `lastPage <= 1` : l'écran d'une file courte est
            exactement celui d'avant. La file LONGUE, elle, avait une fin inatteignable — la
            requête ne portait aucun `page`, donc la première réponse était tout ce qui serait
            jamais montré.
          */}
          {meta ? (
            <Pagination
              page={page}
              lastPage={meta.last_page}
              onChange={url.allerALaPage}
            />
          ) : null}
        </>
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
