'use server';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@/lib/api';
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

function mapError(e: unknown): {
  status?: number;
  message: string;
  errors?: Record<string, string[]>;
} {
  if (e instanceof ApiError) {
    return {
      status: e.status,
      message: e.displayMessage,
      errors: e.validationErrors,
    };
  }
  return { message: 'Erreur réseau. Réessayez.' };
}

async function requireToken(): Promise<
  { ok: true; token: string } | { ok: false; result: ActionResult<never> }
> {
  const token = await getToken();
  if (!token) {
    return {
      ok: false,
      result: { ok: false, status: 401, message: 'Authentification requise.' },
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
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
    return { ok: false, ...mapError(e) };
  }
}
