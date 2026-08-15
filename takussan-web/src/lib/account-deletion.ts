/**
 * TCK-080 — Backend client for the RGPD self-service deletion endpoints.
 * Server-action wrappers live in `src/app/actions/account-deletion.ts`.
 */

import { apiRequest } from './api';

export type AccountDeletionRequest = {
  id: number;
  requested_at: string | null;
  scheduled_for: string | null;
  reason?: string | null;
  reason_code?: string | null;
  days_remaining: number;
  executed_at?: string | null;
};

export type AccountDeletionObligation = {
  type: 'lease' | 'lease_payment' | 'invoice' | 'booking';
  id: number;
  reference: string | null;
  label: string;
};

/**
 * TCK-272 — deux modes de step-up mutuellement exclusifs, et c'est le
 * SERVEUR qui tranche : `password` pour les comptes qui en ont un,
 * `step_up_code` (6 chiffres reçus par e-mail) pour ceux dont le hash
 * stocké est une valeur machine. Envoyer le mauvais champ produit un 422
 * qui oriente vers l'autre voie — pas un « Mot de passe incorrect. ».
 */
export type RequestAccountDeletionPayload = {
  password?: string;
  step_up_code?: string;
  reason?: string;
  reason_code?: 'service_completed' | 'quality_issue' | 'privacy' | 'other';
  two_factor_code?: string;
  recovery_code?: string;
};

export async function getAccountDeletionRequest(
  token: string,
): Promise<AccountDeletionRequest | null> {
  const res = await apiRequest<{ data: AccountDeletionRequest | null }>(
    '/api/auth/me/deletion-request',
    { token },
  );
  return res.data;
}

export async function requestAccountDeletion(
  token: string,
  payload: RequestAccountDeletionPayload,
): Promise<AccountDeletionRequest> {
  const res = await apiRequest<{ data: AccountDeletionRequest }>(
    '/api/auth/me/deletion-request',
    { method: 'POST', token, body: payload },
  );
  return res.data;
}

/**
 * TCK-272 — demande l'envoi du code de step-up par e-mail. Le préfixe
 * `/api` est écrit ici : `apiRequest` ne l'ajoute pas (contrairement à
 * `apiFetch`), et l'oublier produit un `net::ERR_FAILED` par CORS.
 */
export async function sendAccountDeletionStepUpCode(token: string): Promise<void> {
  await apiRequest('/api/auth/me/deletion-request/step-up', {
    method: 'POST',
    token,
  });
}

export async function cancelAccountDeletion(token: string): Promise<void> {
  await apiRequest('/api/auth/me/deletion-request', {
    method: 'DELETE',
    token,
  });
}
