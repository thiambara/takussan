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
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { fieldDensityScope } from '@/components/ui/field-density';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
import {
  FormCheckbox,
  FormDatePicker,
  FormGlobalError,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { ApiError } from '@/lib/api';
import {
  propertyFormSchema,
  titleTypeValues,
  type PropertyFormPayload,
  type PropertyFormValues,
} from '@/lib/schemas/property';
import {
  setPropertyTagsAction,
  updatePropertyAction,
} from '@/app/actions/dashboard-properties';
import type { PropertyDetail } from '@/types/property';
import type { Tag } from '@/types/tag';

import { areaLabelKey, isFieldRelevant, type RelevanceContext } from './field-matrix';
import {
  PROPERTY_ENUM_NAMESPACES,
  contractTypeOptions as fabriqueContractTypeOptions,
  currencyOptions as fabriqueCurrencyOptions,
  propertyTypeOptions as fabriquePropertyTypeOptions,
  rentPeriodOptions as fabriqueRentPeriodOptions,
} from './options';
import { toUpdatePayload, type PropertyAddressBlock, type PropertyUpdatePayload } from './payload';

interface PropertyFormProps {
  readonly mode: 'edit';
  readonly property: PropertyDetail;
  readonly tags?: Tag[];
}

function toDefaults(property: PropertyDetail): PropertyFormValues {
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
    title_type:
      (property.title_type as PropertyFormValues['title_type']) ?? undefined,
    available_from: property.available_from ?? undefined,
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
    floor_number: property.floor_number ?? undefined,
    total_floors: property.total_floors ?? undefined,
    description: property.description ?? '',
    // TCK-488 — les SEULS tags d'équipement. L'écran n'affiche que ceux-là
    // (`fetchTagsAction({ type: 'amenity' })`), et `SyncPropertyTagRequest` n'accepte que ceux-là :
    // composer la liste à partir de TOUS les tags du bien faisait 422 — avalé — à chaque
    // enregistrement d'un bien porteur d'un tag `feature`, ce que le seeder produit couramment.
    tag_ids: Array.isArray(property.tags)
      ? property.tags.filter((t) => t.type === 'amenity').map((t) => t.id)
      : [],
  };
}

/**
 * TCK-464 — les cinq champs d'adresse TEXTE qu'on peut vider depuis cet écran, et la traduction
 * de leur clé de formulaire vers la clé du bloc `address` (cf. `payload.ts`).
 *
 * `city` en est délibérément absente : le schéma la rend requise, elle ne peut donc jamais
 * atteindre cette fonction vide. `latitude`/`longitude` aussi : aucune affordance de cet écran ne
 * les remet à vide (seul le clic sur la carte les modifie), donc aucun champ à couvrir ici.
 */
const CHAMPS_ADRESSE_EFFACABLES = [
  { formulaire: 'street', bloc: 'street' },
  { formulaire: 'quarter', bloc: 'neighborhood' },
  { formulaire: 'region', bloc: 'region' },
  { formulaire: 'postal_code', bloc: 'postal_code' },
  { formulaire: 'country', bloc: 'country' },
] as const satisfies readonly {
  formulaire: keyof PropertyFormPayload;
  bloc: keyof PropertyAddressBlock;
}[];

/**
 * `toUpdatePayload` (payload.ts) OMET toute clé d'adresse vide — juste pour un champ jamais
 * rempli, faux pour un champ qu'on vient de VIDER : la clé omise ne dit rien au backend, qui
 * laisse alors l'ancienne valeur en base (charge héritée de TCK-464, reportée deux fois).
 *
 * `dirtyFields` (react-hook-form) est la SEULE source qui distingue les deux cas : un champ
 * revenu à vide APRÈS avoir été modifié est marqué `dirty`, un champ jamais touché ne l'est
 * jamais — alors que les deux valident au même résultat (`undefined`, après le `transform` du
 * schéma). Le backend accepte `null` sur ces colonnes : c'est ce qui efface réellement la valeur.
 *
 * ⚠ Cette fonction n'AJOUTE que des clés, jamais n'en retire : un champ déjà présent dans `address`
 * (rempli ou modifié vers une nouvelle valeur) traverse intact.
 */
function withAddressErasures(
  address: PropertyAddressBlock | undefined,
  values: PropertyFormPayload,
  dirtyFields: Partial<Record<string, unknown>>,
): PropertyAddressBlock | undefined {
  let bloc = address;
  for (const { formulaire, bloc: cleBloc } of CHAMPS_ADRESSE_EFFACABLES) {
    const toucheParUtilisateur = Boolean(dirtyFields[formulaire]);
    const estVide = !values[formulaire];
    if (toucheParUtilisateur && estVide) {
      bloc = { ...(bloc ?? {}), [cleBloc]: null };
    }
  }
  return bloc;
}

