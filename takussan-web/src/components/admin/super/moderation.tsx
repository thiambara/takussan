'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ElementType } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Copy, EyeOff, Hand, ShieldCheck, Sparkles, Trash2, XCircle } from 'lucide-react';
import { AgencyCombobox } from '@/components/admin/super/AgencyCombobox';
import { DataTable, FilterBar, StatCard, StatusBadge, type DataTableColumn } from '@/components/console';
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
import { WarningBanner } from '@/components/ui/warning-banner';
import {
  claimModerationItem,
  postModerationDecision,
  postModerationDecisionBatch,
  releaseModerationItem,
} from '@/lib/queries/super-admin';
import type {
  AdminModerationItem,
  ModerationBatchResult,
  ModerationDecision,
  ModerationDecisionPayload,
  ModerationItemStatus,
  ModerationItemType,
  ModerationSourceType,
} from '@/types/super-admin';
import {
  MODERATION_REASON_CODES,
  reasonTextRequired,
  type ModerationReasonCode,
} from '@/lib/moderation-reasons';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

const ALL = '__all__';

/**
 * Les paramètres d'URL que la barre pose. `sort` en fait partie : il est présenté ici comme un
 * filtre (« Ancienneté »), et « réinitialiser » doit donc le reprendre aussi.
 */
const PARAMS_DE_FILTRE = ['filter[type]', 'filter[status]', 'filter[agency_id]', 'sort'] as const;

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

/**
 * TCK-363 — le sélecteur d'agence recevait 50 agences en prop, chargées au montage de la page,
 * et n'annonçait jamais ce qu'il coupait. Il est remplacé par `AgencyCombobox` (recherche
 * serveur, chargement à la demande). La barre porte désormais le compte de résultats et la
 * remise à zéro, qu'aucune barre de la console n'avait.
 */
export function ModerationFilters({ total }: { total?: number }) {
  const t = useTranslations('superAdmin.moderation');
  const tFiltres = useTranslations('console.filterBar');
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

  const filtresPoses = PARAMS_DE_FILTRE.some((cle) => (searchParams.get(cle) ?? '') !== '');
  // TCK-363 (D8) — le bouton est actif dès que le geste FERAIT quelque chose : `reinitialiser()`
  // vide l'URL, donc la pagination aussi. Sur `?page=7` sans filtre, un bouton désactivé disait
  // à l'utilisateur qu'il était déjà à l'état par défaut alors qu'il était page 7.
  const surPageInterieure = (searchParams.get('page') ?? '1') !== '1';
  const reinitialiser = useCallback(() => router.replace('?'), [router]);

  return (
    <FilterBar
      data-testid="super-admin-moderation-filters"
      controlsClassName="md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4"
      resultCount={total === undefined ? undefined : tFiltres('results', { count: total })}
      onReset={reinitialiser}
      resetLabel={tFiltres('reset')}
      resetDisabled={!filtresPoses && !surPageInterieure}
    >
      <div className="flex flex-wrap items-center gap-2" aria-label={t('typesAria')}>
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

      <FilterSelect
        label={t('status')}
        value={currentStatus}
        options={STATUS_VALUES.map(({ value, key }) => ({ value, label: t(key) }))}
        onChange={(value) => updateParam('filter[status]', value)}
      />
      {/* Même intitulé visible que les deux sélecteurs voisins : sans lui, le champ se posait
          20 px plus haut qu'eux sur la même rangée. Le nom accessible reste l'`aria-label`. */}
      <div className="min-w-40 text-xs font-medium text-muted-foreground">
        <span className="mb-1 block" aria-hidden="true">{t('agency')}</span>
        <AgencyCombobox
          value={currentAgency === ALL ? '' : currentAgency}
          onChange={(next) => updateParam('filter[agency_id]', next || ALL)}
          label={t('agency')}
        />
      </div>
      <FilterSelect
        label={t('age')}
        value={currentSort}
        options={SORT_VALUES.map(({ value, key }) => ({ value, label: t(key) }))}
        onChange={(value) => updateParam('sort', value)}
      />
    </FilterBar>
  );
}

