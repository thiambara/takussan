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

export const integrationFormSchema = z.object({
  provider: z
    .string()
    .trim()
    .min(1, 'Le fournisseur est requis.')
    .max(80, 'Le nom du fournisseur est trop long.'),
  is_active: z.boolean(),
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
});

export type IntegrationFormValues = z.infer<typeof integrationFormSchema>;

export interface IntegrationFormPayload {
  provider: string;
  is_active: boolean;
  credentials: Record<string, string>;
  metadata?: Record<string, unknown> | null;
}

export function normaliseIntegrationForm(
  values: IntegrationFormValues,
  mode: 'create' | 'edit',
): IntegrationFormPayload {
  const credentials: Record<string, string> = {};
  const apiKey = values.api_key.trim();
  const apiSecret = values.api_secret.trim();
  const webhookUrl = values.webhook_url.trim();

  if (apiKey) credentials.api_key = apiKey;
  if (apiSecret) credentials.api_secret = apiSecret;
  if (webhookUrl) credentials.webhook_url = webhookUrl;

  const metadata: Record<string, unknown> = {};
  const notes = values.notes.trim();
  if (notes) metadata.notes = notes;

  // On edit we omit `credentials` when the user didn't type anything new —
  // the backend keeps the previously stored secret intact.
  const payload: IntegrationFormPayload = {
    provider: values.provider.trim(),
    is_active: values.is_active,
    credentials,
  };

  if (mode === 'edit' && Object.keys(credentials).length === 0) {
    // sentinel: callers should drop the key. We return an empty object so
    // the type still matches.
    delete (payload as Partial<IntegrationFormPayload>).credentials;
  }

  if (Object.keys(metadata).length > 0) payload.metadata = metadata;

  return payload;
}
