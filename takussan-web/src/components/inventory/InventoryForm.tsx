'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import {
  FormGlobalError,
  FormSelect,
  FormTextarea,
  FormDateTimePicker,
} from '@/components/forms';
import { Button } from '@/components/ui/button';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateInventory } from '@/lib/queries/inventory';
import {
  inventoryCreateSchema,
  type InventoryCreateInput,
} from '@/lib/schemas/inventory';
import {
  INVENTORY_CONDITIONS,
  INVENTORY_TYPES,
} from '@/types/inventory';

import { RoomEditor } from './RoomEditor';

/**
 * Creation form for an inventory (entrée / sortie). `leaseId` must be
 * passed via the URL — the backend derives `property_id`, `tenant_id`
 * and the access rules from the lease, so we never let the user pick
 * a property independently.
 */
export function InventoryForm({ leaseId }: { readonly leaseId: number }) {
  const t = useTranslations('inventory.form');
  const tTypes = useTranslations('inventory.types');
  const tConditions = useTranslations('inventory.conditions');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const create = useCreateInventory();

  const typeOptions = INVENTORY_TYPES.map((value) => ({ value, label: tTypes(value) }));
  const conditionOptions = INVENTORY_CONDITIONS.map((value) => ({
    value,
    label: tConditions(value),
  }));

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    InventoryCreateInput,
    { data: { id: number } }
  >({
    schema: inventoryCreateSchema,
    defaultValues: {
      lease_id: leaseId,
      type: 'move_in',
      general_condition: 'good',
      conducted_at: undefined,
      notes: undefined,
      rooms: [],
    },
    onSubmit: async (values) => create.mutateAsync(values),
    onSuccess: (res) => {
      router.push(`/app/inventories/${res.data.id}`);
    },
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <FormGlobalError>{globalError}</FormGlobalError>

      <div className="grid gap-4 md:grid-cols-3">
        <FormSelect
          name="type"
          control={form.control}
          options={typeOptions}
          label={t('type')}
          required
        />
        <FormSelect
          name="general_condition"
          control={form.control}
          options={conditionOptions}
          label={t('generalCondition')}
          required
        />
        <FormDateTimePicker
          name="conducted_at"
          control={form.control}
          label={t('conductedAt')}
        />
      </div>

      <FormTextarea
        name="notes"
        control={form.control}
        label={t('notes')}
        rows={3}
      />

      <RoomEditor control={form.control} register={form.register} />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon('actions.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('saving') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
