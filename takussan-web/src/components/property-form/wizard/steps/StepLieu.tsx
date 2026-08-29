'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Crosshair } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { FormInput } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
import { cn } from '@/lib/utils';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { useGeoSuggestion } from '@/hooks/useGeoSuggestion';
import { GeoSuggestionChip } from '../GeoSuggestionChip';

/** Durée du flash de `globals.css` (750 ms) plus une marge : on retire la classe APRÈS l'animation. */
const DUREE_FLASH_MS = 800;

/**
 * TCK-464 — l'étape du lieu : la suggestion se propose, l'adresse fine se replie, la carte
 * arbitre.
 *
 * Trois niveaux de certitude cohabitent ici, et l'étape les traite différemment :
 * la SUGGESTION (ville, région — géo-IP, souvent fausse) s'accepte d'un geste ; la POSITION DE
 * L'APPAREIL est proposée en un bouton, bien plus précise dès qu'on se trouve dans le bien ; et
 * la CARTE reste l'arbitre final, au doigt.
 */
export function StepLieu({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const { control, watch, setValue } = form;
  const { suggestion } = useGeoSuggestion();
  const [suggestionUtilisee, setSuggestionUtilisee] = useState(false);
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  // ⚠ On retient QUELS champs la suggestion a remplis, pas seulement qu'elle a été acceptée.
  // L'AC6 demande que « les champs remplis soient distinguables » : faire flasher la région alors
  // que la géo-IP ne la connaissait pas signalerait une écriture qui n'a pas eu lieu.
  const [champsRemplis, setChampsRemplis] = useState<readonly ('city' | 'region')[]>([]);

  const minuterie = useRef<number | null>(null);
  useEffect(() => () => {
    if (minuterie.current !== null) window.clearTimeout(minuterie.current);
  }, []);

  const lat = watch('latitude') as number | null | undefined;
  const lng = watch('longitude') as number | null | undefined;

  const accepterSuggestion = () => {
    if (!suggestion) return;
    setValue('city', suggestion.city, { shouldDirty: true, shouldValidate: true });
    const remplis: ('city' | 'region')[] = ['city'];
    // La région n'est écrite que si la géo-IP la connaît : `useGeoSuggestion` rend `''` sinon, et
    // poser une chaîne vide effacerait une correction déjà saisie.
    if (suggestion.region) {
      setValue('region', suggestion.region, { shouldDirty: true });
      remplis.push('region');
    }
    setSuggestionUtilisee(true);
    setChampsRemplis(remplis);
    minuterie.current = window.setTimeout(() => setChampsRemplis([]), DUREE_FLASH_MS);
  };

  // La position de l'APPAREIL, bien plus précise que l'IP — et c'est le geste naturel quand on
  // se trouve dans le bien. Silencieux en cas de refus : l'utilisateur a déjà répondu « non ».
  const utiliserMaPosition = () => {
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setValue('latitude', pos.coords.latitude, { shouldDirty: true });
      setValue('longitude', pos.coords.longitude, { shouldDirty: true });
    });
  };

  return (
    <>
      {suggestion ? (
        <GeoSuggestionChip
          city={suggestion.city}
          region={suggestion.region}
          onAccept={accepterSuggestion}
          hidden={suggestionUtilisee}
        />
      ) : null}

      <FormInput
        control={control}
        name="city"
        label={t('fields.city')}
        required
        placeholder={t('placeholders.city')}
        containerClassName={champsRemplis.includes('city') ? cn('wizard-flash', 'rounded-lg') : undefined}
      />
      <FormInput
        control={control}
        name="quarter"
        label={t('fields.quarter')}
        placeholder={t('placeholders.quarter')}
      />
      <FormInput
        control={control}
        name="region"
        label={t('fields.region')}
        placeholder={t('placeholders.region')}
        containerClassName={champsRemplis.includes('region') ? cn('wizard-flash', 'rounded-lg') : undefined}
      />

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => setDetailsOuverts((o) => !o)}
          aria-expanded={detailsOuverts}
          aria-controls="wizard-details-adresse"
        >
          {detailsOuverts ? t('addressDetailsHide') : t('addressDetailsShow')}
        </Button>
        {/*
          `grid-template-rows: 0fr → 1fr` : le bloc se DÉPLIE en hauteur. Un `display:none` le
          ferait surgir sous le doigt — et c'est précisément ce qui fait rater une cible.

          ⚠ Replié, le bloc reste dans le DOM pour que la transition existe : il faut donc le
          retirer À LA FOIS de l'arbre d'accessibilité (`aria-hidden`) et du parcours clavier
          (`inert`). `aria-hidden` seul laisserait trois champs invisibles atteignables au
          tabulateur — et `aria-hidden` sur un élément focusable est en soi une violation.
        */}
        <div
          id="wizard-details-adresse"
          data-testid="details-adresse"
          aria-hidden={!detailsOuverts}
          inert={!detailsOuverts}
          className="grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ gridTemplateRows: detailsOuverts ? '1fr' : '0fr', opacity: detailsOuverts ? 1 : 0 }}
        >
          <div className="overflow-hidden">
            <div className="space-y-5 pt-3">
              <FormInput
                control={control}
                name="street"
                label={t('fields.street')}
                placeholder={t('placeholders.street')}
              />
              <FormInput
                control={control}
                name="postal_code"
                label={t('fields.postalCode')}
                placeholder={t('placeholders.postalCode')}
              />
              <FormInput
                control={control}
                name="country"
                label={t('fields.country')}
                placeholder={t('placeholders.country')}
                maxLength={2}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 w-full"
          onClick={utiliserMaPosition}
        >
          <Crosshair aria-hidden="true" />
          {t('useMyPosition')}
        </Button>
        <LocationPickerMapLoader
          lat={lat}
          lng={lng}
          onChange={(nLat, nLng) => {
            setValue('latitude', nLat, { shouldDirty: true });
            setValue('longitude', nLng, { shouldDirty: true });
          }}
        />
        <p className="text-xs text-muted-foreground">{t('mapHint')}</p>
      </div>
    </>
  );
}
