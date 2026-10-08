'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Check, EyeOff, Trash2, X, Loader2, Flag } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';
import {
  fetchReviewReports,
  moderateReview,
  type ModerationReview,
  type ModerationDecision,
} from '@/lib/queries/reviews-moderation';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MODERATION_REASON_CODES,
  reasonTextRequired,
  type ModerationReasonCode,
} from '@/lib/moderation-reasons';

import { formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface ModerationDetailProps {
  readonly review: ModerationReview;
  readonly onModerated: () => void;
  /** Super-admin : tranche aussi les avis SUR une agence (TCK-597, ADR-0043 §1). */
  readonly platform?: boolean;
}

type PendingDecision = { decision: ModerationDecision } | null;

const AGENCY_SUBJECT = 'App\\Models\\Agency';

export function ModerationDetail({ review, onModerated, platform = false }: ModerationDetailProps) {
  const t = useTranslations('admin.moderation.detail');
  const tReasons = useTranslations('common.moderationReasons');
  const locale = useLocale() as Locale;
  const tCommon = useTranslations('common.actions');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const [pending, setPending] = useState<PendingDecision>(null);
  const [reasonCode, setReasonCode] = useState<ModerationReasonCode | ''>('');
  const [reason, setReason] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: reportsData } = useQuery({
    queryKey: ['reviews-moderation', 'reports', review.id],
    queryFn: () => fetchReviewReports(review.id, token ?? ''),
    enabled: Boolean(token) && review.reported_count > 0,
  });

  const mutation = useMutation({
    mutationFn: (payload: { decision: ModerationDecision; reason_code?: ModerationReasonCode; reason?: string }) =>
      moderateReview(review.id, payload, token ?? ''),
    onSuccess: () => {
      cancelPending();
      onModerated();
    },
    onError: (err) => {
      setErrorMessage(messageErreur(err, t('genericError')));
    },
  });

  const handleDecision = (decision: ModerationDecision) => {
    setErrorMessage(null);
    if (decision === 'approve') {
      mutation.mutate({ decision });
      return;
    }
    setPending({ decision });
  };

  // TCK-597 (ADR-0043 §7) — un motif CODÉ, choisi dans une liste traduite ; le complément libre
  // est facultatif, sauf pour « autre ».
  const confirmPending = () => {
    if (!pending) return;
    if (reasonCode === '') {
      setErrorMessage(t('reasonCodeRequired'));
      return;
    }
    if (reasonTextRequired(reasonCode) && reason.trim().length === 0) {
      setErrorMessage(t('reasonRequired'));
      return;
    }
    mutation.mutate({
      decision: pending.decision,
      reason_code: reasonCode,
      reason: reason.trim() || undefined,
    });
  };

  function cancelPending() {
    setPending(null);
    setReasonCode('');
    setReason('');
    setErrorMessage(null);
  }

  // Un avis SUR l'agence elle-même : l'admin d'agence le voit, la plateforme le tranche.
  const platformOnly = !platform && review.reviewable_type === AGENCY_SUBJECT;
  // verif-597 M3 — l'agence ne tranche que l'avis EN ATTENTE, et seulement approuver ou masquer :
  // une fois publié, seule la plateforme le retire (l'agence y répond ou le signale).
  const publishedPlatformOnly = !platform && !platformOnly && review.status !== 'pending';
  const reasonOptions = MODERATION_REASON_CODES.map((code) => ({ value: code, label: tReasons(code) }));

  const reports = reportsData?.data ?? [];

  return (
    <section
      className="rounded-xl bg-card p-6"
      data-testid="moderation-detail"
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('reviewNumber', { id: String(review.id) })}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            {review.title || t('untitled')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('byAuthor', {
              author: review.author?.name ?? t('anonymous'),
              rating: String(review.rating),
            })}
          </p>
        </div>
        {platformOnly || publishedPlatformOnly ? (
          <p className="max-w-xs rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground" data-testid="moderation-platform-only">
            {platformOnly ? t('platformOnly') : t('publishedPlatformOnly')}
          </p>
        ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => handleDecision('approve')}
            disabled={mutation.isPending}
          >
            <Check className="size-4" />
            {t('approve')}
          </Button>
          <Button
            variant="outline"
            onClick={() => handleDecision('hide')}
            disabled={mutation.isPending}
          >
            <EyeOff className="size-4" />
            {t('hide')}
          </Button>
          {platform ? (
          <Button
            variant="destructive"
            onClick={() => handleDecision('delete')}
            disabled={mutation.isPending}
          >
            <Trash2 className="size-4" />
            {t('delete')}
          </Button>
          ) : null}
          {platform && review.reported_count > 0 ? (
            <Button
              variant="ghost"
              onClick={() => handleDecision('ignore')}
              disabled={mutation.isPending}
            >
              <X className="size-4" />
              {t('ignoreReports')}
            </Button>
          ) : null}
        </div>
        )}
      </header>

      <div className="mt-5 whitespace-pre-wrap rounded-lg bg-muted/40 p-4 text-sm text-foreground">
        {review.content ?? <em className="text-muted-foreground">{t('noComment')}</em>}
      </div>

      {reports.length > 0 ? (
        <div className="mt-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Flag className="size-4 text-destructive" />
            {t('reportsHeading', { count: String(reports.length) })}
          </h3>
          <ul className="space-y-2">
            {reports.map((report, i) => (
              <li
                key={`${report.user_id ?? 'anon'}-${i}`}
                className="rounded-lg border border-muted bg-muted/20 p-3 text-sm"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{report.user?.name ?? t('reporterFallback')}</span>
                  {/* TCK-292 — la locale ACTIVE, plus celle du navigateur : un
                      utilisateur `fr` sur un navigateur `en-US` lisait une date
                      anglaise (et l'inverse). `ModerationQueueList`, à côté,
                      suivait déjà `locale`. */}
                  {report.reported_at ? (
                    <span>{formatDateTime(report.reported_at, locale)}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-foreground">{report.reason ?? '—'}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pending ? (
        <div
          className="mt-5 rounded-lg border border-muted bg-muted/30 p-4"
          data-testid="moderation-confirm"
        >
          <p className="mb-2 text-sm font-semibold text-foreground">
            {pending.decision === 'delete'
              ? t('confirmDelete')
              : pending.decision === 'hide'
                ? t('confirmHide')
                : t('confirmIgnore')}
          </p>
          <label className="block text-xs text-muted-foreground">
            <span className="mb-1 block">{t('reasonCodeLabel')}</span>
            <Select
              value={reasonCode}
              onValueChange={(v) => setReasonCode((v as ModerationReasonCode | null) ?? '')}
              items={reasonOptions}
            >
              <SelectTrigger className="w-full bg-background" aria-label={t('reasonCodeLabel')}>
                <SelectValue placeholder={t('reasonCodePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {reasonOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label htmlFor="moderation-reason" className="mt-3 block text-xs text-muted-foreground">
            {reasonTextRequired(reasonCode) ? t('reasonLabelRequired') : t('reasonLabel')}
          </label>
          <textarea
            id="moderation-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={1000}
            className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            placeholder={t('reasonPlaceholder')}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={cancelPending} disabled={mutation.isPending}>
              {tCommon('cancel')}
            </Button>
            <Button
              variant={pending.decision === 'delete' ? 'destructive' : 'default'}
              onClick={confirmPending}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {tCommon('confirm')}
            </Button>
          </div>
        </div>
      ) : null}

      {errorMessage ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
