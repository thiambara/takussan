'use client';

// TCK-256 — TODO: when this form gains an "owner" select, add an
// "Inviter un nouveau propriétaire" option that mounts the shared
// `<InviteOwnerSheet>` (see `src/components/owners/InviteOwnerSheet.tsx`).
// On success, auto-select the freshly invited owner via the sheet's
// `onInvited` callback. The sheet handles its own visibility gate
// (`agency.kind === 'standard'` + `invite_owner` permission), so the
// option only needs to surface when the property form is rendered for
// a standard-kind agency. Out of scope for TCK-256: adding the owner
// select itself.

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
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
  PROPERTY_ENUM_NAMESPACES,
  contractTypeOptions as fabriqueContractTypeOptions,
  currencyOptions as fabriqueCurrencyOptions,
  propertyTypeOptions as fabriquePropertyTypeOptions,
  rentPeriodOptions as fabriqueRentPeriodOptions,
} from './options';

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

function toPropertyCrudPayload(payload: PropertyFormPayload): PropertyFormPayload {
  const basicPayload: Partial<PropertyFormPayload> = { ...payload };
  delete basicPayload.street;
  delete basicPayload.postal_code;
  delete basicPayload.country;
  delete basicPayload.latitude;
  delete basicPayload.longitude;
  delete basicPayload.tag_ids;
  return basicPayload as PropertyFormPayload;
}

