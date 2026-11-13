'use client';

/**
 * TanStack Query wrappers for the inventory domain.
 *
 * Every read funnels through `useApiQuery`, which serialises spatie
 * params (`fields[]`, `filter[]`, `include=`, `sort=`) — see
 * `docs/spatie-query-builder.md` and CLAUDE.md → "API — Conventions
 * frontend".
 */

import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { apiRequest, buildQueryString, type ApiError } from '@/lib/api';
import type { PaginatedResponse, ApiResponse, SpatieQueryParams } from '@/types/api';
import type {
  Inventory,
  InventoryCondition,
  InventoryRoom,
  InventorySignatureRole,
  InventoryStatus,
  InventoryTemplate,
  InventoryTemplateKey,
  InventoryType,
} from '@/types/inventory';
import type {
  InventoryCreateInput,
  InventoryDisputeInput,
} from '@/lib/schemas/inventory';
import { cheminApi, requete } from '@/lib/chemin-api';
import { lireToutesLesPages, PAR_PAGE_MAX } from './toutes-les-pages';

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
    fields: {
      inventories: [...fields],
      // TCK-182 — surface human-readable labels (property title, lease ref)
      // so the customer UI doesn't render raw ids.
      properties: ['id', 'title', 'slug'],
      leases: ['id', 'reference_number'],
    },
    filter: Object.keys(filter).length ? filter : undefined,
    include: ['property', 'lease'],
    sort: params?.sort ?? defaultSort,
    page: params?.page,
    per_page: params?.per_page ?? 20,
  };
}

/** `GET /api/inventories`. `enabled` à `false` : la requête ne part pas (TCK-2639, bail illisible). */
export function useInventories(params?: InventoryListParams, enabled = true) {
  return useApiQuery<PaginatedResponse<Inventory>>(
    inventoryKeys.list(params),
    '/api/inventories',
    { params: toSpatieParams(params, LIST_FIELDS, '-created_at'), enabled },
  );
}

