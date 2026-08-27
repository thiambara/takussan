'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Activity, KeyRound, PlugZap, Save, TestTube2, Webhook, X } from 'lucide-react';
import {
  DataState,
  DataTable,
  type DataTableColumn,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
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
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export const categoryLabels: Record<string, string> = {
  payments: 'Paiements',
  messaging: 'Messagerie',
  email: 'Email',
  storage: 'Stockage',
  other: 'Autres',
};

/** Le type d'événement que l'API n'a pas renseigné — jeton technique, pas du texte affiché. */
const WEBHOOK_EVENT_FALLBACK = 'webhook';

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
  const t = useTranslations('superAdmin.integrations');
  return (
    <article className="rounded-xl bg-card p-4 ring-1 ring-border">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">{integration.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{integration.provider}</p>
        </div>
        <Badge variant={statusTone[integration.status] ?? 'outline'}>{integration.status}</Badge>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        {Object.entries(integration.masked_credentials).slice(0, 2).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <KeyRound className="size-4" aria-hidden="true" />
              {key}
            </dt>
            <dd className="font-mono text-xs text-muted-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <IntegrationTestButton integrationId={integration.id} />
        <Button type="button" variant="outline" onClick={() => onEdit(integration)}>
          <PlugZap className="size-4" aria-hidden="true" />
          {t('edit')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onWebhooks(integration)}>
          <Webhook className="size-4" aria-hidden="true" />
          {t('webhooksAction')}
        </Button>
      </div>
    </article>
  );
}

export function IntegrationTestButton({ integrationId }: { integrationId: number }) {
  const t = useTranslations('superAdmin.integrations');
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => testAdminIntegration(integrationId),
    onSuccess: (response) => {
      setMessage(response.data.success ? `${response.data.latency_ms} ms` : (response.data.error ?? t('testFailure')));
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'integrations'] });
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        <TestTube2 className="size-4" aria-hidden="true" />
        {t('test')}
      </Button>
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
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
  const t = useTranslations('superAdmin.integrations');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
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
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{integration ? t('editIntegration', { label: integration.label }) : t('editGeneric')}</DialogTitle>
        </DialogHeader>
        {schema.isLoading ? (
          <div className="h-32 animate-pulse rounded-lg bg-muted" />
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
            <p className="text-xs text-muted-foreground">
              {t('maskedHint')}
            </p>
          </div>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || Object.keys(payloadCredentials).length === 0}
          >
            <Save className="size-4" aria-hidden="true" />
            {tCommon('actions.save')}
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

  const columns: DataTableColumn<IntegrationWebhookLog>[] = [
    { id: 'event', header: t('colEvent'), cell: (log) => log.event_type ?? WEBHOOK_EVENT_FALLBACK },
    {
      id: 'status',
      header: t('colStatus'),
      cell: (log) => <Badge variant="outline">{log.status}</Badge>,
    },
    {
      id: 'payload',
      header: t('colPayload'),
      className: 'max-w-md truncate font-mono text-xs',
      cell: (log) => log.payload.truncated,
    },
    {
      id: 'received',
      header: t('colReceived'),
      className: 'text-muted-foreground',
      cell: (log) => (log.created_at ? new Date(log.created_at).toLocaleString('fr-SN') : ''),
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl bg-card ring-1 ring-border">
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-foreground">{t('title', { label: integration.label })}</h2>
          <p className="text-sm text-muted-foreground">{t('retention')}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t('closeAria')} onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <DataState
        className="m-4"
        loading={loading}
        error={error}
        skeletonRows={1}
        skeletonRowClassName="h-24"
      >
        <DataTable
          className="rounded-none ring-0"
          caption={t('tableCaption', { label: integration.label })}
          columns={columns}
          rows={logs}
          rowKey={(log) => log.id}
          emptyState={
            <EmptyState
              className="border-0"
              icon={<Activity className="size-8" aria-hidden="true" />}
              title={t('empty_title')}
              description={t('empty_description')}
            />
          }
        />
      </DataState>
    </section>
  );
}
