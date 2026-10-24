/**
 * TCK-1915 (P143.01) — le schéma de l'état des lieux porte les plafonds de l'API
 * (`InventoryStoreRequest`) : 20 pièces, 20 éléments par pièce, notes d'élément à 200 caractères,
 * notes de pièce et générales à 1 000. Au-delà, le PDF signé épuisait la mémoire de dompdf.
 */
import { describe, expect, it } from 'vitest';

import {
  INVENTORY_MAX_ELEMENT_NOTES,
  INVENTORY_MAX_ELEMENTS_PER_ROOM,
  INVENTORY_MAX_NOTES,
  INVENTORY_MAX_ROOMS,
  inventoryCreateSchema,
  inventoryUpdateSchema,
} from '../inventory';

const element = (notes = 'ok') => ({ label: 'Canapé', state: 'bon' as const, notes });
const room = (elements = 1, notes = 'ok', elementNotes = 'ok') => ({
  name: 'Salon',
  condition: 'good' as const,
  notes,
  elements: Array.from({ length: elements }, () => element(elementNotes)),
});
const base = { lease_id: 1, type: 'move_in' as const, general_condition: 'good' as const };

function messages(payload: Record<string, unknown>): string[] {
  const r = inventoryCreateSchema.safeParse({ ...base, ...payload });
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}|${i.message}`);
}

describe('inventoryCreateSchema — plafonds de l’API (TCK-1915)', () => {
  it('les valeurs sont celles d’InventoryStoreRequest', () => {
    expect([
      INVENTORY_MAX_ROOMS,
      INVENTORY_MAX_ELEMENTS_PER_ROOM,
      INVENTORY_MAX_ELEMENT_NOTES,
      INVENTORY_MAX_NOTES,
    ]).toEqual([20, 20, 200, 1000]);
  });

  it('accepte un état des lieux exactement au plafond', () => {
    expect(
      messages({
        notes: 'a'.repeat(1000),
        rooms: Array.from({ length: 20 }, () => room(20, 'a'.repeat(1000), 'a'.repeat(200))),
      }),
    ).toEqual([]);
  });

  it.each([
    ['rooms', { rooms: Array.from({ length: 21 }, () => room()) }, 'roomsMax'],
    ['rooms.0.elements', { rooms: [room(21)] }, 'elementsMax'],
    ['rooms.0.notes', { rooms: [room(1, 'a'.repeat(1001))] }, 'notesTooLong'],
    ['rooms.0.elements.0.notes', { rooms: [room(1, 'ok', 'a'.repeat(201))] }, 'notesTooLong'],
    ['notes', { notes: 'a'.repeat(1001), rooms: [room()] }, 'notesTooLong'],
  ])('refuse %s au-delà du plafond', (chemin, payload, cle) => {
    const refus = messages(payload);
    expect(refus).toHaveLength(1);
    expect(refus[0]).toContain(`${chemin}|validation.inventory.${cle}`);
  });

  it('le schéma de modification porte les mêmes plafonds', () => {
    expect(inventoryUpdateSchema.safeParse({ notes: 'a'.repeat(1001) }).success).toBe(false);
    expect(
      inventoryUpdateSchema.safeParse({ rooms: Array.from({ length: 21 }, () => room()) }).success,
    ).toBe(false);
    expect(inventoryUpdateSchema.safeParse({ rooms: [room(21)] }).success).toBe(false);
  });
});
