'use client';

/**
 * TanStack Query wrappers for the inventory domain.
 *
 * Every read funnels through `useApiQuery`, which serialises spatie
 * params (`fields[]`, `filter[]`, `include=`, `sort=`) — see
 * `docs/spatie-query-builder.md` and CLAUDE.md → "API — Conventions
 * frontend".
 */

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse, ApiResponse, SpatieQueryParams } from '@/types/api';
import type { Inventory, InventoryStatus, InventoryType } from '@/types/inventory';
import type {
  InventoryCreateInput,
  InventoryDisputeInput,
  InventoryUpdateInput,
} from '@/lib/schemas/inventory';

export const inventoryKeys = {
  all: ['inventory'] as const,
  list: (params?: InventoryListParams) => ['inventory', 'list', params ?? {}] as const,
  byProperty: (propertyId: number, params?: InventoryListParams) =>
    ['inventory', 'property', propertyId, params ?? {}] as const,
  detail: (id: number) => ['inventory', 'detail', id] as const,
};

const LIST_FIELDS = [
  'id',
  'lease_id',
  'property_id',
  'type',
  'status',
  'general_condition',
  'conducted_at',
  'tenant_signed_at',
  'owner_signed_at',
  'created_at',
] as const;

const DETAIL_FIELDS = [
  ...LIST_FIELDS,
  'conducted_by',
  'tenant_id',
  'rooms',
  'notes',
  'tenant_signed',
  'owner_signed',
] as const;

export interface InventoryListParams {
  readonly type?: InventoryType;
  readonly status?: InventoryStatus;
  readonly lease_id?: number;
  readonly property_id?: number;
  readonly page?: number;
  readonly per_page?: number;
  readonly sort?: string;
}

function toSpatieParams(
  params: InventoryListParams | undefined,
  fields: readonly string[],
  defaultSort: string,
): SpatieQueryParams {
  const filter: SpatieQueryParams['filter'] = {};
  if (params?.type) filter.type = params.type;
  if (params?.status) filter.status = params.status;
  if (params?.lease_id) filter.lease_id = params.lease_id;
  if (params?.property_id) filter.property_id = params.property_id;

  return {
    fields: { inventories: [...fields] },
    filter: Object.keys(filter).length ? filter : undefined,
    sort: params?.sort ?? defaultSort,
    page: params?.page,
    per_page: params?.per_page ?? 20,
  };
}

/** `GET /api/inventories`. */
export function useInventories(params?: InventoryListParams) {
  return useApiQuery<PaginatedResponse<Inventory>>(
    inventoryKeys.list(params),
    '/api/inventories',
    { params: toSpatieParams(params, LIST_FIELDS, '-created_at') },
  );
}

/** `GET /api/properties/{property}/inventories` — defaults to `-conducted_at` server-side. */
export function useInventoriesForProperty(
  propertyId: number | null,
  params?: InventoryListParams,
) {
  return useApiQuery<PaginatedResponse<Inventory>>(
    inventoryKeys.byProperty(propertyId ?? 0, params),
    `/api/properties/${propertyId}/inventories`,
    {
      params: toSpatieParams(params, LIST_FIELDS, '-conducted_at'),
      enabled: propertyId !== null && propertyId > 0,
    },
  );
}

/** `GET /api/inventories/{id}`. */
export function useInventory(id: number | null) {
  return useApiQuery<ApiResponse<Inventory>>(
    inventoryKeys.detail(id ?? 0),
    `/api/inventories/${id}`,
    {
      params: { fields: { inventories: [...DETAIL_FIELDS] } },
      enabled: id !== null && id > 0,
    },
  );
}

/** `POST /api/inventories`. */
export function useCreateInventory() {
  return useApiMutation<ApiResponse<Inventory>, InventoryCreateInput>(
    { path: '/api/inventories', method: 'POST' },
    { invalidate: [inventoryKeys.all] },
  );
}

/** `PUT /api/inventories/{id}` — only allowed while status is `draft`. */
export function useUpdateInventory(id: number) {
  return useApiMutation<ApiResponse<Inventory>, InventoryUpdateInput>(
    { path: `/api/inventories/${id}`, method: 'PUT' },
    { invalidate: [inventoryKeys.all, inventoryKeys.detail(id)] },
  );
}

/** `POST /api/inventories/{id}/submit` — draft → pending_signature. */
export function useSubmitInventory(id: number) {
  return useApiMutation<ApiResponse<Inventory>, void>(
    { path: `/api/inventories/${id}/submit`, method: 'POST', body: () => ({}) },
    { invalidate: [inventoryKeys.all, inventoryKeys.detail(id)] },
  );
}

/** `POST /api/inventories/{id}/sign` — marks the current user's signature. */
export function useSignInventory(id: number) {
  return useApiMutation<ApiResponse<Inventory>, void>(
    { path: `/api/inventories/${id}/sign`, method: 'POST', body: () => ({}) },
    { invalidate: [inventoryKeys.all, inventoryKeys.detail(id)] },
  );
}

/** `POST /api/inventories/{id}/dispute`. */
export function useDisputeInventory(id: number) {
  return useApiMutation<ApiResponse<Inventory>, InventoryDisputeInput>(
    { path: `/api/inventories/${id}/dispute`, method: 'POST' },
    { invalidate: [inventoryKeys.all, inventoryKeys.detail(id)] },
  );
}

/**
 * `POST /api/inventories/{id}/room-photos` — multipart upload tagged
 * with the room name (stored in the media library custom properties).
 */
export interface UploadInventoryRoomPhotosInput {
  readonly files: readonly File[];
  readonly roomName: string;
}

export function useUploadInventoryRoomPhotos(id: number) {
  return useApiMutation<unknown, UploadInventoryRoomPhotosInput>(
    {
      path: `/api/inventories/${id}/room-photos`,
      method: 'POST',
      formData: true,
      body: ({ files, roomName }) => {
        const fd = new FormData();
        for (const file of files) fd.append('photos[]', file);
        fd.append('room_name', roomName);
        return fd;
      },
    },
    { invalidate: [inventoryKeys.detail(id)] },
  );
}