/** `GET /api/inventories/{id}`. */
export function useInventory(id: number | null) {
  return useApiQuery<ApiResponse<Inventory>>(
    inventoryKeys.detail(id ?? 0),
    cheminApi`/api/inventories/${id}`,
    {
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

/** `POST /api/inventories/{id}/submit` — draft → pending_signature. */
export function useSubmitInventory(id: number) {
  return useApiMutation<ApiResponse<Inventory>, void>(
    { path: cheminApi`/api/inventories/${id}/submit`, method: 'POST', body: () => ({}) },
    { invalidate: [inventoryKeys.all, inventoryKeys.detail(id)] },
  );
}

/**
 * `POST /api/inventories/{id}/sign` — TCK-076 role-explicit payload.
 *
 * TCK-596 — `role` et `signature` sont REQUIS : l'API rend 422 sans eux. Il n'existe plus d'appel
 * sans tracé.
 */
export interface InventorySignInput {
  readonly role: InventorySignatureRole;
  /** Base64-encoded PNG payload — a canvas `toDataURL('image/png')`. */
  readonly signature: string;
  /**
   * TCK-2648 — la signature du locataire SUR PLACE (ADR-0098) : le code reçu par SMS, saisi sur le
   * téléphone de l'agent. Absent, c'est la signature depuis le compte de la partie, inchangée.
   */
  readonly code?: string;
}

export function useSignInventory(id: number) {
  return useApiMutation<ApiResponse<Inventory>, InventorySignInput>(
    {
      path: cheminApi`/api/inventories/${id}/sign`,
      method: 'POST',
      body: (input) => ({ role: input.role, signature: input.signature, ...(input.code ? { code: input.code } : {}) }),
    },
    { invalidate: [inventoryKeys.all, inventoryKeys.detail(id)] },
  );
}

/** TCK-2648 — où le code est parti : le canal et le numéro masqué (« +221 77 ••• 18 90 »). */
export interface CodeSurPlaceEnvoye {
  readonly channel: string;
  readonly destination: string;
}

/**
 * TCK-2648 (ADR-0098) — `POST /api/inventories/{id}/sign/onsite-code` : l'API envoie au locataire, par
 * SMS, le code qu'il dira à l'agent. 202 `{data: {channel, destination}}`. Rien à invalider : l'état
 * des lieux ne change pas.
 */
export function useEnvoyerCodeSurPlace(id: number) {
  return useApiMutation<ApiResponse<CodeSurPlaceEnvoye>, void>({
    path: cheminApi`/api/inventories/${id}/sign/onsite-code`,
    method: 'POST',
    body: () => ({}),
  });
}

/** `POST /api/inventories/{id}/dispute`. */
export function useDisputeInventory(id: number) {
  return useApiMutation<ApiResponse<Inventory>, InventoryDisputeInput>(
    { path: cheminApi`/api/inventories/${id}/dispute`, method: 'POST' },
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
  /** TCK-2646 — la photo d'un élément de la pièce (un élément abîmé). */
  readonly elementLabel?: string;
}

export function useUploadInventoryRoomPhotos(id: number) {
  return useApiMutation<unknown, UploadInventoryRoomPhotosInput>(
    {
      path: cheminApi`/api/inventories/${id}/room-photos`,
      method: 'POST',
      formData: true,
      body: ({ files, roomName, elementLabel }) => {
        const fd = new FormData();
        for (const file of files) fd.append('photos[]', file);
        fd.append('room_name', roomName);
        if (elementLabel) fd.append('element_label', elementLabel);
        return fd;
      },
    },
    { invalidate: [inventoryKeys.detail(id)] },
  );
}

/**
 * TCK-596 — `DELETE /api/inventories/{id}/room-photos/{media}` : brouillon seulement (409 signé,
 * 422 soumis), et le média doit appartenir à cet état des lieux (404 sinon).
 */
export function useDeleteInventoryRoomPhoto(id: number) {
  return useApiMutation<unknown, number>(
    {
      path: (mediaId) => cheminApi`/api/inventories/${id}/room-photos/${mediaId}`,
      method: 'DELETE',
      body: () => undefined,
    },
    { invalidate: [inventoryKeys.detail(id)] },
  );
}

/**
 * TCK-2647 — `PATCH /api/inventories/{id}` : un brouillon seulement, et `rooms` remplace TOUTES les
 * pièces. Le parcours de terrain l'appelle à chaque « Pièce suivante » (et à « Enregistrer et quitter »)
 * avec toutes les pièces : un échec garde la saisie à l'écran, rien n'avance.
 *
 * Pas d'invalidation du détail : le parcours tient la saisie, une relecture à chaque pièce la
 * remplacerait par la réponse pendant que l'agent qualifie la suivante. La réponse est rendue.
 */
export interface InventoryPatchInput {
  readonly rooms?: readonly InventoryRoom[];
  readonly general_condition?: InventoryCondition;
  readonly conducted_at?: string | null;
  readonly notes?: string | null;
}

export function useUpdateInventory(id: number) {
  return useApiMutation<ApiResponse<Inventory>, InventoryPatchInput>(
    { path: cheminApi`/api/inventories/${id}`, method: 'PATCH' },
    { invalidate: [['inventory', 'list']] },
  );
}

/**
 * TCK-2647 — le choix du modèle à « Démarrer » : celui du bien par défaut (`property_id`), ou un
 * autre type quand l'agent en choisit un (la fiche du bien peut se tromper de type). Chaque clé se
 * lit par le type et le nombre de chambres qui y mènent (`InventoryTemplates::keyFor`).
 */
export function parametresDuModele(cle: InventoryTemplateKey, chambres: number | null | undefined): Record<string, string> {
  const n = typeof chambres === 'number' && chambres > 0 ? chambres : null;
  switch (cle) {
    case 'studio':
      return { property_type: 'studio' };
    case 'f2':
      return { property_type: 'apartment', bedrooms: '1' };
    case 'f3':
      return { property_type: 'apartment', bedrooms: '2' };
    case 'f4_plus':
      return { property_type: 'apartment', bedrooms: String(Math.max(n ?? 3, 3)) };
    case 'villa':
      return n ? { property_type: 'villa', bedrooms: String(n) } : { property_type: 'villa' };
    case 'shop':
      return { property_type: 'shop' };
    case 'office':
      return { property_type: 'office' };
    default:
      return { property_type: 'land' };
  }
}

/** TCK-2646 — `GET /api/inventory-templates?property_id=` (ou `?property_type=&bedrooms=`). */
export function useInventoryTemplate(requete: Record<string, string> | null) {
  const parametres = new URLSearchParams(requete ?? {});
  return useApiQuery<ApiResponse<InventoryTemplate>>(
    ['inventory', 'template', parametres.toString()],
    cheminApi`/api/inventory-templates${parametres}`,
    { enabled: requete !== null, staleTime: 60 * 60 * 1000 },
  );
}

/**
 * TCK-2647 — le bail d'un état des lieux, pour l'en-tête qui le nomme de bout en bout (P1 de
 * l'audit) : le bien (titre, photo, type, chambres), le locataire, la référence ; et ce qui déduit
 * le type (statut) et borne les retenues (caution). `show` lit ses champs à la main : pas de `fields`.
 */
export interface ContexteDuBail {
  readonly id: number;
  readonly reference_number: string | null;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly deposit_amount: number | string | null;
  readonly property_id: number;
  readonly property?: {
    readonly id: number;
    readonly title: string | null;
    readonly main_photo_url?: string | null;
    readonly type?: string | null;
    readonly bedrooms?: number | null;
  } | null;
  readonly tenant?: { readonly first_name?: string | null; readonly last_name?: string | null } | null;
}

export function useContexteDuBail(leaseId: number | null | undefined) {
  return useApiQuery<ApiResponse<ContexteDuBail>>(
    ['inventory', 'contexte-du-bail', leaseId ?? 0],
    cheminApi`/api/leases/${leaseId ?? 0}`,
    { params: { include: ['tenant', 'property'] }, enabled: Boolean(leaseId) },
  );
}

/**
 * TCK-2647 — l'entrée signée la plus récente d'un bail : une sortie en reprend les pièces à « Démarrer »
 * (et le serveur y rattache les états d'entrée). Aucune : la sortie part du modèle, comme une entrée.
 */
export function useEntreeSignee(leaseId: number | null | undefined, enabled = true) {
  return useApiQuery<PaginatedResponse<Inventory>>(
    ['inventory', 'entree-signee', leaseId ?? 0],
    '/api/inventories',
    {
      params: {
        // `rooms` n'est pas un champ sélectionnable (`Inventory::$queryFields`) : la liste rend
        // l'identifiant, `useInventory` (show) les pièces et leurs photos.
        fields: { inventories: ['id', 'lease_id', 'type', 'status', 'conducted_at'] },
        filter: { lease_id: leaseId ?? 0, type: 'move_in', status: 'signed' },
        sort: '-conducted_at',
        per_page: 1,
      },
      enabled: Boolean(leaseId) && enabled,
    },
  );
}

/**
 * TCK-2647 — la recherche du bail quand `/app/inventories/new` n'en reçoit pas : les baux en cours
 * (`active`, `terminating` — TCK-379), cherchés par le serveur (`filter[search]` : référence, bien,
 * locataire), chacun nommant son locataire (P2 de l'audit).
 */
export interface BailAInventorier {
  readonly id: number;
  readonly reference_number: string | null;
  readonly status: string;
  readonly property?: { readonly id: number; readonly title: string | null; readonly main_photo_url?: string | null } | null;
  readonly tenant?: { readonly first_name?: string | null; readonly last_name?: string | null } | null;
}

export function useBauxAInventorier(recherche: string) {
  const terme = recherche.trim();
  const locale = useLocale();
  const { token } = useAuth();
  // TCK-1371 (P135.04) — TOUTES les pages : une page de 50 laissait les plus anciens dehors.
  return useQuery<PaginatedResponse<BailAInventorier>, ApiError>({
    queryKey: ['inventory', 'baux-a-inventorier', terme],
    queryFn: ({ signal }) =>
      lireToutesLesPages((page) =>
        apiRequest<PaginatedResponse<BailAInventorier>>(
          cheminApi`/api/leases${requete(
            buildQueryString({
              fields: {
                leases: ['id', 'reference_number', 'status', 'property_id', 'tenant_id'],
                properties: ['id', 'title'],
                customers: ['id', 'first_name', 'last_name'],
              },
              // TCK-1438 — un bail en préavis a son état des lieux de sortie à produire.
              filter: { status: 'active,terminating', ...(terme ? { search: terme } : {}) },
              include: ['property', 'tenant'],
              sort: ['-created_at'],
              page,
              per_page: PAR_PAGE_MAX,
            }),
          )}`,
          { token: token ?? undefined, locale, signal },
        ),
      ),
  });
}