export function PropertyForm({ mode, property, tags = [] }: PropertyFormProps) {
  const t = useTranslations('property.form');
  // TCK-292 — les six vocabulaires d'enum viennent du dictionnaire ; `./options` ne porte plus que
  // l'espace de noms et la fabrique. Les hooks sont posés AVANT toute sortie anticipée.
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tContractType = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const tCurrency = useTranslations(PROPERTY_ENUM_NAMESPACES.currency);
  const tRentPeriod = useTranslations(PROPERTY_ENUM_NAMESPACES.rentPeriod);
  const router = useRouter();
  const propertyTypeOptions = fabriquePropertyTypeOptions(tType);
  const contractTypeOptions = fabriqueContractTypeOptions(tContractType);
  const currencyOptions = fabriqueCurrencyOptions(tCurrency);
  const rentPeriodOptions = fabriqueRentPeriodOptions(tRentPeriod);
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const submitIntentRef = useRef<'draft' | 'submit'>('submit');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectSubmitIntent = useCallback((intent: 'draft' | 'submit') => {
    submitIntentRef.current = intent;
  }, []);

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
        setSuccessMessage(null);
        const payload = values as unknown as PropertyFormPayload;
        const basicPayload = toPropertyCrudPayload(payload);
        const createPayload =
          mode === 'create'
            ? {
                ...basicPayload,
                status: submitIntentRef.current === 'draft' ? 'draft' : 'pending_review',
                visibility: 'private',
              }
            : basicPayload;
        const result =
          mode === 'edit' && property
            ? await updatePropertyAction(property.id, basicPayload as PropertyFormPayload)
            : await createPropertyAction(createPayload as PropertyFormPayload);
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
          if (mode === 'create') {
            throw new ApiError(500, {
              message: t('missingIdError'),
            });
          }
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

        if (mode === 'create') {
          setSuccessMessage(t('created'));
          router.push(`/app/properties/${pid}`);
        } else {
          setSuccessMessage(t('updated'));
          router.push('/app/properties');
        }
        router.refresh();
      },
    });

  const { control, watch, setValue, formState } = form;
  const dirtyCount = Object.keys(formState.dirtyFields).length;
  const contractType = watch('contract_type');
  const description = watch('description') ?? '';
  const lat = watch('latitude') as number | null | undefined;
  const lng = watch('longitude') as number | null | undefined;
  const tagIds = (watch('tag_ids') ?? []) as number[];

  // Ces deux gestionnaires sont passés en props à des enfants, et ils ne sont PAS enveloppés dans
  // un `useCallback` : le React Compiler s'en charge (ADR-0015). Les `useCallback` qui s'y
  // trouvaient faisaient ABANDONNER la compilation de tout ce composant —
  // `react-hooks/preserve-manual-memoization` les signalait, et son correctif est de retirer la
  // mémoïsation manuelle, pas de l'ajuster.
  const handleLocationChange = (newLat: number, newLng: number) => {
    setValue('latitude', newLat, { shouldDirty: true });
    setValue('longitude', newLng, { shouldDirty: true });
  };

  const toggleTag = (tagId: number) => {
    const current = (form.getValues('tag_ids') ?? []) as number[];
    setValue(
      'tag_ids',
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId],
      { shouldDirty: true },
    );
  };

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
              {t('close')}
            </button>
          </span>
        ) : null}
      </FormGlobalError>
      {successMessage ? (
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          {successMessage}
        </p>
      ) : null}

      {/* ── Section 1 : Informations générales ── */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">{t('general.title')}</h2>
          <p className="text-xs text-app-ink-muted">{t('general.hint')}</p>
        </header>
        <FormInput
          control={control}
          name="title"
          label={t('fields.title')}
          required
          placeholder={t('fields.titlePlaceholder')}
          maxLength={200}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <FormSelect
            control={control}
            name="type"
            label={t('fields.type')}
            required
            options={propertyTypeOptions}
          />
          <FormSelect
            control={control}
            name="contract_type"
            label={t('fields.contract')}
            required
            options={contractTypeOptions}
          />
        </div>
      </section>

      {/* ── Section 2 : Prix ── */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">{t('price.title')}</h2>
          <p className="text-xs text-app-ink-muted">
            {t(contractType === 'rent' ? 'price.hintRent' : 'price.hintSale')}
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="price"
            label={t('fields.price')}
            required
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="150000"
          />
          <FormSelect
            control={control}
            name="currency"
            label={t('fields.currency')}
            options={currencyOptions}
          />
          {contractType === 'rent' ? (
            <FormSelect
              control={control}
              name="rent_period"
              label={t('fields.period')}
              options={rentPeriodOptions}
              placeholder={t('fields.periodPlaceholder')}
            />
          ) : (
            <div />
          )}
        </div>
      </section>

      {/* ── Section 3 : Localisation / Adresse ── */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">{t('location.title')}</h2>
          <p className="text-xs text-app-ink-muted">{t('location.hintFull')}</p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="city"
            label={t('fields.city')}
            required
            placeholder={t('fields.cityPlaceholder')}
          />
          <FormInput
            control={control}
            name="quarter"
            label={t('fields.quarter')}
            placeholder={t('fields.quarterPlaceholder')}
          />
          <FormInput
            control={control}
            name="region"
            label={t('fields.region')}
            placeholder={t('fields.regionPlaceholder')}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="street"
            label={t('fields.street')}
            placeholder={t('fields.streetPlaceholder')}
          />
          <FormInput
            control={control}
            name="postal_code"
            label={t('fields.postalCode')}
            placeholder="10700"
          />
          <FormInput
            control={control}
            name="country"
            label={t('fields.country')}
            placeholder={t('fields.countryPlaceholder')}
            maxLength={2}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-app-ink-muted">
            {t('location.gps')}{' '}
            {lat != null && lng != null && (
              <span className="text-app-ink">
                ({lat.toFixed(5)}, {lng.toFixed(5)})
              </span>
            )}
          </p>
          <LocationPickerMapLoader lat={lat} lng={lng} onChange={handleLocationChange} />
          <p className="text-xs text-app-ink-muted">{t('location.mapHint')}</p>
        </div>
      </section>

      {/* ── Section 4 : Caractéristiques ── */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">{t('features.title')}</h2>
          <p className="text-xs text-app-ink-muted">{t('features.hintFull')}</p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="area"
            label={t('fields.area')}
            type="number"
            inputMode="numeric"
            min={0}
          />
          <FormInput
            control={control}
            name="bedrooms"
            label={t('fields.bedrooms')}
            type="number"
            inputMode="numeric"
            min={0}
          />
          <FormInput
            control={control}
            name="bathrooms"
            label={t('fields.bathrooms')}
            type="number"
            inputMode="numeric"
            min={0}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="year_built"
            label={t('fields.yearBuilt')}
            type="number"
            inputMode="numeric"
            min={1800}
            max={2100}
            placeholder="2010"
          />
          <FormInput
            control={control}
            name="parking_spaces"
            label={t('fields.parking')}
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="2"
          />
        </div>
        <FormCheckbox control={control} name="furnished" label={t('fields.furnished')} />
      </section>

      {/* ── Section 5 : Description ── */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-app-ink">{t('description.title')}</h2>
          <p className="text-xs text-app-ink-muted">{t('description.hint')}</p>
        </header>
        <FormTextarea
          control={control}
          name="description"
          label={t('fields.description')}
          rows={6}
          placeholder={t('fields.descriptionPlaceholder')}
        />
        <p className="text-right text-xs text-app-ink-muted">
          {t('description.counter', { count: description.length })}
        </p>
      </section>

      {/* ── Section 6 : Équipements / Tags ── */}
      {tags.length > 0 && (
        <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
          <header>
            <h2 className="text-base font-semibold text-app-ink">{t('amenities.title')}</h2>
            <p className="text-xs text-app-ink-muted">{t('amenities.hint')}</p>
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
            <h2 className="text-base font-semibold text-app-ink">{t('photos.title')}</h2>
            <p className="text-xs text-app-ink-muted">{t('photos.hint', { max: MAX_PHOTOS })}</p>
          </header>
          <MediaDropzone
            onChange={onPhotosChange}
            files={pendingPhotos}
            onRemove={removePhoto}
            maxFiles={MAX_PHOTOS}
          />
          <p className="text-xs text-app-ink-muted">
            {t('photos.counter', { count: pendingPhotos.length, max: MAX_PHOTOS })}
          </p>
          {photoError ? (
            <p className="text-xs text-destructive" role="alert">
              {photoError}
            </p>
          ) : null}
        </section>
      )}

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <p className="text-xs text-app-ink-muted" aria-live="polite">
          {mode === 'edit' && dirtyCount > 0
            ? t('footer.dirty', { count: dirtyCount })
            : t(mode === 'edit' ? 'footer.noChanges' : 'footer.requiredHint')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => router.back()}
            disabled={isSubmitting || photoUploading}
          >
            {t('footer.cancel')}
          </Button>
          {mode === 'create' && (
            <Button
              type="submit"
              disabled={isSubmitting || photoUploading}
              size="lg"
              variant="outline"
              onClick={() => selectSubmitIntent('draft')}
            >
              {t('footer.saveDraft')}
            </Button>
          )}
          <Button
            type="submit"
            disabled={isSubmitting || photoUploading}
            size="lg"
            onClick={() => selectSubmitIntent('submit')}
          >
            {isSubmitting || photoUploading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                <span>{t('footer.saving')}</span>
              </>
            ) : (
              <span>
                {t(mode === 'create' ? 'footer.submit' : 'footer.saveChanges')}
              </span>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
