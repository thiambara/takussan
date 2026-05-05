'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MediaDropzone } from '@/components/media';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
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
  setPropertyAddressAction,
  setPropertyTagsAction,
  updatePropertyAction,
  uploadPropertyPhotosAction,
} from '@/app/actions/dashboard-properties';
import type { PropertyDetail } from '@/types/property';
import type { Tag } from '@/types/tag';

import {
  CONTRACT_TYPE_LABELS,
  CURRENCY_OPTIONS,
  PROPERTY_TYPE_LABELS,
  RENT_PERIOD_OPTIONS,
} from './options';
import {
  contractTypeValues,
  propertyTypeValues,
} from '@/lib/schemas/property';

const MAX_PHOTOS = 10;

interface PropertyFormProps {
  readonly mode: 'create' | 'edit';
  readonly property?: PropertyDetail;
  readonly tags?: Tag[];
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
      street: '',
      postal_code: '',
      country: '',
      latitude: undefined,
      longitude: undefined,
      area: undefined,
      bedrooms: undefined,
      bathrooms: undefined,
      furnished: false,
      year_built: undefined,
      parking_spaces: undefined,
      description: '',
      tag_ids: [],
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
    street: property.location?.street ?? '',
    postal_code: property.location?.postal_code ?? '',
    country: property.location?.country ?? '',
    latitude: property.location?.latitude ?? undefined,
    longitude: property.location?.longitude ?? undefined,
    area: property.area ?? undefined,
    bedrooms: property.bedrooms ?? undefined,
    bathrooms: property.bathrooms ?? undefined,
    furnished: Boolean(property.furnished),
    year_built: property.year_built ?? undefined,
    parking_spaces: property.parking_spaces ?? undefined,
    description: property.description ?? '',
    tag_ids: Array.isArray(property.tags) ? property.tags.map((t) => t.id) : [],
  };
}

