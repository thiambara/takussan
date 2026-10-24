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

/**
 * TCK-1915 (P143.01) — les plafonds d'`InventoryStoreRequest` (décision du porteur, 2026-10-23) :
 * au-delà, le PDF signé, recomposé par dompdf à chaque téléchargement, épuisait sa mémoire.
 */
export const INVENTORY_MAX_ROOMS = 20;
export const INVENTORY_MAX_ELEMENTS_PER_ROOM = 20;
export const INVENTORY_MAX_ELEMENT_NOTES = 200;
export const INVENTORY_MAX_NOTES = 1000;

const notesTooLong = (max: number) => msgValidation('inventory.notesTooLong', { max: String(max) });
const roomsMax = msgValidation('inventory.roomsMax', { max: String(INVENTORY_MAX_ROOMS) });

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max, notesTooLong(max))
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional();

const optionalNullableString = (max: number) =>
  z
    .string()
    .trim()
    .max(max, notesTooLong(max))
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

export const inventoryElementSchema = z.object({
  label: requiredStringSchema(msgValidation('inventory.elementLabelRequired')).max(255),
  state: elementStateEnum,
  notes: optionalNullableString(INVENTORY_MAX_ELEMENT_NOTES),
});

export const inventoryRoomSchema = z.object({
  name: requiredStringSchema(msgValidation('inventory.roomNameRequired')).max(255),
  condition: conditionEnum,
  notes: optionalNullableString(INVENTORY_MAX_NOTES),
  elements: z
    .array(inventoryElementSchema)
    .max(
      INVENTORY_MAX_ELEMENTS_PER_ROOM,
      msgValidation('inventory.elementsMax', { max: String(INVENTORY_MAX_ELEMENTS_PER_ROOM) }),
    )
    .optional()
    .default([]),
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
  notes: optionalString(INVENTORY_MAX_NOTES),
  rooms: z
    .array(inventoryRoomSchema)
    .min(1, msgValidation('inventory.roomsMin'))
    .max(INVENTORY_MAX_ROOMS, roomsMax),
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
  notes: optionalString(INVENTORY_MAX_NOTES),
  rooms: z
    .array(inventoryRoomSchema)
    .min(1, msgValidation('inventory.roomsMin'))
    .max(INVENTORY_MAX_ROOMS, roomsMax)
    .optional(),
});

export type InventoryUpdateInput = z.infer<typeof inventoryUpdateSchema>;

export const inventoryDisputeSchema = z.object({
  reason: requiredStringSchema(msgValidation('inventory.disputeReasonRequired')),
});

export type InventoryDisputeInput = z.infer<typeof inventoryDisputeSchema>;
