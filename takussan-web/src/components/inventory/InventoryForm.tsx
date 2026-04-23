'use client';

import { useRouter } from 'next/navigation';

import {
  FormGlobalError,
  FormInput,
  FormSelect,
  FormTextarea,
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

import {
  INVENTORY_CONDITION_LABEL,
  INVENTORY_TYPE_LABEL,
} from './labels';
import { RoomEditor } from './RoomEditor';

const TYPE_OPTIONS = INVENTORY_TYPES.map((t) => ({
  value: t,
  label: INVENTORY_TYPE_LABEL[t],
}));

const CONDITION_OPTIONS = INVENTORY_CONDITIONS.map((c) => ({
  value: c,
  label: INVENTORY_CONDITION_LABEL[c],
}));

/**
 * Creation form for an inventory (entrée / sortie). `leaseId` must be
 * passed via the URL — the backend derives `property_id`, `tenant_id`
 * and the access rules from the lease, so we never let the user pick
 * a property independently.
 */
export function InventoryForm({ leaseId }: { readonly leaseId: number }) {
  const router = useRouter();
  const create = useCreateInventory();

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
          options={TYPE_OPTIONS}
          label="Type d'état des lieux"
          required
        />
        <FormSelect
          name="general_condition"
          control={form.control}
          options={CONDITION_OPTIONS}
          label="État général"
          required
        />
        <FormInput
          name="conducted_at"
          control={form.control}
          label="Date de réalisation"
          type="datetime-local"
        />
      </div>

      <FormTextarea
        name="notes"
        control={form.control}
        label="Notes générales"
        rows={3}
      />

      <RoomEditor control={form.control} register={form.register} />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Enregistrement…' : "Enregistrer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
