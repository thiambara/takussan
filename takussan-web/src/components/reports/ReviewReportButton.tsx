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
  /**
   * TCK-2635 — l'icône seule, en cible de 36 px (maquette `CarteAvisRecu` des avis reçus) : le nom
   * accessible reste « Signaler cet avis ».
   */
  readonly compact?: boolean;
}

/**
 * TCK-597 (V12) — « Signaler » sur chaque avis public (fiche bien, fiche agent, fiche agence),
 * sans compte. Un signalement RANGE l'avis dans la file de modération ; il ne le masque pas.
 */
export function ReviewReportButton({ reviewId, compact = false }: ReviewReportButtonProps) {
  const t = useTranslations('property.reviewReport');
  const [open, setOpen] = useState(false);
  const reasons = REVIEW_REPORT_REASONS.map((value) => ({ value, label: t(`reasons.${value}`) }));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('triggerAria')}
        className={
          compact
            ? 'inline-flex size-9 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            : 'inline-flex min-h-6 items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        }
        data-testid={`review-report-${reviewId}`}
      >
        {compact ? (
          <Flag className="size-4" strokeWidth={1.75} aria-hidden />
        ) : (
          <>
            <Flag className="size-3" aria-hidden />
            {t('trigger')}
          </>
        )}
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
