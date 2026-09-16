'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { AlertRuleDialog, AlertRuleTable } from '@/components/admin/super/alerts';
import { Button } from '@/components/ui/button';
import { fetchAlertRules } from '@/lib/queries/super-admin';
import type { AlertRulesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { DataState, PageHeader } from '@/components/console';
import { EmptyState } from '@/components/feedback';

export default function SuperAdminAlertsPage() {
  const t = useTranslations('superAdmin.pages.alerts');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tAlerts = useTranslations('superAdmin.alerts');
  const tCommon = useTranslations('common');
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

      {/* Une table vide rendait ses seuls en-têtes : ni « rien ici », ni quoi faire. */}
      <DataState
        loading={query.isLoading}
        error={query.isError ? `${tShared('loadError')} ${messageErreur(query.error)}` : null}
        onRetry={() => void query.refetch()}
        retryLabel={tCommon('actions.retry')}
        isEmpty={(query.data?.data ?? []).length === 0}
        skeletonRows={3}
        emptyState={
          <EmptyState
            icon={<BellRing className="size-8" aria-hidden="true" />}
            title={tAlerts('emptyTitle')}
            description={tAlerts('emptyDescription')}
            action={<Button type="button" onClick={() => setDialogOpen(true)}>{t('newRule')}</Button>}
          />
        }
      >
        <AlertRuleTable rules={query.data?.data ?? []} catalogue={query.data?.catalogue ?? {}} />
      </DataState>
      <AlertRuleDialog
        rule={null}
        catalogue={query.data?.catalogue ?? {}}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
