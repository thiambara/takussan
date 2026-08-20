'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { ApiError, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  createTag,
  deleteTag,
  fetchTags,
  updateTag,
  type FetchTagsParams,
} from '@/lib/queries/tags';
import type { TagFormPayload } from '@/lib/schemas/tag';
import type { Tag } from '@/types/tag';
import type { PaginatedResponse } from '@/types/api';

/**
 * Admin tags & amenities server actions — TCK-066.
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

export async function fetchTagsAction(
  params: FetchTagsParams = {},
): Promise<ActionResult<PaginatedResponse<Tag>>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await fetchTags(auth.token, params);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function createTagAction(
  payload: TagFormPayload,
): Promise<ActionResult<Tag>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await createTag(auth.token, payload);
    revalidatePath('/super-admin/tags');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function updateTagAction(
  tagId: number,
  payload: Partial<TagFormPayload>,
): Promise<ActionResult<Tag>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateTag(auth.token, tagId, payload);
    revalidatePath('/super-admin/tags');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}

export async function deleteTagAction(tagId: number): Promise<ActionResult<void>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await deleteTag(auth.token, tagId);
    revalidatePath('/super-admin/tags');
    return { ok: true };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}
