'use client';

import { useCallback, useState, useTransition } from 'react';
import { CheckCircle2, Loader2, Plug, Plus, Trash2, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormError, FormGlobalError } from '@/components/forms';
import {
  integrationFormSchema,
  normaliseIntegrationForm,
  type IntegrationFormValues,
} from '@/lib/schemas/setting';
import {
  createIntegrationAction,
  deleteIntegrationAction,
  testIntegrationAction,
  updateIntegrationAction,
} from '@/app/actions/admin-settings';
import type { Integration, IntegrationTestResult } from '@/types/setting';

/**
 * Integration providers manager — TCK-068.
 *
 * Cards-per-provider layout. The create/edit dialog treats credentials as
 * write-only: on edit, an empty input keeps the existing secret intact
 * (the backend never returns secrets in clear text).
 */

interface IntegrationsManagerProps {
  readonly initialIntegrations: Integration[];
}

const PROVIDER_SUGGESTIONS = [
  { value: 'wave', label: 'Wave' },
  { value: 'orange_money', label: 'Orange Money' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'mailgun', label: 'Mailgun' },
  { value: 'twilio', label: 'Twilio' },
];

function emptyForm(): IntegrationFormValues {
  return {
    provider: '',
    is_active: true,
    api_key: '',
    api_secret: '',
    webhook_url: '',
    notes: '',
  };
}

