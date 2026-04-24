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

export interface Inventory {
  readonly id: number;
  readonly lease_id: number;
  readonly property_id: number;
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
}

/** TCK-076 — explicit role accepted by `POST /inventories/{id}/sign`. */
export type InventorySignatureRole = 'tenant' | 'landlord';
