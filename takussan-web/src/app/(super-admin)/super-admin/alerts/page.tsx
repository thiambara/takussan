'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { AlertRuleDialog, AlertRuleTable } from '@/components/admin/super/alerts';
import { Button } from '@/components/ui/button';
import { fetchAlertRules } from '@/lib/queries/super-admin';
import type { AlertRulesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';

export default function SuperAdminAlertsPage() {
  const t = useTranslations('superAdmin.pages.alerts');
  const tShared = useTranslations('superAdmin.pages.shared');
  const messageErreur = useMessageErreurApi();
  const [dialogOpen, setDialogOpen] = useState(false);
  const query = useQuery<AlertRulesResponse, ApiError>({
    queryKey: ['super-admin', 'alert-rules'],
    queryFn: fetchAlertRules,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={<Button type="button" onClick={() => setDialogOpen(true)}>{t('newRule')}</Button>}
      />

      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : query.isError ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive ring-1 ring-destructive/20">
          {tShared('loadError')} {messageErreur(query.error)}
        </div>
      ) : (
        <AlertRuleTable rules={query.data?.data ?? []} catalogue={query.data?.catalogue ?? {}} />
      )}
      <AlertRuleDialog
        rule={null}
        catalogue={query.data?.catalogue ?? {}}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