export function IntegrationsManager({ initialIntegrations }: IntegrationsManagerProps) {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations);
  const [testResults, setTestResults] = useState<
    Record<number, { kind: 'success' | 'error'; message: string } | 'loading' | undefined>
  >({});
  const [dialogMode, setDialogMode] = useState<'closed' | 'create' | { edit: Integration }>('closed');
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleTest = useCallback((integration: Integration) => {
    setTestResults((prev) => ({ ...prev, [integration.id]: 'loading' }));
    startTransition(async () => {
      const result = await testIntegrationAction(integration.id);
      if (!result.ok) {
        setTestResults((prev) => ({
          ...prev,
          [integration.id]: { kind: 'error', message: result.message },
        }));
        return;
      }
      const payload = result.data as IntegrationTestResult;
      setTestResults((prev) => ({
        ...prev,
        [integration.id]: {
          kind: payload.ok ? 'success' : 'error',
          message: payload.message,
        },
      }));
      if (payload.ok && payload.last_used_at) {
        setIntegrations((prev) =>
          prev.map((i) =>
            i.id === integration.id ? { ...i, last_used_at: payload.last_used_at ?? null } : i,
          ),
        );
      }
    });
  }, []);

  const handleToggle = useCallback((integration: Integration) => {
    startTransition(async () => {
      const result = await updateIntegrationAction(integration.id, {
        is_active: !integration.is_active,
      });
      if (!result.ok) {
        setRowError({ id: integration.id, message: result.message });
        return;
      }
      if (result.data) {
        setIntegrations((prev) =>
          prev.map((i) => (i.id === integration.id ? (result.data as Integration) : i)),
        );
      }
    });
  }, []);

  const handleDelete = useCallback((integration: Integration) => {
    const ok = window.confirm(
      `Supprimer l'intégration « ${integration.provider} » ? Cette action est irréversible.`,
    );
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteIntegrationAction(integration.id);
      if (!result.ok) {
        setRowError({ id: integration.id, message: result.message });
        return;
      }
      setIntegrations((prev) => prev.filter((i) => i.id !== integration.id));
    });
  }, []);

  const handleCreate = useCallback(
    async (values: IntegrationFormValues) => {
      const parsed = integrationFormSchema.safeParse(values);
      if (!parsed.success) {
        return {
          ok: false as const,
          errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
      }
      const payload = normaliseIntegrationForm(parsed.data, 'create');
      const result = await createIntegrationAction(payload);
      if (!result.ok) {
        return {
          ok: false as const,
          errors: result.errors ?? { provider: [result.message] },
        };
      }
      if (result.data) setIntegrations((prev) => [result.data as Integration, ...prev]);
      return { ok: true as const };
    },
    [],
  );

  const handleEdit = useCallback(
    async (integration: Integration, values: IntegrationFormValues) => {
      const parsed = integrationFormSchema.safeParse(values);
      if (!parsed.success) {
        return {
          ok: false as const,
          errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
      }
      const payload = normaliseIntegrationForm(parsed.data, 'edit');
      const result = await updateIntegrationAction(integration.id, payload);
      if (!result.ok) {
        return {
          ok: false as const,
          errors: result.errors ?? { provider: [result.message] },
        };
      }
      if (result.data) {
        setIntegrations((prev) =>
          prev.map((i) => (i.id === integration.id ? (result.data as Integration) : i)),
        );
      }
      return { ok: true as const };
    },
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-ink-muted">
          Connectez les providers externes (paiement, SMS, e-mail). Les secrets ne
          sont jamais ré-affichés après enregistrement.
        </p>
        <Button type="button" onClick={() => setDialogMode('create')}>
          <Plus aria-hidden="true" />
          <span>Ajouter une intégration</span>
        </Button>
      </div>

      {integrations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-input bg-app-surface-1 p-8 text-center text-sm text-app-ink-muted">
          Aucune intégration configurée. Ajoutez-en une pour permettre les paiements
          Wave, Orange Money, Stripe, etc.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {integrations.map((integration) => {
            const testState = testResults[integration.id];
            return (
              <article
                key={integration.id}
                className="rounded-xl border border-input bg-app-surface-1 p-5 space-y-3"
              >
                <header className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Plug className="size-5 text-primary" aria-hidden="true" />
                    <div>
                      <h3 className="text-sm font-semibold capitalize text-app-ink">
                        {integration.provider.replace(/_/g, ' ')}
                      </h3>
                      <p className="text-xs text-app-ink-muted">
                        {integration.is_active ? 'Active' : 'Désactivée'}
                        {integration.last_used_at ? ` • dernier test : ${new Date(integration.last_used_at).toLocaleString('fr-FR')}` : null}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={integration.is_active ? 'outline' : 'default'}
                    onClick={() => handleToggle(integration)}
                    disabled={isPending}
                  >
                    {integration.is_active ? 'Désactiver' : 'Activer'}
                  </Button>
                </header>

                {testState === 'loading' ? (
                  <div className="flex items-center gap-2 text-xs text-app-ink-muted">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    <span>Test en cours…</span>
                  </div>
                ) : testState ? (
                  <div
                    role="status"
                    className={`flex items-center gap-2 text-xs ${
                      testState.kind === 'success' ? 'text-green-700' : 'text-destructive'
                    }`}
                  >
                    {testState.kind === 'success' ? (
                      <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    ) : (
                      <XCircle className="size-3.5" aria-hidden="true" />
                    )}
                    <span>{testState.message}</span>
                  </div>
                ) : null}

                {rowError?.id === integration.id ? (
                  <FormError>{rowError.message}</FormError>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(integration)}
                    disabled={isPending}
                  >
                    Tester la connexion
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDialogMode({ edit: integration })}
                    disabled={isPending}
                  >
                    Configurer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={`Supprimer ${integration.provider}`}
                    onClick={() => handleDelete(integration)}
                    disabled={isPending}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {dialogMode !== 'closed' ? (
        <IntegrationDialog
          open
          onClose={() => setDialogMode('closed')}
          mode={dialogMode === 'create' ? 'create' : 'edit'}
          integration={dialogMode === 'create' ? undefined : dialogMode.edit}
          onCreate={handleCreate}
          onEdit={handleEdit}
        />
      ) : null}
    </div>
  );
}

interface IntegrationDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mode: 'create' | 'edit';
  readonly integration?: Integration;
  readonly onCreate: (
    values: IntegrationFormValues,
  ) => Promise<{ ok: true } | { ok: false; errors: Record<string, string[]> }>;
  readonly onEdit: (
    integration: Integration,
    values: IntegrationFormValues,
  ) => Promise<{ ok: true } | { ok: false; errors: Record<string, string[]> }>;
}

function IntegrationDialog({
  open,
  onClose,
  mode,
  integration,
  onCreate,
  onEdit,
}: IntegrationDialogProps) {
  const [values, setValues] = useState<IntegrationFormValues>(() => {
    if (mode === 'edit' && integration) {
      const notes =
        integration.metadata && typeof integration.metadata === 'object'
          ? String((integration.metadata as Record<string, unknown>).notes ?? '')
          : '';
      return {
        provider: integration.provider,
        is_active: integration.is_active,
        api_key: '',
        api_secret: '',
        webhook_url: '',
        notes,
      };
    }
    return emptyForm();
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSubmitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    const result =
      mode === 'edit' && integration
        ? await onEdit(integration, values)
        : await onCreate(values);
    setSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nouvelle intégration' : `Configurer ${integration?.provider}`}
          </DialogTitle>
          <DialogDescription>
            Les identifiants sont stockés chiffrés côté serveur. Laissez les champs
            secrets vides en édition pour conserver la valeur actuelle.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="int-provider" className="mb-1.5 block text-sm font-medium">
              Fournisseur <span className="text-destructive">*</span>
            </label>
            <Input
              id="int-provider"
              list="int-provider-suggestions"
              value={values.provider}
              onChange={(e) => setValues((v) => ({ ...v, provider: e.target.value }))}
              disabled={mode === 'edit'}
              placeholder="wave, stripe, mailgun…"
              required
            />
            <datalist id="int-provider-suggestions">
              {PROVIDER_SUGGESTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </datalist>
            <FormError>{errors.provider?.[0]}</FormError>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SecretInput
              id="int-api-key"
              label="Clé API"
              placeholder={mode === 'edit' ? '•••••••• (inchangé)' : ''}
              value={values.api_key}
              onChange={(v) => setValues((current) => ({ ...current, api_key: v }))}
              error={errors.api_key?.[0] ?? errors['credentials.api_key']?.[0]}
            />
            <SecretInput
              id="int-api-secret"
              label="Secret"
              placeholder={mode === 'edit' ? '•••••••• (inchangé)' : ''}
              value={values.api_secret}
              onChange={(v) => setValues((current) => ({ ...current, api_secret: v }))}
              error={errors.api_secret?.[0] ?? errors['credentials.api_secret']?.[0]}
            />
          </div>
          <div>
            <label htmlFor="int-webhook" className="mb-1.5 block text-sm font-medium">
              URL de webhook
            </label>
            <Input
              id="int-webhook"
              type="url"
              value={values.webhook_url}
              onChange={(e) => setValues((v) => ({ ...v, webhook_url: e.target.value }))}
              placeholder="https://exemple.sn/webhook"
            />
            <FormError>{errors.webhook_url?.[0]}</FormError>
          </div>
          <div>
            <label htmlFor="int-notes" className="mb-1.5 block text-sm font-medium">
              Notes (interne)
            </label>
            <Textarea
              id="int-notes"
              value={values.notes}
              onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
              rows={2}
              placeholder="ex : compte de prod, rotation le 15/04"
            />
            <FormError>{errors.notes?.[0]}</FormError>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => setValues((v) => ({ ...v, is_active: e.target.checked }))}
              className="size-4 accent-primary"
            />
            <span>Intégration active</span>
          </label>
          {errors.root?.[0] ? <FormGlobalError>{errors.root[0]}</FormGlobalError> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>Enregistrement…</span>
                </>
              ) : (
                <span>{mode === 'create' ? 'Ajouter' : 'Enregistrer'}</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SecretInputProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly placeholder?: string;
  readonly error?: string;
}

/**
 * Secret input — TCK-068. Renders a masked `<input type="password">` with a
 * visibility toggle. The value is never pre-populated with the stored secret
 * (the backend marks credentials as hidden).
 */
function SecretInput({ id, label, value, onChange, placeholder, error }: SecretInputProps) {
  const [reveal, setReveal] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={reveal ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="pr-16"
        />
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          className="absolute inset-y-0 right-0 flex items-center pr-2 text-xs text-muted-foreground underline"
        >
          {reveal ? 'Masquer' : 'Afficher'}
        </button>
      </div>
      <FormError>{error}</FormError>
    </div>
  );
}
