import { apiRequest } from './api';
import type { User as CanonicalUser } from '@/types/user';
import type { Locale } from '@/i18n/config';
import { cheminApi } from '@/lib/chemin-api';

export type OAuthProvider = 'google' | 'facebook' | 'apple';

export type OAuthProviderAvailability = {
  provider: OAuthProvider;
  configured: boolean;
  missing: string[];
};

export type User = CanonicalUser;

export type AuthResponse = {
  token: string;
  user: User;
  /** TCK-589 — fin de validité du jeton (ISO 8601) : le cookie n'y survit pas. */
  expires_at?: string;
};

/**
 * TCK-069 — when the account has 2FA enabled, `login` returns a 200 with
 * `{ requires_2fa: true }` (no token) instead of `AuthResponse`. Callers
 * must re-post the credentials with `two_factor_code` or `recovery_code`.
 */
export type TwoFactorChallenge = {
  requires_2fa: true;
  message?: string;
};

export type LoginResponse = AuthResponse | TwoFactorChallenge;

export function isTwoFactorChallenge(
  res: LoginResponse,
): res is TwoFactorChallenge {
  return (res as TwoFactorChallenge).requires_2fa === true;
}

export type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  password_confirmation: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  two_factor_code?: string;
  recovery_code?: string;
  device_name?: string;
};

export type UpdateProfilePayload = {
  first_name: string;
  last_name: string;
  bio?: string;
  avatar?: File | null;
  avatar_remove?: boolean;
  /**
   * E.164-formatted phone (e.g. `+221770000000`). Pass `null` or empty
   * string to clear it. Omit the key entirely to leave the current value
   * untouched. TCK-137: changing the value resets `phone_verified_at`
   * server-side.
   */
  phone?: string | null;
  /**
   * TCK-589 p3-1 — la preuve qu'exige le remplacement d'un numéro VÉRIFIÉ : le mot de passe
   * actuel, ou le code reçu sur l'ancien numéro. Sans elle, l'API rend 403
   * `phone.change_requires_proof`.
   */
  current_password?: string;
  phone_change_code?: string;
};

export async function register(payload: RegisterPayload): Promise<AuthResponse & { message: string }> {
  return apiRequest('/api/auth/register', { method: 'POST', body: payload });
}

export async function login(payload: LoginPayload, locale?: Locale): Promise<LoginResponse> {
  return apiRequest('/api/auth/login', { method: 'POST', body: payload, locale });
}

export async function logout(token: string): Promise<void> {
  return apiRequest('/api/auth/logout', { method: 'POST', token });
}

export async function getMe(token: string, activeProfileId?: string): Promise<User> {
  return apiRequest('/api/auth/me', { token, activeProfileId });
}

export async function updateProfile(token: string, payload: UpdateProfilePayload): Promise<User> {
  const formData = new FormData();
  formData.append('_method', 'PUT');
  formData.append('first_name', payload.first_name);
  formData.append('last_name', payload.last_name);
  if (payload.bio !== undefined) formData.append('bio', payload.bio);
  if (payload.avatar) formData.append('avatar', payload.avatar);
  if (payload.avatar_remove) formData.append('avatar_remove', '1');
  if (payload.phone !== undefined) formData.append('phone', payload.phone ?? '');
  if (payload.current_password) formData.append('current_password', payload.current_password);
  if (payload.phone_change_code) formData.append('phone_change_code', payload.phone_change_code);

  return apiRequest('/api/auth/profile', {
    method: 'POST',
    body: formData,
    token,
    formData: true,
  });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return apiRequest('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

export async function resetPassword(payload: {
  token: string;
  email: string;
  password: string;
  password_confirmation: string;
}): Promise<{ message: string }> {
  return apiRequest('/api/auth/reset-password', { method: 'POST', body: payload });
}

export async function resendVerification(token: string): Promise<{ message: string }> {
  return apiRequest('/api/auth/email/resend', { method: 'POST', token });
}

export async function oauthRedirect(
  provider: OAuthProvider,
): Promise<{ redirect_url: string }> {
  const res = await apiRequest<{ data: { redirect_url: string } }>(
    cheminApi`/api/auth/oauth/${provider}/redirect`,
  );
  return res.data;
}

export async function oauthProviders(): Promise<OAuthProviderAvailability[]> {
  const res = await apiRequest<{ data: { providers: OAuthProviderAvailability[] } }>(
    '/api/auth/oauth/providers',
  );
  return res.data.providers;
}

/**
 * TCK-589, vérification adverse B2 — le rappel OAuth d'un compte à 2FA ne rend pas de jeton
 * mais un défi, court et à usage unique, que `oauthSecondFactor` solde avec le TOTP ou un code
 * de récupération.
 */
export type OAuthTwoFactorChallenge = {
  requires_2fa: true;
  challenge: string;
  message?: string;
};

export type OAuthCallbackResponse = AuthResponse | OAuthTwoFactorChallenge;

export function isOAuthTwoFactorChallenge(
  res: OAuthCallbackResponse,
): res is OAuthTwoFactorChallenge {
  return (res as OAuthTwoFactorChallenge).requires_2fa === true;
}

export async function oauthCallback(
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<OAuthCallbackResponse> {
  const res = await apiRequest<{ data: OAuthCallbackResponse }>(
    cheminApi`/api/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  );
  return res.data;
}

export async function oauthSecondFactor(
  challenge: string,
  proof: { two_factor_code: string } | { recovery_code: string },
): Promise<AuthResponse> {
  const res = await apiRequest<{ data: AuthResponse }>('/api/auth/oauth/2fa', {
    method: 'POST',
    body: { challenge, ...proof },
  });
  return res.data;
}
