'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { ApiError, messageErreurApi } from '@/lib/api';
import { getOperatorActiveProfileId, getOperatorToken } from '@/lib/session';
import {
  deleteSetting,
  fetchSettings,
  updateSetting,
  upsertSetting,
  type FetchSettingsParams,
} from '@/lib/queries/settings';
import { createTag, deleteTag, fetchTags, updateTag, type FetchTagsParams } from '@/lib/queries/tags';
import type { TagFormPayload } from '@/lib/schemas/tag';
import type { Setting, SettingScope } from '@/types/setting';
import type { Tag } from '@/types/tag';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-650 (ADR-0055 §6) — les actions serveur de la console `/super-admin`, et elles seules.
 *
 * ⚠️ **Chaque appel part avec le jeton de l'OPÉRATEUR (`getOperatorToken`), jamais `getToken()`.**
 *
 * `getToken()` lit d'abord le cookie d'impersonation : pendant une session, il désigne la CIBLE.
 * C'est juste dans l'espace applicatif, qui montre ce que la cible voit ; c'est faux dans la
 * console, que le layout et le route handler `/api/super-admin/[...path]` tiennent déjà au jeton de
 * l'opérateur. Les écrans des paramètres globaux et des étiquettes passaient par
 * `admin-settings.ts` et `admin-tags.ts` : pendant une impersonation, ils lisaient en tant que la
 * cible et leurs écritures globales rendaient 403.
 *
 * `fetchTagsAction` d'`admin-tags.ts` reste au jeton courant : les formulaires de bien de `/app`
 * la lisent, et l'espace applicatif ne change pas de règle.
 * `src/app/(super-admin)/super-admin/__tests__/jeton-operateur.test.ts` casse si la console atteint une action
 * qui lit `getToken()`.
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; status?: number; message: string; errors?: Record<string, string[]> };

async function mapError(e: unknown): Promise<{
  status?: number;
  message: string;
  errors?: Record<string, string[]>;
}> {
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

async function requireOperatorToken(): Promise<
  { ok: true; token: string } | { ok: false; result: ActionResult<never> }
> {
  const token = await getOperatorToken();
  if (!token) {
    const t = await getTranslations('serverActions.shared');
    return {
      ok: false,
      result: { ok: false, status: 401, message: t('authRequired') },
    };
  }
  return { ok: true, token };
}

// ── Paramètres globaux — `/super-admin/settings/global` (TCK-648) ──────────────────────────────

export async function fetchConsoleSettingsAction(
  params: FetchSettingsParams = {},
): Promise<ActionResult<PaginatedResponse<Setting>>> {
  const auth = await requireOperatorToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await fetchSettings(auth.token, params, await getOperatorActiveProfileId());
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function upsertConsoleSettingAction(payload: {
  key: string;
  scope: SettingScope;
  value: Record<string, unknown>;
  scope_id?: number | null;
}): Promise<ActionResult<Setting>> {
  const auth = await requireOperatorToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await upsertSetting(auth.token, payload, await getOperatorActiveProfileId());
    revalidatePath('/super-admin/settings/global');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function updateConsoleSettingAction(
  settingId: number,
  value: Record<string, unknown>,
): Promise<ActionResult<Setting>> {
  const auth = await requireOperatorToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateSetting(auth.token, settingId, value, await getOperatorActiveProfileId());
    revalidatePath('/super-admin/settings/global');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function deleteConsoleSettingAction(settingId: number): Promise<ActionResult<void>> {
  const auth = await requireOperatorToken();
  if (!auth.ok) return auth.result;
  try {
    await deleteSetting(auth.token, settingId, await getOperatorActiveProfileId());
    revalidatePath('/super-admin/settings/global');
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

// ── Étiquettes — `/super-admin/tags` (TCK-066) ─────────────────────────────────────────────────

export async function fetchConsoleTagsAction(
  params: FetchTagsParams = {},
): Promise<ActionResult<PaginatedResponse<Tag>>> {
  const auth = await requireOperatorToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await fetchTags(auth.token, params);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function createConsoleTagAction(payload: TagFormPayload): Promise<ActionResult<Tag>> {
  const auth = await requireOperatorToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await createTag(auth.token, payload);
    revalidatePath('/super-admin/tags');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function updateConsoleTagAction(
  tagId: number,
  payload: Partial<TagFormPayload>,
): Promise<ActionResult<Tag>> {
  const auth = await requireOperatorToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateTag(auth.token, tagId, payload);
    revalidatePath('/super-admin/tags');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function deleteConsoleTagAction(tagId: number): Promise<ActionResult<void>> {
  const auth = await requireOperatorToken();
  if (!auth.ok) return auth.result;
  try {
    await deleteTag(auth.token, tagId);
    revalidatePath('/super-admin/tags');
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}
