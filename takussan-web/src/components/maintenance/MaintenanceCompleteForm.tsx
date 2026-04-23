'use client';

import { useState } from 'react';

import {
  FormGlobalError,
  FormInput,
  FormTextarea,
} from '@/components/forms';
import { Button } from '@/components/ui/button';
import { useApiForm } from '@/hooks/useApiForm';
import {
  maintenanceCompleteSchema,
  type MaintenanceCompleteInput,
} from '@/lib/schemas/maintenance';
import {
  useCompleteMaintenanceRequest,
  useUploadMaintenancePhotos,
} from '@/lib/queries/maintenance';

/**
 * Completion workflow — captures the resolution notes, optional actual
 * cost, and post-resolution photos. Photos travel through the dedicated
 * `/photos?collection=completion_photos` endpoint after the transition.
 */
export function MaintenanceCompleteForm({
  id,
  onClose,
}: {
  readonly id: number;
  readonly onClose: () => void;
}) {
  const complete = useCompleteMaintenanceRequest(id);
  const uploadPhotos = useUploadMaintenancePhotos();
  const [photos, setPhotos] = useState<File[]>([]);

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    MaintenanceCompleteInput,
    unknown
  >({
    schema: maintenanceCompleteSchema,
    defaultValues: {
      resolution_notes: undefined,
      actual_cost: undefined,
    },
    onSubmit: async (values) => {
      const res = await complete.mutateAsync(values);
      if (photos.length > 0) {
        try {
          await uploadPhotos.mutateAsync({
            id,
            files: photos,
            collection: 'completion_photos',
          });
        } catch {
          // Photos are non-blocking; the completion transition already stuck.
        }
      }
      return res;
    },
    onSuccess: () => {
      onClose();
    },
  });

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl bg-app-surface-1 p-5"
      noValidate
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-app-ink">Clôturer l&apos;intervention</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Annuler
        </Button>
      </div>

      <FormGlobalError>{globalError}</FormGlobalError>

      <FormTextarea
        name="resolution_notes"
        control={form.control}
        label="Rapport d'intervention"
        placeholder="Décrivez ce qui a été fait"
        rows={4}
      />

      <FormInput
        name="actual_cost"
        control={form.control}
        label="Coût réel (XOF)"
        type="number"
        min={0}
        step="100"
        placeholder="0"
      />

      <div>
        <label
          htmlFor="completion-photos"
          className="mb-1.5 block text-sm font-medium"
        >
          Photos après intervention
        </label>
        <input
          id="completion-photos"
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

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Clôture…' : 'Marquer terminé'}
        </Button>
      </div>
    </form>
  );
}
