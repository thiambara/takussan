'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Activity, KeyRound, PlugZap, Save, TestTube2, Webhook, X } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  fetchAdminIntegrationSchema,
  patchAdminIntegration,
  testAdminIntegration,
} from '@/lib/queries/super-admin';
import type {
  AdminIntegration,
  AdminIntegrationSchemaResponse,
  IntegrationWebhookLog,
} from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export const categoryLabels: Record<string, string> = {
  payments: 'Paiements',
  messaging: 'Messagerie',
  email: 'Email',
  storage: 'Stockage',
  other: 'Autres',
};

const statusTone: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  healthy: 'secondary',
  failed: 'destructive',
  disabled: 'outline',
  unknown: 'outline',
};

export function IntegrationCard({
  integration,
  onEdit,
  onWebhooks,
}: {
  integration: AdminIntegration;
  onEdit: (integration: AdminIntegration) => void;
  onWebhooks: (integration: AdminIntegration) => void;
}) {
  return (
    <article className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-stone-950">{integration.label}</h3>
          <p className="mt-1 text-sm text-stone-500">{integration.provider}</p>
        </div>
        <Badge variant={statusTone[integration.status] ?? 'outline'}>{integration.status}</Badge>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {Object.entries(integration.masked_credentials).slice(0, 2).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-stone-500">
              <KeyRound className="size-4" aria-hidden="true" />
              {key}
            </dt>
            <dd className="font-mono text-xs text-stone-700">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <IntegrationTestButton integrationId={integration.id} />
        <Button type="button" variant="outline" onClick={() => onEdit(integration)}>
          <PlugZap className="size-4" aria-hidden="true" />
          Éditer
        </Button>
        <Button type="button" variant="ghost" onClick={() => onWebhooks(integration)}>
          <Webhook className="size-4" aria-hidden="true" />
          Webhooks
        </Button>
      </div>
    </article>
  );
}

export function IntegrationTestButton({ integrationId }: { integrationId: number }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => testAdminIntegration(integrationId),
    onSuccess: (response) => {
      setMessage(response.data.success ? `${response.data.latency_ms} ms` : (response.data.error ?? 'Échec'));
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'integrations'] });
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        <TestTube2 className="size-4" aria-hidden="true" />
        Tester
      </Button>
      {message ? <span className="text-xs text-stone-500">{message}</span> : null}
    </div>
  );
}

export function IntegrationEditDialog({
  integration,
  open,
  onOpenChange,
}: {
  integration: AdminIntegration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const schema = useQuery<AdminIntegrationSchemaResponse, ApiError>({
    queryKey: ['super-admin', 'integrations', integration?.id, 'schema'],
    queryFn: () => fetchAdminIntegrationSchema(integration!.id),
    enabled: open && integration !== null,
  });
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const fields = schema.data?.data.fields ?? [];
  const payloadCredentials = useMemo(
    () => Object.fromEntries(Object.entries(credentials).filter(([, value]) => value.trim() !== '')),
    [credentials],
  );
  const mutation = useMutation({
    mutationFn: () => patchAdminIntegration(integration!.id, { credentials: payloadCredentials }),
    onSuccess: () => {
      setCredentials({});
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'integrations'] });
      onOpenChange(false);
    },
    onError: (err: ApiError) => setError(err.displayMessage),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{integration ? `Éditer ${integration.label}` : 'Éditer une intégration'}</DialogTitle>
        </DialogHeader>
        {schema.isLoading ? (
          <div className="h-32 animate-pulse rounded-lg bg-stone-200" />
        ) : (
          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label htmlFor={`credential-${field.name}`}>{field.label}</Label>
                <Input
                  id={`credential-${field.name}`}
                  type={field.secret ? 'password' : field.type}
                  value={credentials[field.name] ?? ''}
                  placeholder={integration?.masked_credentials[field.name] ?? ''}
                  onChange={(event) => setCredentials((current) => ({ ...current, [field.name]: event.target.value }))}
                />
              </div>
            ))}
            <p className="text-xs text-stone-500">
              Les valeurs existantes restent masquées. Remplissez uniquement les champs à remplacer.
            </p>
          </div>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || Object.keys(payloadCredentials).length === 0}
          >
            <Save className="size-4" aria-hidden="true" />
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WebhookTrailTable({
  integration,
  logs,
  loading,
  error,
  onClose,
}: {
  integration: AdminIntegration;
  logs: IntegrationWebhookLog[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('superAdmin.integrations.webhooks');

  return (
    <section className="rounded-xl bg-white ring-1 ring-stone-200">
      <div className="flex items-center justify-between border-b border-stone-200 p-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-stone-950">Webhooks {integration.label}</h2>
          <p className="text-sm text-stone-500">Trail conservé 30 jours.</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Fermer les webhooks" onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {loading ? (
        <div className="m-4 h-24 animate-pulse rounded-lg bg-stone-200" />
      ) : error ? (
        <ErrorState className="m-4" message={error} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
              <tr>
                <th className="px-4 py-2">Événement</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Payload</th>
                <th className="px-4 py-2">Reçu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3">{log.event_type ?? 'webhook'}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">{log.status}</Badge>
                  </td>
                  <td className="max-w-md truncate px-4 py-3 font-mono text-xs">{log.payload.truncated}</td>
                  <td className="px-4 py-3 text-stone-500">{log.created_at ? new Date(log.created_at).toLocaleString('fr-SN') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 ? (
            <EmptyState
              className="border-0"
              icon={<Activity className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
