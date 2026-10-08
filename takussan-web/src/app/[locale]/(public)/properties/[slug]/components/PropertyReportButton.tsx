'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Flag } from 'lucide-react';
import { ReportDialog } from '@/components/reports/ReportDialog';
import { submitPropertyReport } from '@/app/actions/property';

interface PropertyReportButtonProps {
  slug: string;
}

/** TCK-597 — « arnaque » en tête : c'est le signalement qui coûte le plus à un visiteur. */
const REASON_KEYS: Array<{ value: string; cle: string }> = [
  { value: 'fraud', cle: 'fraud' },
  { value: 'misleading', cle: 'misleading' },
  { value: 'spam', cle: 'spam' },
  { value: 'inappropriate_content', cle: 'inappropriate' },
  { value: 'other', cle: 'other' },
];

/**
 * TCK-597 (V12) — plus de barrière de connexion : un visiteur sans compte signale une annonce.
 * Le jeton part quand il existe (`submitPropertyReport`).
 */
export function PropertyReportButton({ slug }: PropertyReportButtonProps) {
  const t = useTranslations('property.report');
  const reasons = REASON_KEYS.map((r) => ({ value: r.value, label: t(`reasons.${r.cle}`) }));
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Flag className="size-3.5" aria-hidden />
        {t('trigger')}
      </button>

      <ReportDialog
        open={open}
        onOpenChange={setOpen}
        title={t('dialogTitle')}
        description={t('dialogBodyFull')}
        reasons={reasons}
        onSubmit={(payload) => submitPropertyReport(slug, payload)}
      />
    </>
  );
}
