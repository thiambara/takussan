'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  IntegrationCard,
  IntegrationEditDialog,
  WebhookTrailTable,
  categoryLabels,
} from '@/components/admin/super/integrations';
import { fetchAdminIntegrations, fetchIntegrationWebhooks } from '@/lib/queries/super-admin';
import type { AdminIntegration, AdminIntegrationsResponse, IntegrationWebhooksResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { DestructiveBanner } from '@/components/ui/destructive-banner';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export default function SuperAdminIntegrationsPage() {
  const t = useTranslations('superAdmin.pages.integrations');
  const tShared = useTranslations('superAdmin.pages.shared');
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
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {criticalDown.length > 0 ? (
        <DestructiveBanner>
          {t('criticalDown', { count: String(criticalDown.length) })}
        </DestructiveBanner>
      ) : null}

      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      ) : query.isError ? (
        <DestructiveBanner>
          {tShared('loadError')} {messageErreur(query.error)}
        </DestructiveBanner>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([category, items]) => (
            <section key={category} className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-foreground">
                {categoryLabels[category] ?? category}
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
