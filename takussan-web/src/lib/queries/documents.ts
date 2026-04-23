'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiResponse, PaginatedResponse, SpatieQueryParams } from '@/types/api';
import type {
  Document,
  DocumentShareLink,
  DocumentType,
  DocumentableType,
} from '@/types/document';

/**
 * React Query hooks for the Document resource — TCK-062.
 *
 * The backend uses `spatie/laravel-query-builder`, so every call sends
 * sparse fieldsets + filters. Share-link listing is not exposed by the
 * backend yet (TCK-021 only provides store + destroy + public show), so
 * the hook surface omits a "list active links" query and instead keeps
 * the created links in the mutation cache.
 */

/**
 * Sparse fieldset for the documents list.
 *
 * IMPORTANT: these MUST be actual columns on the `documents` table. Virtual
 * attributes produced by the backend `DocumentResource` (e.g. `file_url`,
 * `file_name`, `file_size`, `mime_type` — all resolved from the Spatie
 * medialibrary collection) are NOT listed in `Document::$queryFields`, so
 * requesting them via `fields[documents]=...` would trigger
 * `InvalidFieldQuery` (HTTP 400). The resource hydrates those extras on every
 * response regardless of the selected columns.
 */
export const DOCUMENT_LIST_FIELDS = [
  'id',
  'name',
  'type',
  'description',
  'documentable_type',
  'documentable_id',
  'is_verified',
  'expiry_date',
  'uploaded_by',
  'created_at',
] as const;

export type UseDocumentsParams = {
  readonly documentable_type?: DocumentableType;
  readonly documentable_id?: number;
  readonly type?: DocumentType;
  readonly search?: string;
  readonly is_verified?: boolean;
  readonly page?: number;
  readonly per_page?: number;
};

export const documentsQueryKeys = {
  all: ['documents'] as const,
  list: (params: UseDocumentsParams) => ['documents', 'list', params] as const,
  detail: (id: number | null | undefined) => ['documents', 'detail', id] as const,
};

export function useDocuments(params: UseDocumentsParams = {}) {
  const filter: Record<string, string | number | boolean> = {};
  if (params.documentable_type) filter.documentable_type = params.documentable_type;
  if (params.documentable_id) filter.documentable_id = params.documentable_id;
  if (params.type) filter.type = params.type;
  if (params.search) filter.search = params.search;
  if (params.is_verified !== undefined) filter.is_verified = params.is_verified;

  const spatieParams: SpatieQueryParams = {
    fields: { documents: DOCUMENT_LIST_FIELDS },
    filter,
    sort: '-created_at',
    page: params.page ?? 1,
    per_page: params.per_page ?? 20,
  };

  return useApiQuery<PaginatedResponse<Document>>(
    documentsQueryKeys.list(params),
    '/api/documents',
    { params: spatieParams },
  );
}

export function useDocument(id: number | null | undefined) {
  const spatieParams: SpatieQueryParams = {
    fields: { documents: DOCUMENT_LIST_FIELDS },
  };

  return useApiQuery<ApiResponse<Document>>(
    documentsQueryKeys.detail(id),
    `/api/documents/${id ?? ''}`,
    { params: spatieParams, enabled: Boolean(id) },
  );
}

export type UploadDocumentPayload = {
  readonly file: File;
  readonly name: string;
  readonly type: DocumentType;
  readonly documentable_type: DocumentableType;
  readonly documentable_id: number;
  readonly description?: string;
  readonly expiry_date?: string;
};

export function useUploadDocument() {
  return useApiMutation<ApiResponse<Document>, UploadDocumentPayload>(
    {
      path: '/api/documents',
      method: 'POST',
      formData: true,
      body: (variables) => {
        const form = new FormData();
        form.append('file', variables.file);
        form.append('name', variables.name);
        form.append('type', variables.type);
        form.append('documentable_type', variables.documentable_type);
        form.append('documentable_id', String(variables.documentable_id));
        if (variables.description) form.append('description', variables.description);
        if (variables.expiry_date) form.append('expiry_date', variables.expiry_date);
        return form;
      },
    },
    { invalidate: [['documents']] },
  );
}

export function useDeleteDocument() {
  return useApiMutation<void, { id: number }>(
    {
      path: ({ id }) => `/api/documents/${id}`,
      method: 'DELETE',
      body: () => undefined,
    },
    { invalidate: [['documents']] },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Share links — TCK-062
// ─────────────────────────────────────────────────────────────────────────────

export type CreateShareLinkPayload = {
  readonly document_id: number;
  readonly expires_at?: string;
  readonly max_downloads?: number;
  readonly password?: string;
};

export function useCreateShareLink() {
  return useApiMutation<ApiResponse<DocumentShareLink>, CreateShareLinkPayload>({
    path: ({ document_id }) => `/api/documents/${document_id}/share`,
    method: 'POST',
    body: ({ expires_at, max_downloads, password }) => ({
      expires_at,
      max_downloads,
      password,
    }),
  });
}

export function useRevokeShareLink() {
  return useApiMutation<void, { document_id: number; link_id: number }>({
    path: ({ document_id, link_id }) =>
      `/api/documents/${document_id}/share/${link_id}`,
    method: 'DELETE',
    body: () => undefined,
  });
}

/**
 * MIME types accepted by `DocumentController::store`. Must stay aligned with
 * the server-side validation rule `['required', 'file', 'max:10240']`, plus
 * the product intent documented in `docs/features.md#110-documents--contrats`.
 */
export const DOCUMENT_MIME_ACCEPT = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
].join(',');

export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
