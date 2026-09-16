'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  IntegrationCard,
  IntegrationEditDialog,
  WebhookTrailTable,
  INTEGRATION_CATEGORIES,
} from '@/components/admin/super/integrations';
import { fetchAdminIntegrations, fetchIntegrationWebhooks } from '@/lib/queries/super-admin';
import type { AdminIntegration, AdminIntegrationsResponse, IntegrationWebhooksResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { DestructiveBanner } from '@/components/ui/destructive-banner';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';

export default function SuperAdminIntegrationsPage() {
  const t = useTranslations('superAdmin.pages.integrations');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const tIntegrations = useTranslations('superAdmin.integrations');
  const messageErreur = useMessageErreurApi();
  const [editing, setEditing] = useState<AdminIntegration | null>(null);
  const [webhookIntegration, setWebhookIntegration] = useState<AdminIntegration | null>(null);
  const query = useQuery<AdminIntegrationsResponse, ApiError>({
    queryKey: ['super-admin', 'integrations'],
    queryFn: fetchAdminIntegrations,
    staleTime: 30_000,
  });
  const webhooks = useQuery<IntegrationWebhooksResponse, ApiError>({
    queryKey: ['super-admin', 'integrations', webhookIntegration?.id, 'webhooks'],
    queryFn: () => fetchIntegrationWebhooks(webhookIntegration!.id),
    enabled: webhookIntegration !== null,
  });
  const grouped = useMemo(() => {
    return (query.data?.data ?? []).reduce<Record<string, AdminIntegration[]>>((acc, integration) => {
      acc[integration.category] = [...(acc[integration.category] ?? []), integration];
      return acc;
    }, {});
  }, [query.data]);
  const criticalDown = (query.data?.data ?? []).filter((item) => item.critical && item.status === 'failed');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      {criticalDown.length > 0 ? (
        <DestructiveBanner>
          {t('criticalDown', { count: String(criticalDown.length) })}
        </DestructiveBanner>
      ) : null}

      {query.isLoading ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : query.isError ? (
        <ErrorState
          message={`${tShared('loadError')} ${messageErreur(query.error)}`}
          onRetry={() => void query.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([category, items]) => (
            <section key={category} className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-foreground">
                {INTEGRATION_CATEGORIES.has(category) ? tIntegrations(`categories.${category}`) : category}
              </h2>
              {/* Deux colonnes dès `lg` (TCK-505) : à 768, « Orange Money » se cassait en deux. */}
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {items.map((integration) => (
                  <IntegrationCard
                    key={integration.id}
                    integration={integration}
                    onEdit={setEditing}
                    onWebhooks={setWebhookIntegration}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <IntegrationEditDialog integration={editing} open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} />

      {webhookIntegration ? (
        <WebhookTrailTable
          integration={webhookIntegration}
          logs={webhooks.data?.data ?? []}
          loading={webhooks.isLoading}
          error={webhooks.error ? messageErreur(webhooks.error) : null}
          onClose={() => setWebhookIntegration(null)}
        />
      ) : null}
    </div>
  );
}