export function ModerationQueueTable({
  items,
  selectedId,
  onSelect,
  checkedIds,
  onToggleChecked,
}: {
  items: AdminModerationItem[];
  selectedId: string | null;
  onSelect: (item: AdminModerationItem) => void;
  /** TCK-597 — la sélection multiple, pour traiter le spam évident en lot. */
  checkedIds: ReadonlySet<string>;
  onToggleChecked: (ids: string[], checked: boolean) => void;
}) {
  const t = useTranslations('superAdmin.moderation');
  const locale = useLocale() as Locale;
  const allChecked = items.length > 0 && items.every((item) => checkedIds.has(item.id));

  const columns: DataTableColumn<AdminModerationItem>[] = [
    {
      id: 'select',
      header: (
        <input
          type="checkbox"
          className="size-4 rounded border-input"
          aria-label={t('selectAll')}
          checked={allChecked}
          onChange={(e) => onToggleChecked(items.map((item) => item.id), e.target.checked)}
        />
      ),
      cell: (item) => (
        <input
          type="checkbox"
          className="size-4 rounded border-input"
          aria-label={t('selectItem', { subject: item.subject?.title ?? item.id })}
          checked={checkedIds.has(item.id)}
          onChange={(e) => onToggleChecked([item.id], e.target.checked)}
        />
      ),
    },
    {
      id: 'subject',
      header: t('colSubject'),
      className: 'min-w-48',
      cell: (item) => (
        <>
          {item.subject ? (
            <Link href={item.subject.href} className="rounded-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
            {t(`sources.${item.source_type}`)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {item.status === 'flagged' ? t('statusFlagged') : t('statusPending')}
          </span>
          {item.suspicious ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
              <Sparkles className="size-3" aria-hidden="true" />
              {t('suspicious')}
            </span>
          ) : null}
        </div>
      ),
    },
    { id: 'agency', header: t('colAgency'), className: 'min-w-32', cell: (item) => item.agency?.name ?? t('noAgency') },
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
      id: 'claim',
      header: t('colClaim'),
      className: 'min-w-32 text-xs',
      cell: (item) => (item.claim && claimActive(item.claim) ? (
        <span className="inline-flex items-center gap-1 text-foreground">
          <Hand className="size-3" aria-hidden="true" />
          {t('claimedBy', {
            name: item.claim.by.name ?? '—',
            time: item.claim.claimed_at ? formatDateTime(item.claim.claimed_at, locale) : '—',
          })}
        </span>
      ) : (
        <span className="text-muted-foreground">{t('unclaimed')}</span>
      )),
    },
    {
      id: 'age',
      header: t('colAge'),
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (item) => formatAge(item.age_minutes, t),
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

/** Une prise expirée ne tient plus personne : l'API la laisse reprendre. */
function claimActive(claim: NonNullable<AdminModerationItem['claim']>): boolean {
  return claim.expires_at === null || new Date(claim.expires_at).getTime() > Date.now();
}

const DECISION_ICONS: Record<ModerationDecision, ElementType> = {
  approve: CheckCircle2,
  hide: EyeOff,
  reject: XCircle,
  remove: Trash2,
};

const DECISION_VARIANTS: Record<ModerationDecision, 'outline' | 'destructive' | 'default'> = {
  approve: 'default',
  hide: 'outline',
  reject: 'outline',
  remove: 'destructive',
};

/** « Masquer l'annonce » pose le verrou plateforme : l'écran le dit (ADR-0043 §4). */
function hidesListing(source: ModerationSourceType, decision: ModerationDecision): boolean {
  return decision === 'hide' && (source === 'property_report' || source === 'suspected_duplicate');
}

/**
 * Le motif d'une décision : un code choisi dans une liste traduite, et un complément libre
 * facultatif — obligatoire pour « autre ». Partagé par la décision seule et la décision en lot.
 */
function ReasonFields({
  idPrefix,
  code,
  onCode,
  text,
  onText,
}: {
  idPrefix: string;
  code: ModerationReasonCode | '';
  onCode: (code: ModerationReasonCode | '') => void;
  text: string;
  onText: (text: string) => void;
}) {
  const t = useTranslations('superAdmin.moderation');
  const tReasons = useTranslations('common.moderationReasons');
  const options = MODERATION_REASON_CODES.map((value) => ({ value, label: tReasons(value) }));
  return (
    <>
      <label className="block space-y-2 text-sm font-medium text-foreground">
        <span>{t('reasonCode')}</span>
        <Select value={code} onValueChange={(v) => onCode((v as ModerationReasonCode | null) ?? '')} items={options}>
          <SelectTrigger className="w-full bg-card" aria-label={t('reasonCode')}>
            <SelectValue placeholder={t('reasonCodePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label htmlFor={`${idPrefix}-reason`} className="block space-y-2 text-sm font-medium text-foreground">
        <span>{reasonTextRequired(code) ? t('decisionReasonRequired') : t('decisionReason')}</span>
      </label>
      <Textarea
        id={`${idPrefix}-reason`}
        value={text}
        onChange={(event) => onText(event.target.value)}
        placeholder={t('decisionReasonPlaceholder')}
        rows={3}
        maxLength={1000}
      />
    </>
  );
}

function payloadOf(decision: ModerationDecision, code: ModerationReasonCode | '', text: string): ModerationDecisionPayload {
  return decision === 'approve'
    ? { decision, reason: text.trim() || undefined }
    : { decision, reason_code: code || undefined, reason: text.trim() || undefined };
}

/** Le motif est complet : approuver n'en demande pas ; « autre » demande le texte. */
function reasonComplete(decision: ModerationDecision, code: ModerationReasonCode | '', text: string): boolean {
  if (decision === 'approve') return true;
  if (code === '') return false;
  return !reasonTextRequired(code) || text.trim().length > 0;
}

export function ModerationDecisionPanel({
  item,
  onDone,
}: {
  item: AdminModerationItem | null;
  onDone: () => void;
}) {
  const t = useTranslations('superAdmin.moderation');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [code, setCode] = useState<ModerationReasonCode | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ decision }: { decision: ModerationDecision }) => {
      if (!item) throw new Error(SENTINELLE_SANS_ITEM);
      return postModerationDecision(item.id, payloadOf(decision, code, reason));
    },
    onSuccess: () => {
      setCode('');
      setReason('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'moderation'] });
      onDone();
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  // TCK-597 (ADR-0043 §7) — prendre en charge avant de lire : un second modérateur voit le nom
  // et l'heure, et l'API lui refuse la décision tant que la prise court.
  const claim = useMutation({
    mutationFn: async (action: 'claim' | 'release'): Promise<void> => {
      if (!item) throw new Error(SENTINELLE_SANS_ITEM);
      if (action === 'claim') await claimModerationItem(item.id);
      else await releaseModerationItem(item.id);
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'moderation'] });
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  if (!item) {
    return (
      <aside className="rounded-xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border">
        <ShieldCheck className="mb-3 size-5 text-muted-foreground" aria-hidden="true" />
        {t('selectRow')}
      </aside>
    );
  }

  const heldClaim = item.claim && claimActive(item.claim) ? item.claim : null;
  const mine = heldClaim !== null && heldClaim.by.id === user?.id;
  const heldByOther = heldClaim !== null && !mine;

  return (
    <aside className="rounded-xl bg-card p-5 ring-1 ring-border" data-testid="moderation-decision-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t('decisionTitle')} · {t(`sources.${item.source_type}`)}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold text-foreground">
            {item.subject?.title ?? item.id}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('ageLabel', { age: formatAge(item.age_minutes, t) })}</p>
        </div>
        <StatusBadge
          tone={item.status === 'flagged' ? 'danger' : 'attention'}
          label={item.status === 'flagged' ? t('statusFlagged') : t('statusPending')}
        />
      </div>

      <div className="mt-4 rounded-lg bg-muted p-3 text-sm text-foreground">
        {item.reason}
      </div>

      {item.suspicious ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-destructive">
          <Sparkles className="size-4" aria-hidden="true" />
          {t('suspiciousHint')}
        </p>
      ) : null}

      {item.duplicate ? (
        <div className="mt-3 rounded-lg border border-border p-3 text-sm text-foreground" data-testid="moderation-duplicate">
          <p className="inline-flex items-center gap-1.5 font-medium">
            <Copy className="size-4" aria-hidden="true" />
            {t(`duplicateSignal.${item.duplicate.signal}`, { distance: item.duplicate.distance ?? 0 })}
          </p>
          {item.duplicate.matched ? (
            <p className="mt-1 text-muted-foreground">
              {t('duplicateOf', {
                title: item.duplicate.matched.title,
                agency: item.duplicate.matched.agency ?? t('noAgency'),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="moderation-claim">
        {heldClaim ? (
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Hand className="size-4" aria-hidden="true" />
            {mine
              ? t('claimedByYou')
              : t('claimedBy', {
                name: heldClaim.by.name ?? '—',
                time: heldClaim.claimed_at ? formatDateTime(heldClaim.claimed_at, locale) : '—',
              })}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('unclaimed')}</span>
        )}
        {heldByOther ? null : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={claim.isPending}
            onClick={() => claim.mutate(mine ? 'release' : 'claim')}
          >
            {mine ? t('release') : t('claim')}
          </Button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <ReasonFields idPrefix={`decision-${item.id}`} code={code} onCode={setCode} text={reason} onText={setReason} />
      </div>

      {error ? <ErrorState className="mt-3" message={error} /> : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        {item.decisions.map((decision) => {
          const Icon = DECISION_ICONS[decision];
          return (
            <Button
              key={decision}
              type="button"
              variant={DECISION_VARIANTS[decision]}
              disabled={heldByOther || mutation.isPending || !reasonComplete(decision, code, reason)}
              onClick={() => mutation.mutate({ decision })}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(`decisionsByType.${item.source_type}.${decision}`)}
            </Button>
          );
        })}
      </div>
      {item.decisions.some((decision) => hidesListing(item.source_type, decision)) ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('hideListingHint')}</p>
      ) : null}
    </aside>
  );
}

/**
 * TCK-597 (ADR-0043 §7) — traiter le spam évident en lot : une décision et un motif communs aux
 * éléments cochés (au plus 50). Seules les décisions valides pour TOUS les cochés sont offertes ;
 * l'API tranche chaque élément dans sa transaction et rend un résultat par élément.
 */
export function ModerationBatchBar({
  items,
  onDone,
  onClear,
}: {
  items: AdminModerationItem[];
  onDone: (results: ModerationBatchResult[]) => void;
  onClear: () => void;
}) {
  const t = useTranslations('superAdmin.moderation');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<ModerationDecision | ''>('');
  const [code, setCode] = useState<ModerationReasonCode | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ModerationBatchResult[] | null>(null);

  const common = (['approve', 'hide', 'reject', 'remove'] as const).filter((d) =>
    items.every((item) => item.decisions.includes(d)),
  );
  const chosen = decision !== '' && common.includes(decision) ? decision : '';

  const mutation = useMutation({
    mutationFn: () => postModerationDecisionBatch(
      items.map((item) => item.id),
      payloadOf(chosen as ModerationDecision, code, reason),
    ),
    onSuccess: (res) => {
      setResults(res.data);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'moderation'] });
      onDone(res.data);
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  if (items.length === 0 && results === null) return null;

  const failed = results?.filter((r) => !r.ok) ?? [];
  const decisionOptions = common.map((d) => ({ value: d, label: t(`decisions.${d}`) }));

  return (
    <section
      className="space-y-3 rounded-xl bg-card p-4 ring-1 ring-border"
      aria-label={t('batchTitle')}
      data-testid="moderation-batch-bar"
    >
      {results ? (
        <div role="status" className="text-sm text-foreground">
          {t('batchResult', { ok: results.length - failed.length, failed: failed.length })}
          {failed.length > 0 ? (
            <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
              {failed.map((r) => (
                <li key={r.id}>{r.id} — {t(`batchErrors.${batchErrorKey(r.code)}`)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t('batchSelected', { count: items.length })}</p>
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>{t('batchClear')}</Button>
          </div>
          {common.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('batchNoCommonDecision')}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium text-foreground">
                <span>{t('batchDecision')}</span>
                <Select value={chosen} onValueChange={(v) => setDecision((v as ModerationDecision | null) ?? '')} items={decisionOptions}>
                  <SelectTrigger className="w-full bg-card" aria-label={t('batchDecision')}>
                    <SelectValue placeholder={t('batchDecisionPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {decisionOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <div className="space-y-2">
                <ReasonFields idPrefix="batch" code={code} onCode={setCode} text={reason} onText={setReason} />
              </div>
            </div>
          )}
          {error ? <ErrorState message={error} /> : null}
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={chosen === '' || mutation.isPending || items.length > 50 || !reasonComplete(chosen as ModerationDecision, code, reason)}
              onClick={() => mutation.mutate()}
            >
              {t('batchApply', { count: items.length })}
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function batchErrorKey(code: string | undefined): 'already_decided' | 'claimed_by_other' | 'concurrent_decision' | 'other' {
  if (code === 'moderation.already_decided') return 'already_decided';
  if (code === 'moderation.claimed_by_other') return 'claimed_by_other';
  if (code === 'moderation.concurrent_decision') return 'concurrent_decision';
  return 'other';
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
        <SelectTrigger className="data-[size=default]:h-10 w-full bg-card">
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
    const old = items.filter((item) => (item.age_minutes ?? 0) > 7 * MINUTES_PAR_JOUR).length;
    return { properties, reviews, old };
  }, [items]);

  return (
    // Trois tuiles sur une rangée dès le mobile : empilées, elles repoussaient la file de 300 px.
    <div className="grid grid-cols-3 gap-3">
      <StatCard label={t('statTotalPage')} value={total} />
      <StatCard label={t('statProperties')} value={stats.properties} />
      <StatCard label={t('statReviews')} value={stats.reviews} />
      {stats.old > 0 ? (
        // Un retard est un AVERTISSEMENT : il portait la teinte terracotta de la marque.
        <WarningBanner
          className="col-span-3"
          icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        >
          {t('staleWarning', { count: stats.old })}
        </WarningBanner>
      ) : null}
    </div>
  );
}

const MINUTES_PAR_JOUR = 1440;

/**
 * TCK-597 — l'âge vient du serveur (`age_minutes`), plus d'un `Date.now()` du navigateur contre
 * une date : une horloge de poste décalée ne vieillit plus la file.
 */
export function formatAge(
  ageMinutes: number | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (ageMinutes === null || ageMinutes < 0) return '—';
  if (ageMinutes < 60) return t('ageMinutes', { minutes: ageMinutes });
  if (ageMinutes < MINUTES_PAR_JOUR) return t('ageHours', { hours: Math.floor(ageMinutes / 60) });
  const days = Math.floor(ageMinutes / MINUTES_PAR_JOUR);
  if (days === 1) return t('ageOneDay');
  return t('ageDays', { days });
}
