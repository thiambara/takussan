'use client';

import { useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useWatch, type UseFormReturn } from 'react-hook-form';
import { MapPin } from 'lucide-react';

import { FormError } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
import { horsDuSenegal, reconnaitrePosition, type Coordonnees } from '@/lib/geo/reconnaitre-position';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { useReferentielGeo, useResolutionDeLien } from './useReferentielGeo';

type Identifiant = number | null | undefined;
type Retour = { readonly ton: 'info' | 'alerte'; readonly texte: string } | null;

/** Une saisie numérique vidée part en `null` : `z.coerce.number()` lirait `''` comme 0 — l'océan. */
function nombreOuNul(brut: string): number | string | null {
  if (brut.trim() === '') return null;
  const n = Number(brut.replace(',', '.'));
  return Number.isFinite(n) ? n : brut;
}

/**
 * TCK-633 (AC9) — la position : le champ « Collez un lien ou une position », la latitude et la
 * longitude visibles et modifiables, et la carte, recentrée sur la ville choisie.
 *
 * Ce qui se colle (`reconnaitrePosition`, tâche 16) : un lien Google Maps long, un lien court —
 * suivi par le serveur (`POST /api/geo/resolve-link`), le navigateur ne le peut pas —, une
 * position WhatsApp, des degrés décimaux ou sexagésimaux, un Plus Code complet, ou court — lu à
 * partir du centre de la ville choisie, d'où le message qui demande la ville d'abord.
 *
 * Une position hors du Sénégal est PLACÉE puis signalée, jamais refusée : latitude et longitude
 * inversées sont l'erreur la plus courante, et la voir sur la carte est la façon de la corriger.
 */
export function ChampsPosition({
  form,
  indiceCarte,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /** La consigne affichée sous la carte — propre à chaque écran. */
  readonly indiceCarte: string;
}) {
  const t = useTranslations('property.form.address');
  const { control, setValue } = form;
  const [regionIdSuivi, villeIdSuivi, latSuivie, lngSuivie] = useWatch({
    control,
    name: ['geo_region_id', 'geo_city_id', 'latitude', 'longitude'],
  });
  const villeId = (villeIdSuivi as Identifiant) ?? null;
  const lat = latSuivie as number | null | undefined;
  const lng = lngSuivie as number | null | undefined;
  // Mêmes clés de requête que `ChampsLieu` : aucune requête de plus, le cache est partagé.
  const { villes } = useReferentielGeo((regionIdSuivi as Identifiant) ?? null, villeId);
  const ville = villes.find((v) => v.id === villeId);
  const centre: Coordonnees | null =
    ville && ville.latitude !== null && ville.longitude !== null
      ? { latitude: ville.latitude, longitude: ville.longitude }
      : null;

  const [collage, setCollage] = useState('');
  const [retour, setRetour] = useState<Retour>(null);
  const resolution = useResolutionDeLien();

  const placer = (c: Coordonnees, hors: boolean) => {
    setValue('latitude', c.latitude, { shouldDirty: true, shouldValidate: true });
    setValue('longitude', c.longitude, { shouldDirty: true, shouldValidate: true });
    setRetour(hors ? { ton: 'alerte', texte: t('pasteOutsideSenegal') } : { ton: 'info', texte: t('pasteApplied') });
  };

  const lire = (brut: string) => {
    const saisie = brut.trim();
    if (saisie === '') return;
    const lu = reconnaitrePosition(saisie, centre);
    switch (lu.kind) {
      case 'coordonnees':
        placer(lu, horsDuSenegal(lu));
        return;
      case 'lien-a-resoudre':
        setRetour({ ton: 'info', texte: t('pasteResolving') });
        resolution.mutate(
          { url: lu.url },
          {
            onSuccess: ({ data }) => placer(data, data.outside_senegal),
            onError: () => setRetour({ ton: 'alerte', texte: t('pasteLinkFailed') }),
          },
        );
        return;
      case 'plus-code-court-sans-reference':
        setRetour({ ton: 'alerte', texte: t('pasteNeedsCity') });
        return;
      default:
        setRetour({ ton: 'alerte', texte: t('pasteUnknown') });
    }
  };

  const surCollage = (e: ClipboardEvent<HTMLInputElement>) => {
    const texte = e.clipboardData.getData('text');
    if (texte.trim() === '') return;
    e.preventDefault();
    setCollage(texte);
    lire(texte);
  };

  // Entrée lit le champ — et ne soumet PAS le formulaire qui l'entoure.
  const surTouche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    lire(collage);
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="champ-collage" className="mb-1.5 block text-sm font-medium">
          {t('pasteLabel')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="champ-collage"
            value={collage}
            onChange={(e) => setCollage(e.target.value)}
            onPaste={surCollage}
            onKeyDown={surTouche}
            placeholder={t('pastePlaceholder')}
            autoComplete="off"
            aria-describedby={retour ? 'champ-collage-retour' : undefined}
            className="h-11 min-h-11"
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0"
            onClick={() => lire(collage)}
            disabled={resolution.isPending}
          >
            <MapPin aria-hidden="true" />
            {t('pasteButton')}
          </Button>
        </div>
        {retour ? (
          <p
            id="champ-collage-retour"
            role={retour.ton === 'alerte' ? 'alert' : 'status'}
            className={retour.ton === 'alerte' ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}
          >
            {retour.texte}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {(['latitude', 'longitude'] as const).map((nom) => (
          <Controller
            key={nom}
            control={control}
            name={nom}
            render={({ field, fieldState }) => (
              <div>
                <label htmlFor={`champ-${nom}`} className="mb-1.5 block text-sm font-medium">
                  {t(nom)}
                </label>
                <Input
                  id={`champ-${nom}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  ref={field.ref}
                  name={field.name}
                  value={(field.value as number | string | null | undefined) ?? ''}
                  onChange={(e) => field.onChange(nombreOuNul(e.target.value))}
                  onBlur={field.onBlur}
                  aria-invalid={fieldState.error ? true : undefined}
                  aria-describedby={fieldState.error ? `champ-${nom}-error` : undefined}
                  className="h-11 min-h-11"
                />
                <FormError id={`champ-${nom}-error`}>{fieldState.error?.message}</FormError>
              </div>
            )}
          />
        ))}
      </div>

      <LocationPickerMapLoader
        lat={lat}
        lng={lng}
        centre={centre}
        onChange={(nLat, nLng) => {
          setValue('latitude', nLat, { shouldDirty: true });
          setValue('longitude', nLng, { shouldDirty: true });
        }}
      />
      <p className="text-xs text-muted-foreground">{indiceCarte}</p>
    </div>
  );
}
