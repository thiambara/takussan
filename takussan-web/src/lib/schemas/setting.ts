import { z } from 'zod';

/**
 * Setting / Integration (admin) schemas — TCK-068.
 */

export const settingScopeValues = ['global', 'agency'] as const;

export const settingFormSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'La clé est requise.')
    .max(255, 'La clé est trop longue.')
    .regex(/^[a-z0-9_.-]+$/i, 'Caractères invalides (alphanumériques, ".", "_" et "-").'),
  scope: z.enum(settingScopeValues),
  value: z.string(), // raw text / JSON — validated at submit time
});

export type SettingFormValues = z.infer<typeof settingFormSchema>;

/**
 * Parse the raw text input into a JSON-compatible value. Accepts
 * `true/false`, numbers, JSON literals (`{...}`, `[...]`) and falls back
 * to a plain string. The backend stores `value` as a JSON array/object so
 * scalars are wrapped in `{ value: <scalar> }` — matching how TCK-023 seeds
 * basic settings.
 */
export function parseSettingRawValue(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed === '') return { value: null };
  if (trimmed === 'true') return { value: true };
  if (trimmed === 'false') return { value: false };
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return { value: Number(trimmed) };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return { value: parsed };
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
      return { value: parsed };
    } catch {
      /* fallthrough to string */
    }
  }
  return { value: trimmed };
}

/**
 * Flatten the API value back to a raw text input. Mirrors
 * `parseSettingRawValue` so the round-trip is stable for the common cases.
 */
export function stringifySettingValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('value' in obj && Object.keys(obj).length === 1) {
      return stringifySettingValue(obj.value);
    }
    return JSON.stringify(obj, null, 2);
  }
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return String(value);
}

/**
 * SMS provider IDs supported by the multi-provider router (TCK-102).
 * Each one has its own credential schema; the dialog renders specific
 * fields when the chosen provider matches one of these.
 */
export const SMS_PROVIDER_IDS = ['sms_orange', 'sms_mtarget', 'sms_lafricamobile'] as const;
export type SmsProviderId = (typeof SMS_PROVIDER_IDS)[number];

export function isSmsProvider(provider: string): provider is SmsProviderId {
  return (SMS_PROVIDER_IDS as readonly string[]).includes(provider);
}

export const integrationFormSchema = z
  .object({
    provider: z
      .string()
      .trim()
      .min(1, 'Le fournisseur est requis.')
      .max(80, 'Le nom du fournisseur est trop long.'),
    is_active: z.boolean(),
    // Generic credentials (paiement, e-mail, etc.).
    api_key: z.string().trim(),
    api_secret: z.string().trim(),
    webhook_url: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || /^https?:\/\/[^\s]+$/.test(v),
        'URL invalide. Exemple : https://exemple.sn/webhook',
      ),
    notes: z.string().trim().max(500, 'Note trop longue.'),
    // SMS Orange (TCK-102) — OAuth 2.0. Each SMS field defaults to ''
    // so callers that haven't migrated their fixtures keep working;
    // the form supplies all of them via `emptyForm()`.
    sms_client_id: z.string().trim().default(''),
    sms_client_secret: z.string().trim().default(''),
    sms_sender_address: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || /^tel:\+221\d{9}$/.test(v),
        'Format attendu : tel:+221XXXXXXXXX (numéro Orange SN).',
      ),
    sms_sender_name: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || /^[A-Za-z0-9]{1,11}$/.test(v),
        'Sender name ≤ 11 caractères alphanumériques (whitelist Orange).',
      ),
    // SMS Mtarget — Basic auth + sender alphanumérique.
    sms_username: z.string().trim().default(''),
    sms_password: z.string().trim().default(''),
    sms_sender_id: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || /^[A-Za-z0-9]{1,11}$/.test(v),
        'Sender ID ≤ 11 caractères alphanumériques.',
      ),
    sms_service_id: z.string().trim().default(''),
    // SMS LAfricaMobile — accountid + password + host override.
    sms_accountid: z.string().trim().default(''),
    sms_host: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || /^https?:\/\/[^\s]+$/.test(v),
        'Host invalide. Exemple : https://lampush-tls.lafricamobile.com',
      ),
  })
  .superRefine((values, ctx) => {
    // LAM sender_id MUST NOT start with a digit (provider constraint).
    if (
      values.provider === 'sms_lafricamobile'
      && values.sms_sender_id !== ''
      && /^\d/.test(values.sms_sender_id)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sms_sender_id'],
        message: 'LAfricaMobile : le sender ID ne doit pas commencer par un chiffre.',
      });
    }
  });