export function PropertyForm({ property, tags = [] }: PropertyFormProps) {
  const t = useTranslations('property.form');
  // TCK-292 — les six vocabulaires d'enum viennent du dictionnaire ; `./options` ne porte plus que
  // l'espace de noms et la fabrique. Les hooks sont posés AVANT toute sortie anticipée.
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tContractType = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const tCurrency = useTranslations(PROPERTY_ENUM_NAMESPACES.currency);
  const tRentPeriod = useTranslations(PROPERTY_ENUM_NAMESPACES.rentPeriod);
  const tTitleType = useTranslations(PROPERTY_ENUM_NAMESPACES.titleType);
  const router = useRouter();
  const propertyTypeOptions = fabriquePropertyTypeOptions(tType);
  const contractTypeOptions = fabriqueContractTypeOptions(tContractType);
  const currencyOptions = fabriqueCurrencyOptions(tCurrency);
  const rentPeriodOptions = fabriqueRentPeriodOptions(tRentPeriod);
  const titleTypeOptions = titleTypeValues.map((v) => ({ value: v, label: tTitleType(v) }));
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [tagsWarning, setTagsWarning] = useState<string | null>(null);

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<PropertyFormValues, PropertyDetail>({
      schema: propertyFormSchema,
      defaultValues: toDefaults(property),
      onSubmit: async (values) => {
        setSuccessMessage(null);
        setTagsWarning(null);
        const payload = values as unknown as PropertyFormPayload;
        const basePayload = toUpdatePayload(payload);
        const address = withAddressErasures(
          basePayload.address,
          payload,
          form.formState.dirtyFields,
        );
        const finalPayload: PropertyUpdatePayload = {
          ...basePayload,
          ...(address ? { address } : {}),
        };
        const result = await updatePropertyAction(property.id, finalPayload);
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

        // TCK-488 — les équipements, quand la matrice leur reconnaît un objet pour ce type.
        //
        // Trois écarts fermés d'un coup, et ils se tenaient : la liste ne partait QUE non vide
        // (décocher le dernier équipement ne l'enlevait donc jamais), son résultat n'était PAS lu
        // (contrainte 3 de TCK-464 : « leur échec doit être affiché »), et le parcours de création,
        // lui, testait déjà `r.ok` — deux écrans, deux comportements pour le même geste.
        //
        // ⚠ La liste ne part pas du tout quand la section n'est pas rendue : `tag_ids` est
        // délibérément absent de la table d'effacement de TCK-469, il reste omis dans les deux
        // modes. Un changement de type ne détache donc rien.
        const contexteCourant: RelevanceContext = {
          type: values.type,
          contract: values.contract_type,
        };
        if (isFieldRelevant('tag_ids', contexteCourant)) {
          const resultatTags = await setPropertyTagsAction(pid, values.tag_ids ?? []);
          if (!resultatTags.ok) {
            // Le bien EST enregistré : quitter la page ou parler d'échec enverrait ressaisir des
            // modifications déjà en base. On reste ici, c'est d'ici qu'on réessaie.
            setTagsWarning(t('amenities.saveFailed'));
            return;
          }
        }

        setSuccessMessage(t('updated'));
        router.push('/app/properties');
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
  const ctx: RelevanceContext = { type: watch('type'), contract: contractType };

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
    /* TCK-468 — même portée de densité que le parcours de publication : les deux écrans qui
       portent des champs ET des pastilles répondent au même régime (44 px). */
    <form onSubmit={handleSubmit} className="space-y-8" noValidate {...fieldDensityScope()}>
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
          className="rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm font-medium text-success"
        >
          {successMessage}
        </p>
      ) : null}
      {tagsWarning ? (
        <p
          role="status"
          className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-medium text-warning-foreground"
        >
          {tagsWarning}
        </p>
      ) : null}

      {/* ── Section 1 : Informations générales ── */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">{t('general.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('general.hint')}</p>
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
      <section className="rounded-xl bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">{t('price.title')}</h2>
          <p className="text-xs text-muted-foreground">
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
      <section className="rounded-xl bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">{t('location.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('location.hintFull')}</p>
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
          <p className="text-xs font-medium text-muted-foreground">
            {t('location.gps')}{' '}
            {lat != null && lng != null && (
              <span className="text-foreground">
                ({lat.toFixed(5)}, {lng.toFixed(5)})
              </span>
            )}
          </p>
          <LocationPickerMapLoader lat={lat} lng={lng} onChange={handleLocationChange} />
          <p className="text-xs text-muted-foreground">{t('location.mapHint')}</p>
        </div>
      </section>

      {/*
        ── Section 4 : Caractéristiques ──
        TCK-464 — chaque champ conditionnel demande à `isFieldRelevant` (field-matrix.ts), la
        SEULE source de vérité, partagée avec le parcours de création et la sérialisation du
        payload. Aucune condition sur `type`/`contract_type` ne s'écrit ici en clair : une
        deuxième version de la règle est celle qui finit par diverger (cf. l'en-tête de la
        matrice).
      */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">{t('features.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('features.hintFull')}</p>
        </header>
        <div className="grid gap-4 md:grid-cols-3">
          {isFieldRelevant('area', ctx) ? (
            <FormInput
              control={control}
              name="area"
              // TCK-488 — un terrain se mesure en surface de PARCELLE, un logement en surface
              // HABITABLE : `areaLabelKey` porte la distinction, et le parcours l'appliquait déjà.
              label={t(areaLabelKey(ctx.type))}
              type="number"
              inputMode="numeric"
              min={0}
            />
          ) : null}
          {isFieldRelevant('bedrooms', ctx) ? (
            <FormInput
              control={control}
              name="bedrooms"
              label={t('fields.bedrooms')}
              type="number"
              inputMode="numeric"
              min={0}
            />
          ) : null}
          {isFieldRelevant('bathrooms', ctx) ? (
            <FormInput
              control={control}
              name="bathrooms"
              label={t('fields.bathrooms')}
              type="number"
              inputMode="numeric"
              min={0}
            />
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {isFieldRelevant('floor_number', ctx) ? (
            <FormInput
              control={control}
              name="floor_number"
              label={t('fields.floorNumber')}
              type="number"
              inputMode="numeric"
              min={-5}
              max={200}
            />
          ) : null}
          {isFieldRelevant('total_floors', ctx) ? (
            <FormInput
              control={control}
              name="total_floors"
              label={t('fields.totalFloors')}
              type="number"
              inputMode="numeric"
              min={1}
              max={200}
            />
          ) : null}
          {isFieldRelevant('year_built', ctx) ? (
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
          ) : null}
          {isFieldRelevant('parking_spaces', ctx) ? (
            <FormInput
              control={control}
              name="parking_spaces"
              label={t('fields.parking')}
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="2"
            />
          ) : null}
        </div>
        {isFieldRelevant('furnished', ctx) ? (
          <FormCheckbox control={control} name="furnished" label={t('fields.furnished')} />
        ) : null}
        {isFieldRelevant('title_type', ctx) ? (
          <FormSelect
            control={control}
            name="title_type"
            label={t('fields.titleType')}
            options={titleTypeOptions}
          />
        ) : null}
        {isFieldRelevant('available_from', ctx) ? (
          <FormDatePicker
            control={control}
            name="available_from"
            label={t('fields.availableFrom')}
          />
        ) : null}
      </section>

      {/* ── Section 5 : Description ── */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">{t('description.title')}</h2>
          <p className="text-xs text-muted-foreground">{t('description.hint')}</p>
        </header>
        <FormTextarea
          control={control}
          name="description"
          label={t('fields.description')}
          rows={6}
          placeholder={t('fields.descriptionPlaceholder')}
        />
        <p className="text-right text-xs text-muted-foreground">
          {t('description.counter', { count: description.length })}
        </p>
      </section>

      {/* ── Section 6 : Équipements / Tags ──
        TCK-488 — les équipements seedés sont domestiques : les proposer sur un terrain, un garage
        ou un parking n'offre aucun choix pertinent. Le parcours de publication le gardait déjà
        (`StepCaracteristiques`), l'édition ne le gardait pas — alors que l'AC2 de TCK-464 exigeait
        la vérification « à la création ET à l'édition ». */}
      {isFieldRelevant('tag_ids', ctx) && tags.length > 0 && (
        <section className="rounded-xl bg-card p-6 space-y-4">
          <header>
            <h2 className="text-base font-semibold text-foreground">{t('amenities.title')}</h2>
            <p className="text-xs text-muted-foreground">{t('amenities.hint')}</p>
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
                  // TCK-468 — `min-h-11` = 44 px, comme les pastilles de `ChoiceChips` dans le
                  // parcours de publication. Sans ça, l'édition alignait ses CHAMPS sur 44 px et
                  // gardait ses pastilles à 28 : l'écart changeait de camp au lieu de disparaître.
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${
                    checked
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-transparent text-foreground hover:bg-muted'
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

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {dirtyCount > 0 ? t('footer.dirty', { count: dirtyCount }) : t('footer.noChanges')}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            {t('footer.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting} size="lg">
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                <span>{t('footer.saving')}</span>
              </>
            ) : (
              <span>{t('footer.saveChanges')}</span>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
