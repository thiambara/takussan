'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Loader2, UploadCloud, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

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

  const onPhotosChange = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const next: File[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) {
          setPhotoError('Seules les images sont acceptées.');
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          setPhotoError('Chaque photo doit peser moins de 10 Mo.');
          return;
        }
        next.push(file);
      }
      setPhotoError(null);
      setPendingPhotos((prev) => [...prev, ...next]);
    },
    [],
  );

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
        <PhotoDropzone
          onChange={onPhotosChange}
          files={pendingPhotos}
          onRemove={removePhoto}
          error={photoError}
        />
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

function PhotoDropzone({
  onChange,
  files,
  onRemove,
  error,
}: {
  onChange: (files: FileList | null) => void;
  files: File[];
  onRemove: (index: number) => void;
  error: string | null;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div>
      <label
        htmlFor="property-photos-input"
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          onChange(e.dataTransfer.files);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-app-surface-3 bg-app-surface-2/40 px-6 py-10 text-center text-sm text-app-ink-muted transition-colors hover:border-app-accent/60',
          isDragOver && 'border-app-accent bg-app-surface-2',
        )}
      >
        <UploadCloud className="size-6 text-app-accent" aria-hidden="true" />
        <p className="text-sm font-medium text-app-ink">
          Glissez-déposez vos photos ici
        </p>
        <p className="text-xs">ou cliquez pour sélectionner — 10 Mo par photo.</p>
        <input
          id="property-photos-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => onChange(e.target.files)}
          className="sr-only"
        />
      </label>

      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="group relative overflow-hidden rounded-lg bg-app-surface-2 p-2 text-xs"
            >
              <span className="block truncate text-app-ink">{file.name}</span>
              <span className="block text-app-ink-muted">
                {(file.size / (1024 * 1024)).toFixed(2)} Mo
              </span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="absolute right-1 top-1 rounded-full bg-app-bg/70 p-1 text-app-ink transition-opacity hover:bg-app-bg"
                aria-label={`Retirer ${file.name}`}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
