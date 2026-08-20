import { z } from 'zod';

import {
  INVENTORY_CONDITIONS,
  INVENTORY_ELEMENT_STATES,
  INVENTORY_TYPES,
  type InventoryCondition,
  type InventoryElementState,
  type InventoryType,
} from '@/types/inventory';
import { requiredStringSchema } from './common';
import { msgValidation } from './messages';

/**
 * Zod schemas for the `Inventory` domain. Mirror
 * `App\Http\Requests\InventoryStoreRequest` / `InventoryUpdateRequest`
 * so the client flags obvious issues before the server does.
 */

const typeEnum = z.enum(INVENTORY_TYPES as unknown as [InventoryType, ...InventoryType[]]);
const conditionEnum = z.enum(
  INVENTORY_CONDITIONS as unknown as [InventoryCondition, ...InventoryCondition[]],
);
const elementStateEnum = z.enum(
  INVENTORY_ELEMENT_STATES as unknown as [InventoryElementState, ...InventoryElementState[]],
);

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? undefined : v))
  .optional();

const optionalNullableString = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()
  .optional();

export const inventoryElementSchema = z.object({
  label: requiredStringSchema(msgValidation('inventory.elementLabelRequired')).max(255),
  state: elementStateEnum,
  notes: optionalNullableString,
});

export const inventoryRoomSchema = z.object({
  name: requiredStringSchema(msgValidation('inventory.roomNameRequired')).max(255),
  condition: conditionEnum,
  notes: optionalNullableString,
  elements: z.array(inventoryElementSchema).optional().default([]),
});

/**
 * Payload for `POST /api/inventories`.
 * `lease_id` is coerced from form selects (string → number).
 */
export const inventoryCreateSchema = z.object({
  lease_id: z.coerce
    .number({ error: msgValidation('inventory.leaseRequired') })
    .int()
    .positive(msgValidation('inventory.leaseRequired')),
  type: typeEnum,
  general_condition: conditionEnum,
  conducted_at: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
  notes: optionalString,
  rooms: z
    .array(inventoryRoomSchema)
    .min(1, msgValidation('inventory.roomsMin')),
});

export type InventoryCreateInput = z.infer<typeof inventoryCreateSchema>;

/**
 * Payload for `PUT /api/inventories/{id}` — identical shape minus
 * `lease_id` (immutable once the inventory exists).
 */
export const inventoryUpdateSchema = z.object({
  type: typeEnum.optional(),
  general_condition: conditionEnum.optional(),
  conducted_at: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
  notes: optionalString,
  rooms: z.array(inventoryRoomSchema).min(1, msgValidation('inventory.roomsMin')).optional(),
});

export type InventoryUpdateInput = z.infer<typeof inventoryUpdateSchema>;

export const inventoryDisputeSchema = z.object({
  reason: requiredStringSchema(msgValidation('inventory.disputeReasonRequired')),
});

export type InventoryDisputeInput = z.infer<typeof inventoryDisputeSchema>;
