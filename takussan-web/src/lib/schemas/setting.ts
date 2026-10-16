import { z } from 'zod';
import { msgValidation } from './messages';

/**
 * Integration (admin) schemas — TCK-068.
 *
 * TCK-651 (ADR-0065) — le formulaire brut d'un paramètre (clé, portée, valeur libre) a disparu avec
 * `/super-admin/settings/global` : la portée `global` s'écrit au catalogue, typée.
 */

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

/**
 * TCK-293 — les fournisseurs de paiement, miroir de l'enum `PaymentProvider` de l'API : seuls
 * ceux-là ont une adresse de notification (ADR-0046).
 */
export const PAYMENT_PROVIDER_IDS = ['wave', 'orange_money', 'lemon_squeezy'] as const;
export type PaymentProviderId = (typeof PAYMENT_PROVIDER_IDS)[number];

export function isPaymentProvider(provider: string): provider is PaymentProviderId {
  return (PAYMENT_PROVIDER_IDS as readonly string[]).includes(provider);
}

/**
 * TCK-293 — ceux dont l'adresse de notification solde réellement un paiement aujourd'hui.
 * Lemon Squeezy d'agence n'en est pas : son pilote ne relie la commande ni au checkout initié
 * (identifiants différents) ni à `custom_data` (vérification adverse, m-1). L'écran ne l'invite
 * donc pas à coller une adresse qui ne solderait rien.
 */
export const WEBHOOK_ENDPOINT_PROVIDER_IDS = ['wave', 'orange_money'] as const;
export type WebhookEndpointProviderId = (typeof WEBHOOK_ENDPOINT_PROVIDER_IDS)[number];

export function hasWebhookEndpoint(provider: string): provider is WebhookEndpointProviderId {
  return (WEBHOOK_ENDPOINT_PROVIDER_IDS as readonly string[]).includes(provider);
}

export const integrationFormSchema = z
  .object({
    provider: z
      .string()
      .trim()
      .min(1, msgValidation('setting.providerRequired'))
      .max(80, msgValidation('setting.providerTooLong')),
    is_active: z.boolean(),
    // Generic credentials (paiement, e-mail, etc.).
    api_key: z.string().trim(),
    api_secret: z.string().trim(),
    webhook_url: z
      .string()
      .trim()
      .refine(
        (v) => v === '' || /^https?:\/\/[^\s]+$/.test(v),
        msgValidation('setting.webhookUrlInvalid'),
      ),
    notes: z.string().trim().max(500, msgValidation('setting.notesTooLong')),
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
        msgValidation('setting.smsSenderAddress'),
      ),
    sms_sender_name: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || /^[A-Za-z0-9]{1,11}$/.test(v),
        msgValidation('setting.smsSenderNameOrange'),
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
        msgValidation('setting.smsSenderId'),
      ),
    sms_service_id: z.string().trim().default(''),
    // SMS LAfricaMobile — accountid + password + host override.
    sms_accountid: z.string().trim().default(''),
    // TCK-602 (ADR-0051 §3) — les identifiants d'un fournisseur de PAIEMENT, par nom de champ de
    // son schéma serveur (`GET /api/integrations/payment-providers`).
    payment_credentials: z.record(z.string(), z.string()).default({}),
    sms_host: z
      .string()
      .trim()
      .default('')
      .refine(
        (v) => v === '' || /^https?:\/\/[^\s]+$/.test(v),
        msgValidation('setting.smsHostInvalid'),
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
        message: msgValidation('setting.lamSenderIdDigit'),
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
    // TCK-602 — un fournisseur de paiement envoie les champs de son schéma ; les champs génériques
    // ne servent que de repli quand le schéma n'a pas pu être lu.
    if (isPaymentProvider(trimmedProvider)) {
      for (const [name, value] of Object.entries(values.payment_credentials ?? {})) {
        if (value.trim()) credentials[name] = value.trim();
      }
    }
    const apiKey = values.api_key.trim();
    const apiSecret = values.api_secret.trim();
    const webhookUrl = values.webhook_url.trim();
    if (apiKey && !credentials.api_key) credentials.api_key = apiKey;
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

  // TCK-110: in `edit` mode, ALWAYS send `metadata` (even when empty)
  // so the backend can distinguish "field cleared" from "field
  // unchanged". The controller treats the presence of the key as a
  // full replacement (PUT semantics). On `create`, an empty object is
  // omitted so the row's default is preserved.
  if (mode === 'edit') {
    payload.metadata = metadata;
  } else if (Object.keys(metadata).length > 0) {
    payload.metadata = metadata;
  }

  return payload;
}
