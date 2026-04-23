'use client';

import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';

import {
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/forms';
import { Button } from '@/components/ui/button';
import type { InventoryCreateInput } from '@/lib/schemas/inventory';
import {
  INVENTORY_CONDITIONS,
  INVENTORY_ELEMENT_STATES,
} from '@/types/inventory';

import {
  INVENTORY_CONDITION_LABEL,
  INVENTORY_ELEMENT_STATE_LABEL,
} from './labels';

const CONDITION_OPTIONS = INVENTORY_CONDITIONS.map((c) => ({
  value: c,
  label: INVENTORY_CONDITION_LABEL[c],
}));

const ELEMENT_STATE_OPTIONS = INVENTORY_ELEMENT_STATES.map((s) => ({
  value: s,
  label: INVENTORY_ELEMENT_STATE_LABEL[s],
}));

/**
 * Renders the dynamic room × elements form nested inside the inventory
 * create/update form. Uses RHF's `useFieldArray` so adding or removing a
 * room doesn't reset sibling fields.
 *
 * Schema reference — each room:
 *   { name, condition, notes?, elements: [{ label, state, notes? }] }
 */
export function RoomEditor({
  control,
  register,
}: {
  readonly control: Control<InventoryCreateInput>;
  readonly register: UseFormRegister<InventoryCreateInput>;
}) {
  const rooms = useFieldArray({ control, name: 'rooms' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-ink">Pièces</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            rooms.append({ name: '', condition: 'good', notes: null, elements: [] })
          }
        >
          Ajouter une pièce
        </Button>
      </div>

      {rooms.fields.length === 0 ? (
        <p className="rounded-lg bg-app-surface-2 p-4 text-center text-sm text-app-ink-muted">
          Aucune pièce — cliquez sur « Ajouter une pièce » pour commencer.
        </p>
      ) : null}

      {rooms.fields.map((room, roomIndex) => (
        <RoomCard
          key={room.id}
          control={control}
          register={register}
          roomIndex={roomIndex}
          onRemove={() => rooms.remove(roomIndex)}
        />
      ))}
    </div>
  );
}

function RoomCard({
  control,
  register,
  roomIndex,
  onRemove,
}: {
  readonly control: Control<InventoryCreateInput>;
  readonly register: UseFormRegister<InventoryCreateInput>;
  readonly roomIndex: number;
  readonly onRemove: () => void;
}) {
  const elements = useFieldArray({
    control,
    name: `rooms.${roomIndex}.elements`,
  });

  return (
    <div className="rounded-xl bg-app-surface-1 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-app-ink">Pièce #{roomIndex + 1}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Retirer
        </Button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FormInput
          name={`rooms.${roomIndex}.name`}
          control={control}
          label="Nom de la pièce"
          placeholder="Salon, Cuisine, Chambre…"
          required
        />
        <FormSelect
          name={`rooms.${roomIndex}.condition`}
          control={control}
          options={CONDITION_OPTIONS}
          label="État général"
          required
        />
      </div>

      <div className="mt-3">
        <label
          htmlFor={`room-${roomIndex}-notes`}
          className="mb-1.5 block text-sm font-medium"
        >
          Notes (optionnel)
        </label>
        <textarea
          id={`room-${roomIndex}-notes`}
          {...register(`rooms.${roomIndex}.notes` as const)}
          className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      <div className="mt-4 rounded-lg bg-app-surface-2 p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-app-ink-muted">
            Éléments
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => elements.append({ label: '', state: 'bon', notes: null })}
          >
            Ajouter un élément
          </Button>
        </div>

        {elements.fields.length === 0 ? (
          <p className="mt-2 text-xs text-app-ink-muted">
            Aucun élément détaillé pour cette pièce.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {elements.fields.map((element, elementIndex) => (
              <li
                key={element.id}
                className="grid gap-2 rounded-md bg-app-surface-1 p-3 md:grid-cols-[1fr_12rem_auto]"
              >
                <FormInput
                  name={`rooms.${roomIndex}.elements.${elementIndex}.label`}
                  control={control}
                  label={elementIndex === 0 ? 'Élément' : undefined}
                  placeholder="Canapé, Réfrigérateur…"
                  required
                  containerClassName="min-w-0"
                />
                <FormSelect
                  name={`rooms.${roomIndex}.elements.${elementIndex}.state`}
                  control={control}
                  options={ELEMENT_STATE_OPTIONS}
                  label={elementIndex === 0 ? 'État' : undefined}
                  required
                />
                <div className="flex items-end justify-end md:pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => elements.remove(elementIndex)}
                  >
                    Retirer
                  </Button>
                </div>
                <FormTextarea
                  name={`rooms.${roomIndex}.elements.${elementIndex}.notes`}
                  control={control}
                  label="Notes"
                  rows={1}
                  containerClassName="md:col-span-3"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
