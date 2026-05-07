'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import { exportAdminReport } from '@/lib/queries/super-admin';

export function ReportExportButton({
  report,
  params,
}: {
  report: 'growth' | 'revenue' | 'cohorts' | 'funnel';
  params: Record<string, string | number>;
}) {
  const toast = useToast();
  const [isPending, setPending] = useState(false);

  const handleExport = async () => {
    setPending(true);
    try {
      await exportAdminReport(report, params);
      toast.add({ title: 'Export demandé', description: 'Les exports volumineux sont notifiés par email.', type: 'success' });
    } catch (error) {
      toast.add({
        title: 'Export impossible',
        description: error instanceof ApiError ? error.displayMessage : 'Réessayez dans quelques instants.',
        type: 'error',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" variant="outline" disabled={isPending} onClick={handleExport}>
      {isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 size-4" aria-hidden="true" />}
      Exporter CSV
    </Button>
  );
}
