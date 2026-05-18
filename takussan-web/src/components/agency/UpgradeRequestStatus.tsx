'use client';

/**
 * TCK-267 — current upgrade-request status panel.
 *
 * Renders the latest request for an `individual` agency (one of
 * `pending`, `approved`, `rejected`, `revoked`) with the matching
 * date / comment, and exposes a "Revoke" button when the request is
 * still pending.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { revokeAgencyUpgradeRequest } from '@/lib/queries/agency-upgrade';
import type { AgencyUpgradeRequest } from '@/types/agency-upgrade';

export type UpgradeRequestStatusProps = {
  readonly agencyId: number;
  readonly request: AgencyUpgradeRequest;
};

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function UpgradeRequestStatus({
  agencyId,
  request,
}: UpgradeRequestStatusProps) {
  const t = useTranslations('agency.upgrade.status');
  const { token } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [revoking, setRevoking] = useState(false);

  const dateLabel = useMemo(
    () => formatDate(request.submitted_at, 'fr-FR'),
    [request.submitted_at],
  );

  const reviewedAt = useMemo(
    () => formatDate(request.reviewed_at, 'fr-FR'),
    [request.reviewed_at],
  );

  async function handleRevoke() {
    if (!token || revoking) return;
    setRevoking(true);
    try {
      await revokeAgencyUpgradeRequest(token, agencyId, request.id);
      toast.add({ title: t('toasts.revoked'), type: 'success' });
      router.refresh();
    } catch (error) {
      const description =
        error instanceof ApiError ? error.displayMessage : t('toasts.error');
      toast.add({ title: t('toasts.error'), description, type: 'error' });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section
      aria-label={t('aria_label')}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            {t(`headings.${request.status}`)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('submitted_at', { date: dateLabel })}
          </p>
        </div>
        <span
          data-status={request.status}
          className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          {t(`badges.${request.status}`)}
        </span>
      </header>

      {request.status === 'pending' ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('body.pending')}</p>
      ) : null}

      {request.status === 'approved' ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t('body.approved', { date: reviewedAt })}
        </p>
      ) : null}

      {request.status === 'rejected' ? (
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
          <p>{t('body.rejected', { date: reviewedAt })}</p>
          {request.review_comment ? (
            <blockquote className="border-l-2 border-border bg-background/40 p-3 italic">
              {request.review_comment}
            </blockquote>
          ) : null}
        </div>
      ) : null}

      {request.status === 'revoked' ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('body.revoked')}</p>
      ) : null}

      {request.status === 'pending' ? (
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleRevoke}
            disabled={revoking}
          >
            {revoking ? t('cta.revoking') : t('cta.revoke')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
