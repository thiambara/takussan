import { apiRequest, buildQueryString } from '@/lib/api';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type {
  Integration,
  IntegrationTestResult,
  IntegrationWebhookEndpoint,
  PaymentProviderSchema,
} from '@/types/setting';
import type { IntegrationFormPayload } from '@/lib/schemas/setting';
import { cheminApi, requete } from '@/lib/chemin-api';

/**
 * Settings & Integrations admin queries — TCK-023 / TCK-068.
 *
 * ⚠️ **`activeProfileId` traverse TOUTES les fonctions de ce module, et ce
 * n'est pas du confort.**
 *
 * `apiRequest` ne lit pas le cookie lui-même : il reçoit `activeProfileId` en
 * paramètre et ne pose l'en-tête `X-Active-Profile-Hint` que s'il l'a. Sans
 * cet en-tête, `ResolveActiveProfile` refuse la bascule automatique pour un
 * utilisateur MULTI-AGENCES — une agence active se choisit, elle ne se devine
 * pas — et `user.agency_id` reste `null` côté serveur.
 *
 * Or les cinq endpoints servis ici en dépendent tous, à la ligne :
 *
 * ```php
 * // IntegrationController::index
 * abort_unless($user->agency_id !== null && $user->isAgencyAdminAt((int) $user->agency_id), 403);
 * // SettingController::index
 * abort_unless($user->agency_id, 403);
 * ```
 *
 * MESURÉ par test API le 2026-08-27 : un `agency_admin` multi-agences appelant
 * `/api/integrations` sans le hint reçoit **403**, et l'écran rend un
 * `ErrorState` — un chemin de navigation dont la destination ne contient pas
 * ce qu'elle annonce. Le défaut était inoffensif tant que seul un super-admin
 * (qui court-circuite le test `agency_id`) atteignait ces écrans ; TCK-370, en
 * ouvrant l'entrée « Intégrations » aux `agency_admin`, en a fait un chemin
 * promis.
 *
 * *L'agence est la frontière d'isolation : une capacité se juge pour un couple
 * (utilisateur, agence). Une requête qui ne dit pas de quelle agence elle parle
 * ne pose pas une question à laquelle le serveur puisse répondre.*
 *
 * Les ÉCRITURES le portent pour la même raison, pas une moindre : `store`,
 * `update`, `destroy` et `test` comparent tous `$user->agency_id` à l'agence de
 * la ressource. Le patron est celui de `lib/queries/agencies.ts`, dont
 * l'en-tête porte l'histoire complète du défaut.
 */

export const INTEGRATION_ADMIN_FIELDS = [
  'id',
  'provider',
  'agency_id',
  'is_active',
  'last_used_at',
  'metadata',
  'created_at',
  'updated_at',
] as const;

export interface FetchIntegrationsParams {
  readonly agencyId?: number;
  readonly provider?: string;
}

export async function fetchIntegrations(
  token: string,
  params: FetchIntegrationsParams = {},
  activeProfileId?: string,
): Promise<PaginatedResponse<Integration>> {
  const filter: Record<string, string | number> = {};
  if (params.agencyId) filter.agency_id = params.agencyId;
  if (params.provider) filter.provider = params.provider;
  const qs = buildQueryString({
    fields: { integrations: INTEGRATION_ADMIN_FIELDS },
    filter,
    sort: 'provider',
    per_page: 100,
  });
  return apiRequest<PaginatedResponse<Integration>>(
    cheminApi`/api/integrations${requete(qs)}`,
    { token, activeProfileId },
  );
}

/** TCK-602 — les champs que chaque fournisseur de paiement exige, pour le formulaire. */
export async function fetchPaymentProviderSchemas(
  token: string,
  activeProfileId?: string,
): Promise<{ data: PaymentProviderSchema[] }> {
  return apiRequest<{ data: PaymentProviderSchema[] }>('/api/integrations/payment-providers', {
    token,
    activeProfileId,
  });
}

export async function createIntegration(
  token: string,
  payload: IntegrationFormPayload,
  activeProfileId?: string,
): Promise<Integration> {
  const res = await apiRequest<ApiResponse<Integration>>(`/api/integrations`, {
    method: 'POST',
    body: payload,
    token,
    activeProfileId,
  });
  return res.data;
}

export async function updateIntegration(
  token: string,
  integrationId: number,
  payload: Partial<IntegrationFormPayload>,
  activeProfileId?: string,
): Promise<Integration> {
  const res = await apiRequest<ApiResponse<Integration>>(
    cheminApi`/api/integrations/${integrationId}`,
    {
      method: 'PATCH',
      body: payload,
      token,
      activeProfileId,
    },
  );
  return res.data;
}

export async function testIntegration(
  token: string,
  integrationId: number,
  activeProfileId?: string,
): Promise<IntegrationTestResult> {
  const res = await apiRequest<ApiResponse<IntegrationTestResult>>(
    cheminApi`/api/integrations/${integrationId}/test`,
    { method: 'POST', token, activeProfileId },
  );
  return res.data;
}

/**
 * TCK-293 (ADR-0046) — l'adresse de notification d'une intégration de paiement, à déclarer chez
 * le fournisseur. Lue à part, jamais dans la liste : le jeton ne voyage pas avec les champs.
 */
export async function fetchIntegrationWebhookEndpoint(
  token: string,
  integrationId: number,
  activeProfileId?: string,
): Promise<IntegrationWebhookEndpoint> {
  const res = await apiRequest<ApiResponse<IntegrationWebhookEndpoint>>(
    cheminApi`/api/integrations/${integrationId}/webhook-endpoint`,
    { token, activeProfileId },
  );
  return res.data;
}

/** TCK-293 — tire une adresse neuve ; l'ancienne cesse de répondre dans la même écriture. */
export async function rotateIntegrationWebhookEndpoint(
  token: string,
  integrationId: number,
  activeProfileId?: string,
): Promise<IntegrationWebhookEndpoint> {
  const res = await apiRequest<ApiResponse<IntegrationWebhookEndpoint>>(
    cheminApi`/api/integrations/${integrationId}/webhook-endpoint`,
    { method: 'POST', token, activeProfileId },
  );
  return res.data;
}

export async function deleteIntegration(
  token: string,
  integrationId: number,
  activeProfileId?: string,
): Promise<void> {
  await apiRequest<unknown>(cheminApi`/api/integrations/${integrationId}`, {
    method: 'DELETE',
    token,
    activeProfileId,
  });
}
