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
import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Controller } from 'react-hook-form';

import {
  FormGlobalError,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/forms';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
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
import { PHOTOS_PAR_SELECTION_MAX } from '@/lib/borne-du-corps';
import { reduirePhotos } from '@/lib/reduire-photo';
import { MaintenancePrioritySelector } from './MaintenancePrioritySelector';

/**
 * Report-a-problem form. Submits the request, then — if the user
 * attached photos — calls `/photos` with `collection=photos`.
 *
 * TCK-2370 (P236.02) — une photo par appel, comme la clôture (TCK-2330), arrêt au premier échec :
 * tout le lot dans un corps dépassait la borne du proxy (25 Mio) dès 19 photos réduites. La borne
 * de 20 se lit au sélecteur, et une sélection qui la dépasse est refusée entière.
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
  const toast = useToast();
  const [photos, setPhotos] = useState<File[]>([]);
  const [tropDePhotos, setTropDePhotos] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const borneId = useId();

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
          // Réduites dans le navigateur avant l'envoi (TCK-542).
          for (const photo of await reduirePhotos(photos)) {
            await uploadPhotos.mutateAsync({ id, files: [photo], collection: 'photos' });
          }
        } catch {
          // La demande reste créée : on mène quand même à sa fiche, puisqu'un second envoi du
          // formulaire la dupliquerait. L'avertissement est persistant (`timeout: 0`) : le
          // `Toaster` du layout survit à la navigation, il se lit donc sur la fiche (TCK-2146).
          toast.add({
            title: t('photos_failed_title'),
            description: t('photos_failed_body'),
            type: 'warning',
            timeout: 0,
          });
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
        <div className="grid gap-4 lg:grid-cols-2">
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
          aria-describedby={borneId}
          onChange={(e) => {
            const choisies = Array.from(e.target.files ?? []);
            if (choisies.length > PHOTOS_PAR_SELECTION_MAX) {
              setTropDePhotos(choisies.length);
              setPhotos([]);
              e.target.value = '';
              return;
            }
            setTropDePhotos(null);
            setPhotos(choisies);
          }}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:h-8 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
        />
        <p id={borneId} className="mt-1 text-xs text-muted-foreground">
          {t('photos_hint', { max: PHOTOS_PAR_SELECTION_MAX })}
        </p>
        {tropDePhotos !== null ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {t('photos_too_many', { count: tropDePhotos, max: PHOTOS_PAR_SELECTION_MAX })}
          </p>
        ) : null}
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
