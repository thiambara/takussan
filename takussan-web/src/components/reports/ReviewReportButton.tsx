'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Flag } from 'lucide-react';
import { ReportDialog } from '@/components/reports/ReportDialog';
import { submitReviewReport } from '@/app/actions/property';

/** Les codes de motif d'un avis — « faux avis » en tête (TCK-597). */
export const REVIEW_REPORT_REASONS = [
  'fraud',
  'offensive',
  'personal_data',
  'conflict_of_interest',
  'spam',
  'off_topic',
  'other',
] as const;

interface ReviewReportButtonProps {
  readonly reviewId: number;
}

/**
 * TCK-597 (V12) — « Signaler » sur chaque avis public (fiche bien, fiche agent, fiche agence),
 * sans compte. Un signalement RANGE l'avis dans la file de modération ; il ne le masque pas.
 */
export function ReviewReportButton({ reviewId }: ReviewReportButtonProps) {
  const t = useTranslations('property.reviewReport');
  const [open, setOpen] = useState(false);
  const reasons = REVIEW_REPORT_REASONS.map((value) => ({ value, label: t(`reasons.${value}`) }));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('triggerAria')}
        className="inline-flex min-h-6 items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid={`review-report-${reviewId}`}
      >
        <Flag className="size-3" aria-hidden />
        {t('trigger')}
      </button>
      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        title={t('dialogTitle')}
        description={t('dialogBody')}
        reasons={reasons}
        onSubmit={(payload) => submitReviewReport(reviewId, payload)}
        withDetails={false}
      />
    </>
  );
}
