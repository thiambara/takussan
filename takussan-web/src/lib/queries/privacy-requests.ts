import { ApiError } from '@/lib/api';
import type { PaginatedResponse } from '@/types/api';
import type {
  CreatePrivacyRequestPayload,
  PrivacyRequest,
  PrivacyRequestStatus,
  PrivacyRequestType,
  UpdatePrivacyRequestPayload,
} from '@/types/privacy-request';

/**
 * TCK-601 (G) — le registre des demandes de droits, côté console.
 *
 * Comme tout le reste de la console, les appels passent par le BFF same-origin
 * `/api/super-admin/*` (`src/app/api/super-admin/[...path]/route.ts`), qui lit le cookie httpOnly
 * et appelle `/api/admin/privacy-requests` sur Laravel. Super-admin seul : l'API rend 403 à tout
 * autre lecteur.
 */

const BASE = '/api/super-admin/privacy-requests';

export interface PrivacyRequestFilters {
  readonly status?: PrivacyRequestStatus;
  readonly type?: PrivacyRequestType;
  /** Seulement les demandes ouvertes dont l'échéance est passée. */
  readonly overdue?: boolean;
  readonly page?: number;
  readonly perPage?: number;
}

export const privacyRequestKeys = {
  all: ['super-admin', 'privacy-requests'] as const,
  list: (filters: PrivacyRequestFilters) => [...privacyRequestKeys.all, 'list', filters] as const,
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json() as Promise<T>;
}

/** `sort=due_at` : la vue se lit d'abord par échéance, la plus proche en tête. */
export async function fetchPrivacyRequests(
  filters: PrivacyRequestFilters = {},
): Promise<PaginatedResponse<PrivacyRequest>> {
  const qs = new URLSearchParams();
  if (filters.status) qs.set('filter[status]', filters.status);
  if (filters.type) qs.set('filter[type]', filters.type);
  if (filters.overdue) qs.set('filter[overdue]', '1');
  qs.set('sort', 'due_at');
  qs.set('page', String(filters.page ?? 1));
  qs.set('per_page', String(filters.perPage ?? 25));
  const res = await fetch(`${BASE}?${qs.toString()}`, { credentials: 'include' });
  return jsonOrThrow<PaginatedResponse<PrivacyRequest>>(res);
}

export async function createPrivacyRequest(
  payload: CreatePrivacyRequestPayload,
): Promise<PrivacyRequest> {
  const res = await fetch(BASE, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await jsonOrThrow<{ data: PrivacyRequest }>(res);
  return json.data;
}

/**
 * Mise à jour d'une demande. Avec une preuve, l'envoi est multipart (`POST` + `_method=PATCH`,
 * la seule forme sous laquelle PHP lit un fichier) ; sans, un `PATCH` JSON.
 */
export async function updatePrivacyRequest(
  id: number,
  payload: UpdatePrivacyRequestPayload,
): Promise<PrivacyRequest> {
  let init: RequestInit;
  if (payload.proof) {
    const form = new FormData();
    form.append('_method', 'PATCH');
    if (payload.status) form.append('status', payload.status);
    if (payload.response_summary !== undefined) form.append('response_summary', payload.response_summary);
    form.append('proof', payload.proof);
    init = { method: 'POST', body: form };
  } else {
    const body: Record<string, string> = {};
    if (payload.status) body.status = payload.status;
    if (payload.response_summary !== undefined) body.response_summary = payload.response_summary;
    init = {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    };
  }
  const res = await fetch(`${BASE}/${id}`, { ...init, credentials: 'include' });
  const json = await jsonOrThrow<{ data: PrivacyRequest }>(res);
  return json.data;
}

/** Le registre complet en CSV (`text/csv`) : le fichier et le nom que l'API lui donne. */
export async function exportPrivacyRequests(): Promise<{ blob: Blob; fileName: string }> {
  const res = await fetch(`${BASE}/export`, {
    credentials: 'include',
    headers: { Accept: 'text/csv' },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";\n]+)"?/.exec(disposition);
  return { blob: await res.blob(), fileName: match?.[1] ?? 'registre-demandes-de-droits.csv' };
}
