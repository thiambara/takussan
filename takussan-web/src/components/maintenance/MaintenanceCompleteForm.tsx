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
import { useCompleteMaintenanceRequest } from '@/lib/queries/maintenance';
import { reduirePhotos } from '@/lib/reduire-photo';

/**
 * Completion workflow — captures the resolution notes, optional actual
 * cost, and post-resolution photos.
 *
 * TCK-592 (P15) — les photos voyagent DANS `PUT …/complete` (`photos[]`). Elles partaient par
 * `/photos` APRÈS la transition, et leur échec était avalé : la demande passait « terminée »
 * sans preuve, sans que personne le voie. Désormais un échec n'écrit rien, s'affiche, et les
 * fichiers choisis restent pour réessayer.
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
    onSubmit: async (values) =>
      complete.mutateAsync({
        ...values,
        // Réduites dans le navigateur avant l'envoi (TCK-542).
        photos: photos.length > 0 ? await reduirePhotos(photos) : undefined,
      }),
    onSuccess: () => {
      onClose();
    },
  });

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl bg-card p-4 sm:p-5"
      noValidate
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>
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
          capture="environment"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:h-8 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
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
