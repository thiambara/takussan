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
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>{t('newRule')}</Button>
      </header>

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
