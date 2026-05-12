/**
 * TCK-069 — Backend clients for profile security endpoints:
 * 2FA (enable / confirm / disable / recovery codes), phone OTP
 * (send / verify), and active sessions (list / revoke).
 *
 * These wrap the raw `apiRequest` calls — the matching server actions
 * live in `src/app/actions/security.ts` and read the auth cookie.
 */

import { apiRequest } from './api';

export type TwoFactorEnableResponse = {
  secret: string;
  qr_url: string;
  // TCK-078 — inline SVG data URI rendered server-side (replaces the
  // api.qrserver.com proxy). Optional so older backend deploys still
  // surface a readable type during rolling upgrades.
  qr_svg?: string;
};

export type TwoFactorConfirmResponse = {
  enabled: true;
  recovery_codes: string[];
};

export async function twoFactorEnable(token: string): Promise<TwoFactorEnableResponse> {
  const res = await apiRequest<{ data: TwoFactorEnableResponse }>(
    '/api/auth/two-factor/enable',
    { method: 'POST', token },
  );
  return res.data;
}

export async function twoFactorConfirm(
  token: string,
  code: string,
): Promise<TwoFactorConfirmResponse> {
  const res = await apiRequest<{ data: TwoFactorConfirmResponse }>(
    '/api/auth/two-factor/confirm',
    { method: 'POST', token, body: { code } },
  );
  return res.data;
}

export async function twoFactorDisable(
  token: string,
  payload: { password?: string; code?: string },
): Promise<void> {
  await apiRequest('/api/auth/two-factor/disable', {
    method: 'POST',
    token,
    body: payload,
  });
}

export async function twoFactorRegenerateRecoveryCodes(
  token: string,
): Promise<string[]> {
  const res = await apiRequest<{ data: { recovery_codes: string[] } }>(
    '/api/auth/two-factor/recovery-codes/regenerate',
    { method: 'POST', token },
  );
  return res.data.recovery_codes;
}

export async function phoneSendOtp(
  token: string,
  phone?: string,
): Promise<{ sent: boolean; debug_code?: string }> {
  const res = await apiRequest<{ data: { sent: boolean; debug_code?: string } }>(
    '/api/auth/phone/send-otp',
    {
      method: 'POST',
      token,
      // Forward `phone` only when explicitly provided so legacy callers
      // (e.g. profile re-send) still hit the user's existing number.
      body: phone === undefined ? undefined : { phone },
    },
  );
  return res.data;
}

export async function phoneVerifyOtp(token: string, code: string): Promise<void> {
  await apiRequest('/api/auth/phone/verify-otp', {
    method: 'POST',
    token,
    body: { code },
  });
}

export type ActiveSession = {
  id: number;
  name: string;
  last_used_at: string | null;
  created_at: string | null;
  current: boolean;
  /**
   * Not currently populated — the default Sanctum `personal_access_tokens`
   * schema has no `ip` / `user_agent` columns. Kept optional so a follow-up
   * ticket can opt-in without changing the type.
   */
  ip?: string | null;
  user_agent?: string | null;
};

export async function listActiveSessions(token: string): Promise<ActiveSession[]> {
  const res = await apiRequest<{ data: ActiveSession[] }>('/api/auth/sessions', {
    token,
  });
  return res.data;
}

export async function revokeSession(token: string, sessionId: number): Promise<void> {
  await apiRequest(`/api/auth/sessions/${sessionId}`, {
    method: 'DELETE',
    token,
  });
}

/* ------------------------------------------------------------------ */
/* TCK-264 — Super-admin cooptation: mandatory 2FA enrollment.         */
/* ------------------------------------------------------------------ */

export type SuperAdminTwoFactorEnrollResponse = TwoFactorEnableResponse & {
  recovery_codes: string[];
};

export type SuperAdminTwoFactorConfirmResponse = {
  enabled: true;
  role_attached: true;
};

export async function superAdminTwoFactorEnroll(
  token: string,
): Promise<SuperAdminTwoFactorEnrollResponse> {
  const res = await apiRequest<{ data: SuperAdminTwoFactorEnrollResponse }>(
    '/api/auth/super-admin/2fa/enroll',
    { method: 'POST', token },
  );
  return res.data;
}

export async function superAdminTwoFactorConfirm(
  token: string,
  code: string,
): Promise<SuperAdminTwoFactorConfirmResponse> {
  const res = await apiRequest<{ data: SuperAdminTwoFactorConfirmResponse }>(
    '/api/auth/super-admin/2fa/confirm',
    { method: 'POST', token, body: { code } },
  );
  return res.data;
}
