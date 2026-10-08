/**
 * Backend contract: see `takussan-api` →
 *   - `App\Models\Enums\InventoryType|Status|Condition|ElementState`
 *   - `App\Http\Resources\InventoryResource`
 *   - `App\Http\Requests\InventoryStoreRequest` (rooms JSON schema)
 *   - `routes/api/inventories.php`
 *
 * Column names follow `docs/models-spec.md §24` (spec is source of truth) —
 * `type` ∈ {move_in, move_out}, `rooms` (JSON), `conducted_by`,
 * `tenant_signed_at`, `owner_signed_at`.
 */

export type InventoryType = 'move_in' | 'move_out';

export type InventoryStatus = 'draft' | 'pending_signature' | 'signed' | 'disputed';

export type InventoryCondition = 'excellent' | 'good' | 'fair' | 'poor';

/** French-language enum values — match the tenant-facing vocabulary. */
export type InventoryElementState = 'bon' | 'usé' | 'endommagé' | 'manquant';

export const INVENTORY_TYPES: readonly InventoryType[] = ['move_in', 'move_out'] as const;

export const INVENTORY_STATUSES: readonly InventoryStatus[] = [
  'draft',
  'pending_signature',
  'signed',
  'disputed',
] as const;

export const INVENTORY_CONDITIONS: readonly InventoryCondition[] = [
  'excellent',
  'good',
  'fair',
  'poor',
] as const;

export const INVENTORY_ELEMENT_STATES: readonly InventoryElementState[] = [
  'bon',
  'usé',
  'endommagé',
  'manquant',
] as const;

export interface InventoryElement {
  readonly label: string;
  readonly state: InventoryElementState;
  readonly notes?: string | null;
}

export interface InventoryRoom {
  readonly name: string;
  readonly condition: InventoryCondition;
  readonly notes?: string | null;
  readonly elements?: readonly InventoryElement[];
}

/** TCK-182 — eager-loaded relation summaries served via `include=`. */
export interface InventoryPropertyLite {
  readonly id: number;
  readonly title: string | null;
  readonly slug: string | null;
}

export interface InventoryLeaseLite {
  readonly id: number;
  readonly reference_number: string | null;
}

/** TCK-596 — une photo de pièce, servie par URL signée (collection privée). */
export interface InventoryRoomPhoto {
  readonly id: number;
  readonly url: string;
  readonly room_name: string;
}

/** TCK-596 — `show` seulement : les photos groupées dans l'ordre des pièces. */
export interface InventoryRoomPhotoGroup {
  readonly room_name: string;
  readonly photos: readonly InventoryRoomPhoto[];
}

export interface Inventory {
  readonly id: number;
  readonly lease_id: number;
  readonly property_id: number;
  readonly property?: InventoryPropertyLite | null;
  readonly lease?: InventoryLeaseLite | null;
  readonly type: InventoryType;
  readonly conducted_by: number;
  readonly tenant_id: number | null;
  readonly conducted_at: string | null;
  readonly status: InventoryStatus;
  readonly general_condition: InventoryCondition;
  readonly rooms: readonly InventoryRoom[];
  readonly notes: string | null;
  readonly tenant_signed: boolean;
  readonly tenant_signed_at: string | null;
  readonly tenant_signature_hash?: string | null;
  readonly owner_signed: boolean;
  readonly owner_signed_at: string | null;
  readonly owner_signature_hash?: string | null;
  readonly signed_at?: string | null;
  readonly created_at: string;
  // TCK-596 — qui a signé pour le bailleur et pour le compte de qui ; empreinte figée.
  readonly owner_signed_by_user_id?: number | null;
  readonly owner_signed_on_behalf_of_user_id?: number | null;
  readonly traceability_hash?: string | null;
  // TCK-596 — `show` seulement.
  readonly room_photos?: readonly InventoryRoomPhotoGroup[];
  /** Les rôles que l'utilisateur courant peut signer, jugés par l'API (même prédicat que la signature). */
  readonly can_sign_as?: readonly InventorySignatureRole[];
  /** Le bailleur pour le compte duquel l'utilisateur courant signerait, ou `null` s'il est le bailleur. */
  readonly sign_on_behalf_of?: { readonly id: number; readonly full_name: string } | null;
}

/** TCK-076 — explicit role accepted by `POST /inventories/{id}/sign`. */
export type InventorySignatureRole = 'tenant' | 'landlord';
