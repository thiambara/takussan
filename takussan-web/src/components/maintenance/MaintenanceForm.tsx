'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import {
  FormGlobalError,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/forms';
import { Button } from '@/components/ui/button';
import { useApiForm } from '@/hooks/useApiForm';
import {
  maintenanceCreateSchema,
  type MaintenanceCreateInput,
} from '@/lib/schemas/maintenance';
import {
  useCreateMaintenanceRequest,
  useUploadMaintenancePhotos,
} from '@/lib/queries/maintenance';
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
} from '@/types/maintenance';

import {
  MAINTENANCE_CATEGORY_LABEL,
  MAINTENANCE_PRIORITY_LABEL,
} from './labels';

const CATEGORY_OPTIONS = MAINTENANCE_CATEGORIES.map((c) => ({
  value: c,
  label: MAINTENANCE_CATEGORY_LABEL[c],
}));

const PRIORITY_OPTIONS = [
  { value: '', label: 'Choisir (optionnel)' },
  ...MAINTENANCE_PRIORITIES.map((p) => ({
    value: p,
    label: MAINTENANCE_PRIORITY_LABEL[p],
  })),
];

/**
 * Report-a-problem form. Submits the request, then — if the user
 * attached photos — calls `/photos` with `collection=photos`.
 *
 * `propertyId` is required; the CLI page receives it from the query
 * string (`?property=…`) or the property detail page.
 */
export function MaintenanceForm({
  propertyId,
  leaseId,
}: {
  readonly propertyId: number;
  readonly leaseId?: number | null;
}) {
  const router = useRouter();
  const create = useCreateMaintenanceRequest();
  const uploadPhotos = useUploadMaintenancePhotos();
  const [photos, setPhotos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    MaintenanceCreateInput,
    { data: { id: number } }
  >({
    schema: maintenanceCreateSchema,
    defaultValues: {
      property_id: propertyId,
      lease_id: leaseId ?? null,
      title: '',
      description: '',
      category: 'other',
      priority: undefined,
    },
    onSubmit: async (values) => {
      const res = await create.mutateAsync(values);
      const id = res.data.id;
      if (photos.length > 0) {
        try {
          await uploadPhotos.mutateAsync({ id, files: photos, collection: 'photos' });
        } catch {
          // Photo upload failures should not roll back the created request.
          // The detail page offers a retry path ("Ajouter des photos").
        }
      }
      return res;
    },
    onSuccess: (res) => {
      router.push(`/app/maintenance/${res.data.id}`);
    },
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <FormGlobalError>{globalError}</FormGlobalError>

      <FormInput
        name="title"
        control={form.control}
        label="Titre"
        placeholder="ex. Fuite sous l'évier cuisine"
        required
      />

      <FormTextarea
        name="description"
        control={form.control}
        label="Description"
        placeholder="Décrivez le problème en détail"
        rows={5}
        required
      />

      <div className="grid gap-4 md:grid-cols-2">
        <FormSelect
          name="category"
          control={form.control}
          options={CATEGORY_OPTIONS}
          label="Catégorie"
          required
        />
        <FormSelect
          name="priority"
          control={form.control}
          options={PRIORITY_OPTIONS}
          label="Priorité"
          placeholder="Normale par défaut"
        />
      </div>

      <div>
        <label htmlFor="maintenance-photos" className="mb-1.5 block text-sm font-medium">
          Photos (optionnel)
        </label>
        <input
          id="maintenance-photos"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-app-ink-muted"
        />
        {photos.length > 0 ? (
          <p className="mt-1 text-xs text-app-ink-muted">
            {photos.length} photo{photos.length > 1 ? 's' : ''} sélectionnée
            {photos.length > 1 ? 's' : ''}.
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Envoi…' : 'Signaler le problème'}
        </Button>
      </div>
    </form>
  );
}
