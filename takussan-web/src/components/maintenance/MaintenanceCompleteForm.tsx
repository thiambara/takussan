'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

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
 * `/photos` endpoint (with `collection=completion_photos` in the form data)
 * after the transition.
 */
export function MaintenanceCompleteForm({
  id,
  onClose,
}: {
  readonly id: number;
  readonly onClose: () => void;
}) {
  const t = useTranslations('maintenance.complete');
  const tCommon = useTranslations('common');
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
      className="space-y-4 rounded-2xl bg-card p-5"
      noValidate
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {tCommon('actions.cancel')}
        </Button>
      </div>

      <FormGlobalError>{globalError}</FormGlobalError>

      <FormTextarea
        name="resolution_notes"
        control={form.control}
        label={t('notes_label')}
        placeholder={t('notes_placeholder')}
        rows={4}
      />

      <FormInput
        name="actual_cost"
        control={form.control}
        label={t('cost_label')}
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
          {t('photos_label')}
        </label>
        <input
          id="completion-photos"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-muted-foreground"
        />
        {photos.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('photos_selected', { count: photos.length })}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
