'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';

import { exportAdminReport } from '@/lib/queries/super-admin';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export function ReportExportButton({
  report,
  params,
}: {
  report: 'growth' | 'revenue' | 'cohorts' | 'funnel';
  params: Record<string, string | number>;
}) {
  const t = useTranslations('reporting.export');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const [isPending, setPending] = useState(false);

  const handleExport = async () => {
    setPending(true);
    try {
      const result = await exportAdminReport(report, params);
      toast.add({
        title: result.status === 'downloaded' ? t('downloadedTitle') : t('requestedTitle'),
        description: result.status === 'downloaded'
          ? t('downloadedBody')
          : t('requestedBody'),
        type: 'success',
      });
    } catch (error) {
      toast.add({
        title: t('errorTitle'),
        description: messageErreur(error, t('errorBody')),
        type: 'error',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" variant="outline" disabled={isPending} onClick={handleExport}>
      {isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 size-4" aria-hidden="true" />}
      {t('csv')}
    </Button>
  );
}
