'use client';

import { useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ImageIcon } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import type { Locale } from '@/i18n/config';
import { formatCurrency } from '@/lib/format';
import type { RadarClaimListing } from '@/lib/queries/radar-claim';

/** Les corrections que la page permet, telles que saisies (chaînes : le prix se relit à l'envoi). */
export interface ClaimListingDraft {
  readonly retenue: boolean;
  readonly title: string;
  readonly price: string;
  readonly description: string;
}

export function brouillonDe(listing: RadarClaimListing): ClaimListingDraft {
  return {
    retenue: true,
    title: listing.title ?? '',
    price: listing.price === null ? '' : String(listing.price),
    description: listing.description ?? '',
  };
}

interface ClaimListingCardProps {
  readonly listing: RadarClaimListing;
  readonly brouillon: ClaimListingDraft;
  readonly onChange: (brouillon: ClaimListingDraft) => void;
  readonly disabled?: boolean;
}

/**
 * TCK-2390 — une annonce que l'annonceur retient ou décoche, et corrige au besoin (titre, prix,
 * description). Les valeurs viennent de l'API telles quelles ; un numéro qu'un texte portait y
 * arrive déjà masqué (`[TELEPHONE]`).
 */
export function ClaimListingCard({ listing, brouillon, onChange, disabled = false }: ClaimListingCardProps) {
  const t = useTranslations('radarClaim');
  const tTypes = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tContrats = useTranslations(PROPERTY_ENUM_NAMESPACES.contractType);
  const tPeriodes = useTranslations(PROPERTY_ENUM_NAMESPACES.rentPeriod);
  const locale = useLocale() as Locale;
  const id = useId();
  const [correction, setCorrection] = useState(false);

  const titre = brouillon.title.trim() || t('untitled');
  const prix = Number(brouillon.price);
  const prixAffiche =
    brouillon.price.trim() !== '' && Number.isFinite(prix) && prix > 0
      ? formatCurrency(prix, locale)
      : t('priceOnRequest');
  const periode = listing.rent_period && tPeriodes.has(listing.rent_period) ? tPeriodes(listing.rent_period) : null;
  const details = [
    listing.property_type && tTypes.has(listing.property_type) ? tTypes(listing.property_type) : null,
    listing.contract && tContrats.has(listing.contract) ? tContrats(listing.contract) : null,
    listing.bedrooms ? t('bedrooms', { count: listing.bedrooms }) : null,
    listing.bathrooms ? t('bathrooms', { count: listing.bathrooms }) : null,
    listing.surface_m2 ? t('surface', { surface: listing.surface_m2 }) : null,
    listing.furnished ? t('furnished') : null,
  ].filter((d): d is string => d !== null);

  return (
    <li
      className={`rounded-xl border bg-card p-4 transition-colors ${brouillon.retenue ? 'border-border' : 'border-dashed border-border'}`}
      data-testid="claim-listing"
    >
      <div className="flex gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-muted">
          {listing.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL signée de l'original privé (quelques minutes) : rien à optimiser ni à mettre en cache.
            <img
              src={listing.photo_url}
              alt=""
              loading="lazy"
              decoding="async"
              className={`size-full object-cover outline -outline-offset-1 outline-foreground/10 ${brouillon.retenue ? '' : 'opacity-50'}`}
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
              <ImageIcon className="size-6" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            id={`${id}-titre`}
            className={`bg-card font-display text-base font-semibold break-words text-pretty ${brouillon.retenue ? 'text-foreground' : 'text-muted-foreground'}`}
          >
            {titre}
          </h3>
          <p className="font-semibold tabular-nums text-foreground">
            {periode && prixAffiche !== t('priceOnRequest') ? t('perPeriod', { price: prixAffiche, period: periode }) : prixAffiche}
          </p>
          {listing.neighborhood ? <p className="bg-card text-sm text-muted-foreground">{listing.neighborhood}</p> : null}
          {details.length > 0 ? <p className="bg-card text-sm text-muted-foreground">{details.join(' · ')}</p> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-foreground">
          <input
            type="checkbox"
            checked={brouillon.retenue}
            disabled={disabled}
            onChange={(e) => onChange({ ...brouillon, retenue: e.target.checked })}
            aria-describedby={`${id}-titre`}
            className="size-5 shrink-0 cursor-pointer rounded border-input accent-primary"
          />
          {t('keep')}
        </label>
        {brouillon.retenue ? (
          <button
            type="button"
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
            aria-expanded={correction}
            aria-controls={`${id}-correction`}
            onClick={() => setCorrection((c) => !c)}
          >
            {correction ? t('editDone') : t('edit')}
          </button>
        ) : null}
      </div>

      {brouillon.retenue && correction ? (
        <div id={`${id}-correction`} className="mt-3 space-y-4 border-t border-border pt-4">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-title`} className="block text-sm font-medium">
              {t('fieldTitle')}
            </label>
            <Input
              id={`${id}-title`}
              value={brouillon.title}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => onChange({ ...brouillon, title: e.target.value })}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-price`} className="block text-sm font-medium">
              {t('fieldPrice')}
            </label>
            <Input
              id={`${id}-price`}
              value={brouillon.price}
              inputMode="numeric"
              disabled={disabled}
              onChange={(e) => onChange({ ...brouillon, price: e.target.value.replace(/\D/g, '').slice(0, 12) })}
              className="h-11 tabular-nums"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-description`} className="block text-sm font-medium">
              {t('fieldDescription')}
            </label>
            <Textarea
              id={`${id}-description`}
              value={brouillon.description}
              rows={5}
              maxLength={20000}
              disabled={disabled}
              onChange={(e) => onChange({ ...brouillon, description: e.target.value })}
            />
            <p className="bg-card text-xs text-muted-foreground text-pretty">{t('phoneHint')}</p>
          </div>
        </div>
      ) : null}
    </li>
  );
}
