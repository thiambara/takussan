'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { ApiError, messageErreurApi } from '@/lib/api';
import { getToken } from '@/lib/session';
import {
  attachCustomerTags,
  createCustomer,
  createCustomerNote,
  detachCustomerTag,
  updateCustomer,
  uploadCustomerDocument,
  validateCustomerDocumentFile,
  CUSTOMER_DOCUMENT_REJECTION_NAMESPACE,
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
    return { ok: false, ...(await mapError(e)) };
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
    return { ok: false, ...(await mapError(e)) };
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
    const t = await getTranslations('serverActions.customers');
    return { ok: false, message: t('emptyNote') };
  }
  try {
    const data = await createCustomerNote(auth.token, customerId, trimmed);
    revalidatePath(`/app/customers/${customerId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
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
    return { ok: false, ...(await mapError(e)) };
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
    return { ok: false, ...(await mapError(e)) };
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
    const t = await getTranslations('serverActions.shared');
    return { ok: false, message: t('noFileSelected') };
  }
  const rejection = validateCustomerDocumentFile(file);
  if (rejection) {
    const tRejection = await getTranslations(CUSTOMER_DOCUMENT_REJECTION_NAMESPACE);
    return { ok: false, message: tRejection(rejection) };
  }
  try {
    const data = await uploadCustomerDocument(auth.token, customerId, file);
    revalidatePath(`/app/customers/${customerId}`);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, ...(await mapError(e)) };
  }
}
