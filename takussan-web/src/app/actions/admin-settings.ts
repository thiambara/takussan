'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { ApiError, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  createIntegration,
  deleteIntegration,
  deleteSetting,
  fetchIntegrations,
  fetchSettings,
  testIntegration,
  updateIntegration,
  updateSetting,
  upsertSetting,
  type FetchSettingsParams,
} from '@/lib/queries/settings';
import type { IntegrationFormPayload } from '@/lib/schemas/setting';
import type {
  Integration,
  IntegrationTestResult,
  Setting,
  SettingScope,
} from '@/types/setting';
import type { PaginatedResponse } from '@/types/api';

/**
 * Admin settings & integrations server actions — TCK-068.
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

async function mapError(e: unknown): Promise<{
  status?: number;
  message: string;
  errors?: Record<string, string[]>;
}> {
  // `messageErreurApi` compose le CODE de l'erreur avec un traducteur que CE contexte sait
  // obtenir. Ce module est `'use server'` : `getTranslations` de `next-intl/server` est la seule
  // primitive correcte ici. Lire `e.displayMessage` seul rendait la clé i18n brute à l'écran.
  const [tRacine, t] = await Promise.all([
    getTranslations(),
    getTranslations('serverActions.shared'),
  ]);
  const repli = t('networkErrorRetry');
  if (e instanceof ApiError) {
    return {
      status: e.status,
      message: messageErreurApi(e, tRacine, repli),
      errors: e.validationErrors,
    };
  }
  return { message: repli };
}

async function requireToken(): Promise<
  { ok: true; token: string } | { ok: false; result: ActionResult<never> }
> {
  const token = await getToken();
  if (!token) {
    const t = await getTranslations('serverActions.shared');
    return {
      ok: false,
      result: { ok: false, status: 401, message: t('authRequired') },
    };
  }
  return { ok: true, token };
}

export async function fetchSettingsAction(
  params: FetchSettingsParams = {},
): Promise<ActionResult<PaginatedResponse<Setting>>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await fetchSettings(auth.token, params);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function upsertSettingAction(payload: {
  key: string;
  scope: SettingScope;
  value: Record<string, unknown>;
  scope_id?: number | null;
}): Promise<ActionResult<Setting>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await upsertSetting(auth.token, payload);
    revalidatePath('/admin/settings');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function updateSettingAction(
  settingId: number,
  value: Record<string, unknown>,
): Promise<ActionResult<Setting>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateSetting(auth.token, settingId, value);
    revalidatePath('/admin/settings');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function deleteSettingAction(settingId: number): Promise<ActionResult<void>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await deleteSetting(auth.token, settingId);
    revalidatePath('/admin/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function fetchIntegrationsAction(): Promise<
  ActionResult<PaginatedResponse<Integration>>
> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await fetchIntegrations(auth.token);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function createIntegrationAction(
  payload: IntegrationFormPayload,
): Promise<ActionResult<Integration>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await createIntegration(auth.token, payload);
    revalidatePath('/admin/settings/integrations');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function updateIntegrationAction(
  integrationId: number,
  payload: Partial<IntegrationFormPayload>,
): Promise<ActionResult<Integration>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateIntegration(auth.token, integrationId, payload);
    revalidatePath('/admin/settings/integrations');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function testIntegrationAction(
  integrationId: number,
): Promise<ActionResult<IntegrationTestResult>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await testIntegration(auth.token, integrationId);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function deleteIntegrationAction(
  integrationId: number,
): Promise<ActionResult<void>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await deleteIntegration(auth.token, integrationId);
    revalidatePath('/admin/settings/integrations');
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}
