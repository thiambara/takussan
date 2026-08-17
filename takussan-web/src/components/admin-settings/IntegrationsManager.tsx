'use client';

import { useCallback, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, Plug, Plus, Trash2, XCircle } from 'lucide-react';
import { EmptyState } from '@/components/feedback';

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
  isSmsProvider,
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
  // TCK-102 — SMS multi-provider. `sms_free` and `sms_expresso` sont
  // réservés (placeholders) tant qu'aucun contrat carrier-direct
  // n'existe ; ils ne figurent pas ici.
  { value: 'sms_orange', label: 'SMS — Orange Sénégal' },
  { value: 'sms_mtarget', label: 'SMS — Mtarget' },
  { value: 'sms_lafricamobile', label: 'SMS — LAfricaMobile' },
];

function emptyForm(): IntegrationFormValues {
  return {
    provider: '',
    is_active: true,
    api_key: '',
    api_secret: '',
    webhook_url: '',
    notes: '',
    sms_client_id: '',
    sms_client_secret: '',
    sms_sender_address: '',
    sms_sender_name: '',
    sms_username: '',
    sms_password: '',
    sms_sender_id: '',
    sms_service_id: '',
    sms_accountid: '',
    sms_host: '',
  };
}

export function IntegrationsManager({ initialIntegrations }: IntegrationsManagerProps) {
  const t = useTranslations('adminSettings.integrations');
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
        <EmptyState
          icon={<Plug className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
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
      const meta =
        integration.metadata && typeof integration.metadata === 'object'
          ? (integration.metadata as Record<string, unknown>)
          : {};
      const readMeta = (key: string) => String(meta[key] ?? '');
      return {
        ...emptyForm(),
        provider: integration.provider,
        is_active: integration.is_active,
        notes: readMeta('notes'),
        // Pre-fill the non-secret SMS fields stored in metadata so the
        // user sees the current sender address / host / sender id /
        // service id without re-typing. Secrets remain blank — the
        // backend never returns them.
        sms_sender_address: readMeta('sender_address'),
        sms_sender_name: readMeta('sender_name'),
        sms_sender_id: readMeta('sender_id'),
        sms_service_id: readMeta('service_id'),
        sms_host: readMeta('host'),
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
          <SmsProviderFieldset
            provider={values.provider}
            mode={mode}
            values={values}
            errors={errors}
            onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          />
          {!isSmsProvider(values.provider) ? (
            <>
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
            </>
          ) : null}
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

interface SmsProviderFieldsetProps {
  readonly provider: string;
  readonly mode: 'create' | 'edit';
  readonly values: IntegrationFormValues;
  readonly errors: Record<string, string[]>;
  readonly onChange: (patch: Partial<IntegrationFormValues>) => void;
}

/**
 * TCK-102 — Provider-specific credential fields for the multi-provider
 * SMS router (Orange / Mtarget / LAfricaMobile). Renders nothing for
 * non-SMS providers — the dialog falls back to its generic fields.
 *
 * Display strategy: secrets (passwords / client_secret / accountid /
 * username) use {@see SecretInput}; non-secret display values
 * (sender_address, sender_id, host, …) are plain inputs because the
 * backend stores them in `metadata` rather than `credentials`.
 */
function SmsProviderFieldset({
  provider,
  mode,
  values,
  errors,
  onChange,
}: SmsProviderFieldsetProps) {
  if (!isSmsProvider(provider)) return null;
  const editPlaceholder = mode === 'edit' ? '•••••••• (inchangé)' : '';

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <strong className="font-semibold">Conformité ARTP / Sénégal :</strong>{' '}
        souscription business soumise à la fourniture du <strong>NINEA</strong>{' '}
        et du <strong>RCCM</strong> (Loi 2018-28, Art. 36, en vigueur depuis
        janvier 2025). Les SMS sont interdits entre 22h et 06h Africa/Dakar
        sauf 2FA / OTP / alertes de sécurité.
      </div>

      {provider === 'sms_orange' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SecretInput
            id="int-orange-client-id"
            label="Client ID"
            placeholder={editPlaceholder}
            value={values.sms_client_id}
            onChange={(v) => onChange({ sms_client_id: v })}
            error={errors.sms_client_id?.[0] ?? errors['credentials.client_id']?.[0]}
          />
          <SecretInput
            id="int-orange-client-secret"
            label="Client secret"
            placeholder={editPlaceholder}
            value={values.sms_client_secret}
            onChange={(v) => onChange({ sms_client_secret: v })}
            error={errors.sms_client_secret?.[0] ?? errors['credentials.client_secret']?.[0]}
          />
          <div>
            <label htmlFor="int-orange-sender-address" className="mb-1.5 block text-sm font-medium">
              Sender address (SIM Orange SN)
            </label>
            <Input
              id="int-orange-sender-address"
              value={values.sms_sender_address}
              onChange={(e) => onChange({ sms_sender_address: e.target.value })}
              placeholder="tel:+221771234567"
              autoComplete="off"
            />
            <FormError>{errors.sms_sender_address?.[0]}</FormError>
          </div>
          <div>
            <label htmlFor="int-orange-sender-name" className="mb-1.5 block text-sm font-medium">
              Sender name (≤ 11, whitelist Orange)
            </label>
            <Input
              id="int-orange-sender-name"
              value={values.sms_sender_name}
              onChange={(e) => onChange({ sms_sender_name: e.target.value })}
              placeholder="TAKUSSAN"
              maxLength={11}
              autoComplete="off"
            />
            <FormError>{errors.sms_sender_name?.[0]}</FormError>
          </div>
        </div>
      ) : null}

      {provider === 'sms_mtarget' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SecretInput
            id="int-mtarget-username"
            label="Username"
            placeholder={editPlaceholder}
            value={values.sms_username}
            onChange={(v) => onChange({ sms_username: v })}
            error={errors.sms_username?.[0] ?? errors['credentials.username']?.[0]}
          />
          <SecretInput
            id="int-mtarget-password"
            label="Password"
            placeholder={editPlaceholder}
            value={values.sms_password}
            onChange={(v) => onChange({ sms_password: v })}
            error={errors.sms_password?.[0] ?? errors['credentials.password']?.[0]}
          />
          <div>
            <label htmlFor="int-mtarget-sender-id" className="mb-1.5 block text-sm font-medium">
              Sender ID (≤ 11, alphanum)
            </label>
            <Input
              id="int-mtarget-sender-id"
              value={values.sms_sender_id}
              onChange={(e) => onChange({ sms_sender_id: e.target.value })}
              placeholder="TAKUSSAN"
              maxLength={11}
              autoComplete="off"
            />
            <FormError>{errors.sms_sender_id?.[0]}</FormError>
          </div>
          <div>
            <label htmlFor="int-mtarget-service-id" className="mb-1.5 block text-sm font-medium">
              Service ID (optionnel)
            </label>
            <Input
              id="int-mtarget-service-id"
              value={values.sms_service_id}
              onChange={(e) => onChange({ sms_service_id: e.target.value })}
              autoComplete="off"
            />
            <FormError>{errors.sms_service_id?.[0]}</FormError>
          </div>
        </div>
      ) : null}

      {provider === 'sms_lafricamobile' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SecretInput
            id="int-lam-accountid"
            label="Account ID"
            placeholder={editPlaceholder}
            value={values.sms_accountid}
            onChange={(v) => onChange({ sms_accountid: v })}
            error={errors.sms_accountid?.[0] ?? errors['credentials.accountid']?.[0]}
          />
          <SecretInput
            id="int-lam-password"
            label="Password"
            placeholder={editPlaceholder}
            value={values.sms_password}
            onChange={(v) => onChange({ sms_password: v })}
            error={errors.sms_password?.[0] ?? errors['credentials.password']?.[0]}
          />
          <div>
            <label htmlFor="int-lam-sender-id" className="mb-1.5 block text-sm font-medium">
              Sender ID (≤ 11, ne doit pas commencer par un chiffre)
            </label>
            <Input
              id="int-lam-sender-id"
              value={values.sms_sender_id}
              onChange={(e) => onChange({ sms_sender_id: e.target.value })}
              placeholder="Takussan"
              maxLength={11}
              autoComplete="off"
            />
            <FormError>{errors.sms_sender_id?.[0]}</FormError>
          </div>
          <div>
            <label htmlFor="int-lam-host" className="mb-1.5 block text-sm font-medium">
              Host LAMPUSH (optionnel — override par défaut)
            </label>
            <Input
              id="int-lam-host"
              type="url"
              value={values.sms_host}
              onChange={(e) => onChange({ sms_host: e.target.value })}
              placeholder="https://lampush-tls.lafricamobile.com"
              autoComplete="off"
            />
            <FormError>{errors.sms_host?.[0]}</FormError>
          </div>
        </div>
      ) : null}
    </div>
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
