'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MediaDropzone } from '@/components/media';
import {
  FormCheckbox,
  FormGlobalError,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { ApiError } from '@/lib/api';
import {
  propertyFormSchema,
  type PropertyFormPayload,
  type PropertyFormValues,
} from '@/lib/schemas/property';
import {
  createPropertyAction,
  updatePropertyAction,
  uploadPropertyPhotosAction,
} from '@/app/actions/dashboard-properties';
import type { PropertyDetail } from '@/types/property';

import {
  CONTRACT_TYPE_OPTIONS,
  CURRENCY_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  RENT_PERIOD_OPTIONS,
} from './options';

/**
 * Property create / edit form — TCK-041.
 *
 * Client-side validation happens via zod/react-hook-form (see
 * `propertyFormSchema`). Server validation errors (422) are mapped onto
 * their matching fields by `useApiForm`. Photos are uploaded in a second
 * step once the property has been persisted (needs an id).
 */

interface PropertyFormProps {
  readonly mode: 'create' | 'edit';
  readonly property?: PropertyDetail;
}

function toDefaults(property?: PropertyDetail): PropertyFormValues {
  if (!property) {
    return {
      title: '',
      type: 'apartment',
      contract_type: 'rent',
      price: undefined as unknown as number,
      currency: 'XOF',
      rent_period: undefined,
      city: '',
      quarter: '',
      region: '',
      area: undefined,
      bedrooms: undefined,
      bathrooms: undefined,
      furnished: false,
      description: '',
    };
  }
  return {
    title: property.title ?? '',
    type: (property.type as PropertyFormValues['type']) ?? 'apartment',
    contract_type:
      (property.contract_type as PropertyFormValues['contract_type']) ?? 'rent',
    price: property.price,
    currency:
      (property.currency as PropertyFormValues['currency']) ?? 'XOF',
    rent_period:
      (property.rent_period as PropertyFormValues['rent_period']) ?? undefined,
    city: property.location?.city ?? '',
    quarter: property.location?.quarter ?? '',
    region: property.location?.region ?? '',
    area: property.area ?? undefined,
    bedrooms: property.bedrooms ?? undefined,
    bathrooms: property.bathrooms ?? undefined,
    furnished: Boolean(property.furnished),
    description: property.description ?? '',
  };
}

export function PropertyForm({ mode, property }: PropertyFormProps) {
  const router = useRouter();
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const onPhotosChange = useCallback((files: File[]) => {
    setPhotoError(null);
    setPendingPhotos((prev) => [...prev, ...files]);
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<PropertyFormValues, PropertyDetail>({
      schema: propertyFormSchema,
      defaultValues: toDefaults(property),
      onSubmit: async (values) => {
        // zod applies defaults / transforms — cast to the output type.
        const payload = values as unknown as PropertyFormPayload;
        const result =
          mode === 'edit' && property
            ? await updatePropertyAction(property.id, payload)
            : await createPropertyAction(payload);
        if (!result.ok) {
          throw new ApiError(result.status ?? 500, {
            message: result.message,
            errors: result.errors,
          });
        }
        return result.data as PropertyDetail;
      },
      onSuccess: async (result) => {
        if (pendingPhotos.length > 0 && result?.id) {
          setPhotoUploading(true);
          try {
            const formData = new FormData();
            // Server action re-reads `photos` then builds the backend
            // payload as `photos[]` on the outbound request itself.
            for (const file of pendingPhotos) formData.append('photos', file);
            const uploadResult = await uploadPropertyPhotosAction(
              result.id,
              formData,
            );
            if (!uploadResult.ok) {
              setPhotoError(uploadResult.message);
              setPhotoUploading(false);
              return;
            }
          } finally {
            setPhotoUploading(false);
          }
        }
        router.push('/app/properties');
        router.refresh();
      },
    });

  const { control, watch } = form;
  const contractType = watch('contract_type');

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      <FormGlobalError>
        {globalError ? (
          <span className="flex items-center justify-between gap-4">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={clearGlobalError}
              className="text-xs underline"
            >
              Fermer
            </button>
          </span>
        ) : null}
      </FormGlobalError>

      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">Informations générales</h2>
          <p className="text-xs text-app-ink-muted">
            Titre, type et contrat définissent la fiche publique du bien.
          </p>
        </header>
        <FormInput
          control={control}
          name="title"
          label="Titre"
          required
          placeholder="Villa avec piscine à Almadies"
          maxLength={200}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormSelect
            control={control}
            name="type"
            label="Type de bien"
            required
            options={PROPERTY_TYPE_OPTIONS}
          />
          <FormSelect
            control={control}
            name="contract_type"
            label="Type de contrat"
            required
            options={CONTRACT_TYPE_OPTIONS}
          />
        </div>
      </section>

      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">Prix</h2>
          <p className="text-xs text-app-ink-muted">
            {contractType === 'rent'
              ? 'Loyer périodique. Indiquez aussi la fréquence.'
              : 'Prix de vente total.'}
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="price"
            label="Prix"
            required
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="150000"
          />
          <FormSelect
            control={control}
            name="currency"
            label="Devise"
            options={CURRENCY_OPTIONS}
          />
          {contractType === 'rent' ? (
            <FormSelect
              control={control}
              name="rent_period"
              label="Fréquence"
              options={RENT_PERIOD_OPTIONS}
              placeholder="Mensuel"
            />
          ) : (
            <div />
          )}
        </div>
      </section>

      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">Localisation</h2>
          <p className="text-xs text-app-ink-muted">
            La ville est obligatoire. Le quartier et la région améliorent la
            recherche.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="city"
            label="Ville"
            required
            placeholder="Dakar"
          />
          <FormInput
            control={control}
            name="quarter"
            label="Quartier"
            placeholder="Almadies"
          />
          <FormInput
            control={control}
            name="region"
            label="Région"
            placeholder="Dakar"
          />
        </div>
      </section>

      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">Caractéristiques</h2>
          <p className="text-xs text-app-ink-muted">
            Optionnel. Renseigner les informations accessibles aux locataires /
            acheteurs.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="area"
            label="Superficie (m²)"
            type="number"
            inputMode="numeric"
            min={0}
          />
          <FormInput
            control={control}
            name="bedrooms"
            label="Chambres"
            type="number"
            inputMode="numeric"
            min={0}
          />
          <FormInput
            control={control}
            name="bathrooms"
            label="Salles de bain"
            type="number"
            inputMode="numeric"
            min={0}
          />
        </div>
        <FormCheckbox control={control} name="furnished" label="Meublé" />
      </section>

      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">Description</h2>
          <p className="text-xs text-app-ink-muted">
            Soyez concret : état, commodités, voisinage.
          </p>
        </header>
        <FormTextarea
          control={control}
          name="description"
          label="Description"
          rows={6}
          placeholder="Décrivez le bien, son environnement, ses atouts."
        />
      </section>

      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">Photos</h2>
          <p className="text-xs text-app-ink-muted">
            Glissez-déposez ou sélectionnez les photos. Les photos existantes
            ne sont pas affectées.
          </p>
        </header>
        <MediaDropzone
          onChange={onPhotosChange}
          files={pendingPhotos}
          onRemove={removePhoto}
        />
        {photoError ? (
          <p className="text-xs text-destructive" role="alert">
            {photoError}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting || photoUploading} size="lg">
          {isSubmitting || photoUploading ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              <span>Enregistrement…</span>
            </>
          ) : (
            <span>
              {mode === 'create' ? 'Publier le bien' : 'Enregistrer les modifications'}
            </span>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={() => router.back()}
          disabled={isSubmitting || photoUploading}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}