export type IntegrationFormValues = z.infer<typeof integrationFormSchema>;

export interface IntegrationFormPayload {
  provider: string;
  is_active: boolean;
  credentials: Record<string, string>;
  metadata?: Record<string, unknown> | null;
}

/**
 * Build the create/edit payload for one Integration row. Branches per
 * provider:
 *
 *   - generic: api_key / api_secret / webhook_url stored under
 *     `credentials.*` (existing TCK-068 behaviour).
 *   - sms_*  : auth identifiers + secrets land under `credentials`
 *     (encrypted), display-y values (sender_*, host, service_id) land
 *     under `metadata` so they remain readable in the listing UI. The
 *     backend driver reads either bucket (TCK-102).
 *
 * On edit, `credentials` is dropped when no new value was typed — the
 * backend keeps the previously stored secret intact.
 */
export function normaliseIntegrationForm(
  values: IntegrationFormValues,
  mode: 'create' | 'edit',
): IntegrationFormPayload {
  const credentials: Record<string, string> = {};
  const metadata: Record<string, unknown> = {};

  const trimmedProvider = values.provider.trim();
  if (isSmsProvider(trimmedProvider)) {
    if (trimmedProvider === 'sms_orange') {
      const clientId = values.sms_client_id.trim();
      const clientSecret = values.sms_client_secret.trim();
      const senderAddress = values.sms_sender_address.trim();
      const senderName = values.sms_sender_name.trim();
      if (clientId) credentials.client_id = clientId;
      if (clientSecret) credentials.client_secret = clientSecret;
      if (senderAddress) metadata.sender_address = senderAddress;
      if (senderName) metadata.sender_name = senderName;
    } else if (trimmedProvider === 'sms_mtarget') {
      const username = values.sms_username.trim();
      const password = values.sms_password.trim();
      const senderId = values.sms_sender_id.trim();
      const serviceId = values.sms_service_id.trim();
      if (username) credentials.username = username;
      if (password) credentials.password = password;
      if (senderId) metadata.sender_id = senderId;
      if (serviceId) metadata.service_id = serviceId;
    } else if (trimmedProvider === 'sms_lafricamobile') {
      const accountId = values.sms_accountid.trim();
      const password = values.sms_password.trim();
      const senderId = values.sms_sender_id.trim();
      const host = values.sms_host.trim();
      if (accountId) credentials.accountid = accountId;
      if (password) credentials.password = password;
      if (senderId) metadata.sender_id = senderId;
      if (host) metadata.host = host;
    }
  } else {
    const apiKey = values.api_key.trim();
    const apiSecret = values.api_secret.trim();
    const webhookUrl = values.webhook_url.trim();
    if (apiKey) credentials.api_key = apiKey;
    if (apiSecret) credentials.api_secret = apiSecret;
    if (webhookUrl) credentials.webhook_url = webhookUrl;
  }

  const notes = values.notes.trim();
  if (notes) metadata.notes = notes;

  const payload: IntegrationFormPayload = {
    provider: trimmedProvider,
    is_active: values.is_active,
    credentials,
  };

  if (mode === 'edit' && Object.keys(credentials).length === 0) {
    // Sentinel: callers should drop the key. We return an empty object
    // so the type still matches.
    delete (payload as Partial<IntegrationFormPayload>).credentials;
  }

  if (Object.keys(metadata).length > 0) payload.metadata = metadata;

  return payload;
}
