'use client';

import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { DoorOpen } from 'lucide-react';

import { EmptyState } from '@/components/feedback';

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
  const t = useTranslations('inventory.roomEditor');
  const rooms = useFieldArray({ control, name: 'rooms' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            rooms.append({ name: '', condition: 'good', notes: null, elements: [] })
          }
        >
          {t('addRoom')}
        </Button>
      </div>

      {rooms.fields.length === 0 ? (
        <EmptyState
          icon={<DoorOpen className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
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
  const t = useTranslations('inventory.roomEditor');
  const tConditions = useTranslations('inventory.conditions');
  const tElementStates = useTranslations('inventory.elementStates');
  const elements = useFieldArray({
    control,
    name: `rooms.${roomIndex}.elements`,
  });

  const conditionOptions = INVENTORY_CONDITIONS.map((value) => ({
    value,
    label: tConditions(value),
  }));
  const elementStateOptions = INVENTORY_ELEMENT_STATES.map((value) => ({
    value,
    label: tElementStates(value),
  }));

  return (
    <div className="rounded-xl bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{t('room', { n: String(roomIndex + 1) })}</p>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          {t('remove')}
        </Button>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <FormInput
          name={`rooms.${roomIndex}.name`}
          control={control}
          label={t('roomName')}
          placeholder={t('roomNamePlaceholder')}
          required
        />
        <FormSelect
          name={`rooms.${roomIndex}.condition`}
          control={control}
          options={conditionOptions}
          label={t('condition')}
          required
        />
      </div>

      <div className="mt-3">
        <label
          htmlFor={`room-${roomIndex}-notes`}
          className="mb-1.5 block text-sm font-medium"
        >
          {t('notes')}
        </label>
        <textarea
          id={`room-${roomIndex}-notes`}
          {...register(`rooms.${roomIndex}.notes` as const)}
          className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      <div className="mt-4 rounded-lg bg-muted p-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('elements')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => elements.append({ label: '', state: 'bon', notes: null })}
          >
            {t('addElement')}
          </Button>
        </div>

        {elements.fields.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('noElements')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {elements.fields.map((element, elementIndex) => (
              <li
                key={element.id}
                className="grid gap-2 rounded-md bg-card p-3 md:grid-cols-[1fr_12rem_auto]"
              >
                <FormInput
                  name={`rooms.${roomIndex}.elements.${elementIndex}.label`}
                  control={control}
                  label={elementIndex === 0 ? t('element') : undefined}
                  placeholder={t('elementPlaceholder')}
                  required
                  containerClassName="min-w-0"
                />
                <FormSelect
                  name={`rooms.${roomIndex}.elements.${elementIndex}.state`}
                  control={control}
                  options={elementStateOptions}
                  label={elementIndex === 0 ? t('state') : undefined}
                  required
                />
                <div className="flex items-end justify-end md:pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => elements.remove(elementIndex)}
                  >
                    {t('remove')}
                  </Button>
                </div>
                <FormTextarea
                  name={`rooms.${roomIndex}.elements.${elementIndex}.notes`}
                  control={control}
                  label={t('elementNotes')}
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
