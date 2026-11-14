import { apiRequest } from './api';
import { cheminApi } from './chemin-api';
import { codeApercu } from './otp-preview';
import type { AuthResponse } from './auth';
import type { Locale } from '@/i18n/config';
import type { ConditionsAAccepter } from './connexion-telephone';

/**
 * TCK-2611 (ADR-0094 § 4-5) — accepter une invitation par code SMS, et demander un nouveau lien,
 * depuis le navigateur. Les deux routes du code (TCK-2610) suivent le drapeau `phone_login` : 404
 * drapeau éteint.
 *
 * ⚠ `phone` ne part QUE pour une invitation par e-mail : par SMS, le code part au numéro de
 * l'invitation et l'API ignore celui du corps.
 */
export interface DemandeDeCode {
  readonly attente: number;
  /** TCK-620 (ADR-0060) — le code, quand l'API le rend (hors production seulement). */
  readonly codeApercu: string | null;
}

/** `POST /api/public/invitations/{token}/code`. */
export async function demanderCodeDInvitation(jeton: string, telephone: string | null, locale?: Locale): Promise<DemandeDeCode> {
  const res = await apiRequest<{ data?: { retry_after?: unknown } }>(cheminApi`/api/public/invitations/${jeton}/code`, {
    method: 'POST',
    body: telephone ? { phone: telephone } : {},
    locale,
  });
  const attente = res?.data?.retry_after;
  return {
    attente: typeof attente === 'number' && Number.isFinite(attente) && attente > 0 ? Math.ceil(attente) : 60,
    codeApercu: codeApercu(res),
  };
}

export interface VerificationDInvitation {
  readonly code: string;
  readonly phone?: string;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly two_factor_code?: string;
  readonly recovery_code?: string;
  readonly terms_version?: string;
}

/** Ce que l'acceptation rend d'utile : le rôle et le profil activé, pour l'assistant du rôle. */
export interface InvitationAccepteeParCode {
  readonly role: string;
  readonly invitable_id: number | null;
}

export type ReponseDeVerification =
  | { readonly requires_2fa: true }
  | ConditionsAAccepter
  | (AuthResponse & { readonly is_new_account?: boolean; readonly invitation: InvitationAccepteeParCode });

/** `POST /api/public/invitations/{token}/verify` : la session ouverte ET l'invitation acceptée. Corps nu. */
export async function verifierCodeDInvitation(jeton: string, payload: VerificationDInvitation, locale?: Locale): Promise<ReponseDeVerification> {
  return apiRequest<ReponseDeVerification>(cheminApi`/api/public/invitations/${jeton}/verify`, {
    method: 'POST',
    body: payload,
    locale,
  });
}

/** `POST /api/public/invitations/{token}/renewal-request` : 202, que l'invitant soit prévenu ou non. */
export async function demanderNouvelleInvitation(jeton: string, locale?: Locale): Promise<void> {
  await apiRequest(cheminApi`/api/public/invitations/${jeton}/renewal-request`, { method: 'POST', locale });
}
