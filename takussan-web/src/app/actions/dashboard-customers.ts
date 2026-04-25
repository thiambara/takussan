'use server';

import { revalidatePath } from 'next/cache';
import { ApiError } from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  attachCustomerTags,
  createCustomer,
  createCustomerNote,
  detachCustomerTag,
  updateCustomer,
  uploadCustomerDocument,
  validateCustomerDocumentFile,
} from '@/lib/queries/customers';
import type { CustomerFormPayload } from '@/lib/schemas/customer';
import type { CustomerDetail, CustomerNote, CustomerDocument } from '@/types/customer';
import type { Tag } from '@/types/tag';

/**
 * Dashboard Agent — CRM server actions (TCK-042).
 */

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | {
      ok: false;
      status?: number;
      message: string;
      errors?: Record<string, string[]>;
    };

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

export async function createCustomerAction(
  payload: CustomerFormPayload,
): Promise<ActionResult<CustomerDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await createCustomer(auth.token, payload);
    revalidatePath('/app/customers');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

export async function updateCustomerAction(
  customerId: number,
  payload: CustomerFormPayload,
): Promise<ActionResult<CustomerDetail>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await updateCustomer(auth.token, customerId, payload);
    revalidatePath('/app/customers');
    revalidatePath(`/app/customers/${customerId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

export async function createCustomerNoteAction(
  customerId: number,
  body: string,
): Promise<ActionResult<CustomerNote>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return { ok: false, message: 'La note ne peut pas être vide.' };
  }
  try {
    const data = await createCustomerNote(auth.token, customerId, trimmed);
    revalidatePath(`/app/customers/${customerId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

export async function attachCustomerTagsAction(
  customerId: number,
  tags: string[],
): Promise<ActionResult<Pick<Tag, 'id' | 'name' | 'slug' | 'color'>[]>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    const data = await attachCustomerTags(auth.token, customerId, tags);
    revalidatePath(`/app/customers/${customerId}`);
    revalidatePath('/app/customers');
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

export async function detachCustomerTagAction(
  customerId: number,
  tagId: number,
): Promise<ActionResult> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  try {
    await detachCustomerTag(auth.token, customerId, tagId);
    revalidatePath(`/app/customers/${customerId}`);
    revalidatePath('/app/customers');
    return { ok: true };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}

export async function uploadCustomerDocumentAction(
  customerId: number,
  formData: FormData,
): Promise<ActionResult<CustomerDocument>> {
  const auth = await requireToken();
  if (!auth.ok) return auth.result;
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'Aucun fichier sélectionné.' };
  }
  const validationError = validateCustomerDocumentFile(file);
  if (validationError) {
    return { ok: false, message: validationError };
  }
  try {
    const data = await uploadCustomerDocument(auth.token, customerId, file);
    revalidatePath(`/app/customers/${customerId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...mapError(e) };
  }
}
