'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

import { useToast } from '@/components/ui/toast';
import { useCancelEarlyTermination } from '@/lib/queries/leases';
import type { Lease } from '@/types/lease';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface EarlyTerminationBannerProps {
  readonly lease: Lease;
  /**
   * Allows hiding the cancel button when the viewer doesn't have authority
   * (e.g. the tenant on a flow opened by the agent). Defaults to true so
   * the page can render the banner unconditionally and let the API enforce
   * the hard rule.
   */
  readonly canCancel?: boolean;
}

function daysFromTodayTo(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * TCK-090 — Banner shown on the lease detail page when an early-termination
 * request is in flight. Displays the countdown to the effective date, the
 * penalty amount, a link to the linked invoice, and a cancel button visible
 * while the cancellation window is still open.
 *
 * The component intentionally swallows API errors into a local toast rather
 * than throwing — failing to cancel a termination shouldn't take down the
 * detail page. The banner state is refreshed via React-Query invalidation
 * triggered by the mutation hook.
 */
export function EarlyTerminationBanner({ lease, canCancel = true }: EarlyTerminationBannerProps) {
  const t = useTranslations('lease.early_termination');
  const messageErreur = useMessageErreurApi();
  const cancel = useCancelEarlyTermination(lease.id);
  const toast = useToast();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const remaining = useMemo(() => {
    if (!lease.early_termination_effective_date) return null;
    return daysFromTodayTo(lease.early_termination_effective_date);
  }, [lease.early_termination_effective_date]);

  if (lease.status !== 'terminating') return null;
  if (!lease.early_termination_effective_date) return null;

  const cancellationOpen = remaining !== null && remaining > 0;

  async function performCancel() {
    try {
      await cancel.mutateAsync();
      toast.add({
        title: t('cancelled_toast_title'),
        description: t('cancelled_toast_body'),
        type: 'success',
      });
    } catch (err) {
      toast.add({
        title: t('cancel_failed_title'),
        description: messageErreur(err, t('error_generic')),
        type: 'error',
      });
    } finally {
      setConfirmingCancel(false);
    }
  }

  return (
    <section
      data-testid="early-termination-banner"
      className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-warning"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning">
            {t('banner_eyebrow')}
          </p>
          <h3 className="text-base font-semibold">
            {remaining !== null && remaining > 0
              ? t('banner_countdown', { days: remaining })
              : t('banner_due_today')}
          </h3>
          <p className="text-sm text-warning/80">
            {t('banner_effective', { date: lease.early_termination_effective_date })}
          </p>
        </div>

        {canCancel && cancellationOpen && (
          <div className="flex items-center gap-2">
            {confirmingCancel ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={cancel.isPending}
                >
                  {t('back')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  type="button"
                  onClick={() => {
                    void performCancel();
                  }}
                  disabled={cancel.isPending}
                >
                  {cancel.isPending ? t('submitting') : t('confirm_cancel')}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setConfirmingCancel(true)}
              >
                {t('banner_cancel_request')}
              </Button>
            )}
          </div>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        {typeof lease.early_termination_penalty_amount === 'number' && (
          <div className="rounded-md bg-card/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-warning">
              {t('banner_penalty_label')}
            </dt>
            <dd className="mt-0.5 font-semibold">
              {lease.early_termination_penalty_amount.toLocaleString()} {lease.currency}
            </dd>
          </div>
        )}

        {lease.early_termination_invoice_id && (
          <div className="rounded-md bg-card/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-warning">
              {t('banner_invoice_label')}
            </dt>
            <dd className="mt-0.5">
              <a
                className="font-semibold text-warning underline underline-offset-2 hover:text-warning"
                href={`/app/payments?invoice=${lease.early_termination_invoice_id}`}
              >
                #{lease.early_termination_invoice_id}
              </a>
            </dd>
          </div>
        )}

        {lease.early_termination_reason && (
          <div className="rounded-md bg-card/60 p-3">
            <dt className="text-xs uppercase tracking-wide text-warning">
              {t('banner_reason_label')}
            </dt>
            <dd className="mt-0.5 line-clamp-3">{lease.early_termination_reason}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
