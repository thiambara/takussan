import { apiRequest } from './api';
import type { AuthResponse } from './auth';
import type { Locale } from '@/i18n/config';
import { codeApercu } from './otp-preview';

/**
 * TCK-589 — connexion (et inscription) par numéro de téléphone vérifié, ADR-0033.
 *
 * ⚠ **Rien ici ne dit si un compte existe.** `request-code` répond 202 à l'identique, compte ou
 * non ; c'est `verify-code` qui ouvre la session — et crée le compte au besoin
 * (`is_new_account`). Le texte affiché ne doit pas en dire plus que l'API.
 */

/** Le drapeau `phone_login` de `GET /api/auth/oauth/providers` : `false` au moindre doute. */
export async function connexionParTelephoneActive(): Promise<boolean> {
  try {
    const res = await apiRequest<{ data?: { phone_login?: unknown } }>('/api/auth/oauth/providers');
    return res?.data?.phone_login === true;
  } catch {
    return false;
  }
}

export interface DemandeCodeTelephone {
  /** Secondes avant un nouvel envoi. */
  readonly attente: number;
  /** TCK-620 (ADR-0060) — le code, quand l'API le rend (hors production seulement). */
  readonly codeApercu: string | null;
}

/** `POST /api/auth/phone/request-code`. */
export async function demanderCodeTelephone(phone: string, locale?: Locale): Promise<DemandeCodeTelephone> {
  const res = await apiRequest<{ data?: { retry_after?: unknown } }>('/api/auth/phone/request-code', {
    method: 'POST',
    body: { phone },
    locale,
  });
  const attente = res?.data?.retry_after;
  return {
    attente: typeof attente === 'number' && Number.isFinite(attente) && attente > 0 ? Math.ceil(attente) : 60,
    codeApercu: codeApercu(res),
  };
}

export interface VerificationTelephonePayload {
  readonly phone: string;
  readonly code: string;
  readonly device_name?: string;
  readonly two_factor_code?: string;
  readonly recovery_code?: string;
}

export type VerificationTelephoneReponse =
  | { readonly requires_2fa: true }
  | (AuthResponse & { readonly is_new_account?: boolean });

/** `POST /api/auth/phone/verify-code`. Le corps arrive enveloppé (`data`) ou nu : les deux sont lus. */
export async function verifierCodeTelephone(
  payload: VerificationTelephonePayload,
  locale?: Locale,
): Promise<VerificationTelephoneReponse> {
  const res = await apiRequest<VerificationTelephoneReponse | { data: VerificationTelephoneReponse }>(
    '/api/auth/phone/verify-code',
    { method: 'POST', body: payload, locale },
  );
  return 'data' in res && res.data && typeof res.data === 'object' ? res.data : (res as VerificationTelephoneReponse);
}

export function exigeDoubleFacteur(
  res: VerificationTelephoneReponse,
): res is { readonly requires_2fa: true } {
  return (res as { requires_2fa?: unknown }).requires_2fa === true;
}
