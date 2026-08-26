'use client';

/**
 * TODO TCK-261 — depuis ce formulaire, exposer un bouton "Inviter un
 * nouveau prestataire" qui monte
 * `<InviteServiceProviderSheet>` (cf. TCK-260) avec :
 *   - `prefilledTrades`   : la `category` choisie ici
 *   - `prefilledZones`    : la zone du bien (city / quartier)
 *   - `fromMaintenanceRequestId` : l'id de la demande qu'on vient de
 *     créer (à passer après la mutation `useCreateMaintenanceRequest`).
 * Le contrôleur backend propage déjà `from_maintenance_request_id` dans
 * la metadata de l'invitation pour que le SP atterrisse directement sur
 * la demande à l'acceptation.
 */

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Controller } from 'react-hook-form';

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
import { MAINTENANCE_CATEGORIES } from '@/types/maintenance';
import { MaintenancePrioritySelector } from './MaintenancePrioritySelector';

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
  const t = useTranslations('maintenance.form');
  const tCategory = useTranslations('maintenance.category');
  const tCommon = useTranslations('common');
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
        label={t('title_label')}
        placeholder={t('title_placeholder')}
        required
      />

      <FormTextarea
        name="description"
        control={form.control}
        label={t('description_label')}
        placeholder={t('description_placeholder')}
        rows={5}
        required
      />

      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <FormSelect
            name="category"
            control={form.control}
            options={MAINTENANCE_CATEGORIES.map((c) => ({
              value: c,
              label: tCategory(c),
            }))}
            label={t('category_label')}
            required
          />
        </div>
        
        <div>
          <label className="mb-2 block text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {t('priority_label')}{' '}
            <span className="text-muted-foreground font-normal">{t('priority_hint')}</span>
          </label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <MaintenancePrioritySelector
                value={field.value || 'normal'}
                onChange={field.onChange}
                disabled={isSubmitting}
              />
            )}
          />
        </div>
      </div>

      <div>
        <label htmlFor="maintenance-photos" className="mb-1.5 block text-sm font-medium">
          {t('photos_label')}
        </label>
        <input
          id="maintenance-photos"
          ref={fileInputRef}
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

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon('actions.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>
      </div>
    </form>
  );
}
