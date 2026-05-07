'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  IntegrationCard,
  IntegrationEditDialog,
  WebhookTrailTable,
  categoryLabels,
} from '@/components/admin/super/integrations';
import { fetchAdminIntegrations, fetchIntegrationWebhooks } from '@/lib/queries/super-admin';
import type { AdminIntegration, AdminIntegrationsResponse, IntegrationWebhooksResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export default function SuperAdminIntegrationsPage() {
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
        <h1 className="font-display text-2xl font-bold text-stone-900">Intégrations tierces</h1>
        <p className="mt-1 text-sm text-stone-600">
          Configurez les providers de paiement, messagerie et email sans exposer les secrets.
        </p>
      </header>

      {criticalDown.length > 0 ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200" role="alert">
          {criticalDown.length} intégration paiement critique en panne.
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-stone-200" />
      ) : query.isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
          Erreur de chargement. {query.error.displayMessage}
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([category, items]) => (
            <section key={category} className="space-y-3">
              <h2 className="font-display text-xl font-semibold text-stone-950">
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
          error={webhooks.error?.displayMessage ?? null}
          onClose={() => setWebhookIntegration(null)}
        />
      ) : null}
    </div>
  );
}
