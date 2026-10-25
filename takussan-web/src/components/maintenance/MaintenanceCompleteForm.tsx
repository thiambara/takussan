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
import { reduirePhotos } from '@/lib/reduire-photo';

/**
 * Completion workflow — captures the resolution notes, optional actual
 * cost, and post-resolution photos.
 *
 * TCK-592 (P15) — une photo dont l'envoi échoue ne laisse pas la demande « terminée » sans preuve.
 * Elles partaient par `/photos` APRÈS la transition, et leur échec était avalé.
 *
 * TCK-2330 (P222.02) — elles partent UNE À UNE par `/photos` (`completion_photos`), AVANT
 * `/complete`, qui n'en porte plus : tout le lot dans un corps dépassait la borne du proxy
 * (25 Mio, `docker/Caddyfile`) dès 19 photos réduites. Le premier échec arrête tout, s'affiche,
 * et la transition n'a pas lieu ; une photo jointe sort de la sélection, pour ne pas repartir
 * quand on réessaie.
 *
 * TCK-592 (verif-592, M1) — le coût réel est un champ du DONNEUR D'ORDRE (`withCost`, lu de
 * `abilities.can_assign`) : le prestataire qui le portait à la complétion prend un 403.
 */
export function MaintenanceCompleteForm({
  id,
  onClose,
  withCost = false,
}: {
  readonly id: number;
  readonly onClose: () => void;
  readonly withCost?: boolean;
}) {
  const t = useTranslations('maintenance.complete');
  const tCommon = useTranslations('common');
  const complete = useCompleteMaintenanceRequest(id);
  const upload = useUploadMaintenancePhotos();
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
      // Réduites dans le navigateur avant l'envoi (TCK-542), dans l'ordre de la sélection.
      const reduites = photos.length > 0 ? await reduirePhotos(photos) : [];
      for (const [index, photo] of reduites.entries()) {
        await upload.mutateAsync({ id, files: [photo], collection: 'completion_photos' });
        const jointe = photos[index];
        setPhotos((restantes) => restantes.filter((p) => p !== jointe));
      }
      return complete.mutateAsync({
        ...values,
        actual_cost: withCost ? values.actual_cost : undefined,
      });
    },
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

      {withCost ? (
        <FormInput
          name="actual_cost"
          control={form.control}
          label={t('cost_label')}
          type="number"
          min={0}
          step="100"
          placeholder="0"
        />
      ) : null}

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
