'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/lib/api';
import { useRequestEarlyTermination } from '@/lib/queries/leases';
import type { Lease } from '@/types/lease';

interface EarlyTerminationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly lease: Lease;
  readonly onSubmitted?: () => void;
}

const DEFAULT_NOTICE_DAYS = 30;
// Aligned with backend default (`Setting('lease.early_termination_penalty_months')`).
// Pure client-side preview — the server is the source of truth.
const DEFAULT_PENALTY_MONTHS = 2;

function todayPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffInDays(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * TCK-090 — Modale "Résiliation anticipée" : motif + date effective +
 * estimation live de la pénalité (calque côté client de la formule
 * backend pour donner un feedback instantané ; la valeur authoritative
 * est celle persistée par `EarlyTerminationService::computePenalty`).
 *
 * Pas de wizard multi-step ici — la décision d'utilisation est plus
 * "destructive secondaire" que "création", et l'utilisateur doit voir
 * tous les champs sur la même page pour évaluer son geste.
 */
export function EarlyTerminationDialog({
  open,
  onOpenChange,
  lease,
  onSubmitted,
}: EarlyTerminationDialogProps) {
  const t = useTranslations('lease.early_termination');
  const noticeDays = lease.notice_period_days ?? DEFAULT_NOTICE_DAYS;
  const minDate = useMemo(() => todayPlusDays(noticeDays), [noticeDays]);

  const [effectiveDate, setEffectiveDate] = useState(minDate);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const request = useRequestEarlyTermination(lease.id);

  // Live estimation — same shape as the backend formula, capped against
  // remaining months. Backend remains authoritative.
  const estimate = useMemo(() => {
    if (!lease.end_date || !effectiveDate) return null;
    const monthly = lease.monthly_rent ?? 0;
    if (monthly <= 0) return { months: 0, amount: 0 };

    const days = diffInDays(effectiveDate, lease.end_date);
    if (days <= 0) return { months: 0, amount: 0 };

    const remainingMonths = Math.ceil(days / 30);
    const billable = Math.min(DEFAULT_PENALTY_MONTHS, remainingMonths);
    return { months: billable, amount: monthly * billable };
  }, [effectiveDate, lease.end_date, lease.monthly_rent]);

  const noticeViolated = effectiveDate && effectiveDate < minDate;

  function reset() {
    setEffectiveDate(minDate);
    setReason('');
    setError(null);
  }

  async function submit() {
    setError(null);
    try {
      await request.mutateAsync({
        effective_date: effectiveDate,
        ...(reason.trim() !== '' ? { reason: reason.trim() } : {}),
      });
      onSubmitted?.();
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.displayMessage : t('error_generic'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('dialog_title')}</DialogTitle>
          <DialogDescription>{t('dialog_subtitle')}</DialogDescription>
        </DialogHeader>

        {error && (
          <div role="alert" className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-stone-700" htmlFor="et-effective">
              {t('field_effective_date')}
            </label>
            <DatePicker
              id="et-effective"
              min={minDate}
              value={effectiveDate}
              onValueChange={setEffectiveDate}
            />
            <p className="mt-1 text-xs text-stone-500">
              {t('notice_hint', { days: noticeDays, min: minDate })}
            </p>
            {noticeViolated && (
              <p className="mt-1 text-xs text-red-600">{t('notice_too_short')}</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700" htmlFor="et-reason">
              {t('field_reason')}
            </label>
            <Textarea
              id="et-reason"
              rows={3}
              placeholder={t('field_reason_placeholder')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {estimate !== null && (
            <div
              data-testid="penalty-estimate"
              className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
            >
              <div className="font-medium text-amber-900">{t('estimate_title')}</div>
              <p className="mt-1 text-amber-800">
                {estimate.months > 0
                  ? t('estimate_breakdown', {
                      months: estimate.months,
                      amount: estimate.amount.toLocaleString(),
                      currency: lease.currency,
                    })
                  : t('estimate_zero')}
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-between gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              void submit();
            }}
            disabled={request.isPending || Boolean(noticeViolated) || !effectiveDate}
          >
            {request.isPending ? t('submitting') : t('submit')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