export function PropertyForm({ mode, property, tags = [] }: PropertyFormProps) {
  const router = useRouter();
  const propertyTypeOptions = propertyTypeValues.map((v) => ({
    value: v,
    label: PROPERTY_TYPE_LABELS[v],
  }));
  const contractTypeOptions = contractTypeValues.map((v) => ({
    value: v,
    label: CONTRACT_TYPE_LABELS[v],
  }));
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const onPhotosChange = useCallback((files: File[]) => {
    setPhotoError(null);
    setPendingPhotos((prev) => [...prev, ...files]);
  }, []);

  const removePhoto = useCallback((index: number) => {
    setPhotoError(null);
    setPendingPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<PropertyFormValues, PropertyDetail>({
      schema: propertyFormSchema,
      defaultValues: toDefaults(property),
      onSubmit: async (values) => {
        const payload = values as unknown as PropertyFormPayload;
        // Strip address/tag fields before sending to property CRUD endpoint
        const {
          street: _street,
          postal_code: _postalCode,
          country: _country,
          latitude: _lat,
          longitude: _lng,
          tag_ids: _tagIds,
          ...basicPayload
        } = payload;
        const result =
          mode === 'edit' && property
            ? await updatePropertyAction(property.id, basicPayload as PropertyFormPayload)
            : await createPropertyAction(basicPayload as PropertyFormPayload);
        if (!result.ok) {
          throw new ApiError(result.status ?? 500, {
            message: result.message,
            errors: result.errors,
          });
        }
        return result.data as PropertyDetail;
      },
      onSuccess: async (result) => {
        if (!result?.id) {
          router.push('/app/properties');
          router.refresh();
          return;
        }
        const pid = result.id;
        const values = form.getValues() as unknown as PropertyFormPayload;

        // Address
        const hasAddress =
          values.street || values.postal_code || values.country ||
          values.latitude != null || values.longitude != null;
        if (hasAddress) {
          await setPropertyAddressAction(pid, {
            street: values.street,
            neighborhood: values.quarter,
            city: values.city,
            region: values.region,
            country: values.country,
            postal_code: values.postal_code,
            latitude: values.latitude ?? null,
            longitude: values.longitude ?? null,
          });
        }

        // Tags
        if (values.tag_ids && values.tag_ids.length > 0) {
          await setPropertyTagsAction(pid, values.tag_ids);
        }

        // Photos
        if (pendingPhotos.length > 0) {
          setPhotoUploading(true);
          try {
            const formData = new FormData();
            for (const file of pendingPhotos) formData.append('photos', file);
            const uploadResult = await uploadPropertyPhotosAction(pid, formData);
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

  const { control, watch, setValue } = form;
  const contractType = watch('contract_type');
  const description = watch('description') ?? '';
  const lat = watch('latitude') as number | null | undefined;
  const lng = watch('longitude') as number | null | undefined;
  const tagIds = (watch('tag_ids') ?? []) as number[];

  const handleLocationChange = useCallback(
    (newLat: number, newLng: number) => {
      setValue('latitude', newLat, { shouldDirty: true });
      setValue('longitude', newLng, { shouldDirty: true });
    },
    [setValue],
  );

  const toggleTag = useCallback(
    (tagId: number) => {
      const current = (form.getValues('tag_ids') ?? []) as number[];
      setValue(
        'tag_ids',
        current.includes(tagId)
          ? current.filter((id) => id !== tagId)
          : [...current, tagId],
        { shouldDirty: true },
      );
    },
    [form, setValue],
  );

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

      {/* ── Section 1 : Informations générales ── */}
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
            options={propertyTypeOptions}
          />
          <FormSelect
            control={control}
            name="contract_type"
            label="Type de contrat"
            required
            options={contractTypeOptions}
          />
        </div>
      </section>

      {/* ── Section 2 : Prix ── */}
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

      {/* ── Section 3 : Localisation / Adresse ── */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">Localisation</h2>
          <p className="text-xs text-app-ink-muted">
            La ville est obligatoire. Cliquez sur la carte pour placer le marqueur GPS.
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
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="street"
            label="Rue / adresse"
            placeholder="12 Rue des Jacarandas"
          />
          <FormInput
            control={control}
            name="postal_code"
            label="Code postal"
            placeholder="10700"
          />
          <FormInput
            control={control}
            name="country"
            label="Pays (code ISO)"
            placeholder="SN"
            maxLength={2}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-app-ink-muted">
            Coordonnées GPS{' '}
            {lat != null && lng != null && (
              <span className="text-app-ink">
                ({lat.toFixed(5)}, {lng.toFixed(5)})
              </span>
            )}
          </p>
          <LocationPickerMapLoader lat={lat} lng={lng} onChange={handleLocationChange} />
          <p className="text-xs text-app-ink-muted">
            Cliquez sur la carte ou faites glisser le marqueur pour ajuster la position.
          </p>
        </div>
      </section>

      {/* ── Section 4 : Caractéristiques ── */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">Caractéristiques</h2>
          <p className="text-xs text-app-ink-muted">
            Optionnel. Renseigner les informations accessibles aux locataires / acheteurs.
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
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="year_built"
            label="Année de construction"
            type="number"
            inputMode="numeric"
            min={1800}
            max={2100}
            placeholder="2010"
          />
          <FormInput
            control={control}
            name="parking_spaces"
            label="Places de parking"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="2"
          />
        </div>
        <FormCheckbox control={control} name="furnished" label="Meublé" />
      </section>

      {/* ── Section 5 : Description ── */}
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
        <p className="text-right text-xs text-app-ink-muted">
          {description.length} / 10 000 caractères
        </p>
      </section>

      {/* ── Section 6 : Équipements / Tags ── */}
      {tags.length > 0 && (
        <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
          <header>
            <h2 className="text-base font-semibold text-app-ink">Équipements</h2>
            <p className="text-xs text-app-ink-muted">
              Sélectionnez les équipements et commodités disponibles.
            </p>
          </header>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const checked = tagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  aria-pressed={checked}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-transparent text-app-ink hover:bg-app-surface-2'
                  }`}
                >
                  {tag.icon && <span aria-hidden="true">{tag.icon}</span>}
                  {tag.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 7 : Photos (creation only — edit uses PropertyMediaPanel) ── */}
      {mode === 'create' && (
        <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
          <header>
            <h2 className="text-base font-semibold text-app-ink">Photos</h2>
            <p className="text-xs text-app-ink-muted">
              Glissez-déposez ou sélectionnez les photos (max {MAX_PHOTOS}).
            </p>
          </header>
          <MediaDropzone
            onChange={onPhotosChange}
            files={pendingPhotos}
            onRemove={removePhoto}
            maxFiles={MAX_PHOTOS}
          />
          <p className="text-xs text-app-ink-muted">
            {pendingPhotos.length} / {MAX_PHOTOS} photo{pendingPhotos.length !== 1 ? 's' : ''}
          </p>
          {photoError ? (
            <p className="text-xs text-destructive" role="alert">
              {photoError}
            </p>
          ) : null}
        </section>
      )}

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
