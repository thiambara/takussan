'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Crosshair, Loader2 } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { FormInput } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { LocationPickerMapLoader } from '@/components/map/LocationPickerMapLoader';
import { cn } from '@/lib/utils';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { useGeoSuggestion } from '@/hooks/useGeoSuggestion';
import { GeoSuggestionChip } from '../GeoSuggestionChip';
import { WizardCollapsibleSection } from '../WizardCollapsibleSection';

/** Durée du flash de `globals.css` (750 ms) plus une marge : on retire la classe APRÈS l'animation. */
const DUREE_FLASH_MS = 800;

/** Ce que le composant sait dire de la dernière demande de position — même machine d'état que
 * `AutourDeMoi` (`src/components/search/AutourDeMoi.tsx`), le seul autre appelant de
 * `navigator.geolocation` du dépôt : le refus et la panne sont des ÉTATS rendus, pas des
 * exceptions rattrapées en silence. */
type EtatPosition = 'repos' | 'attente' | 'refuse' | 'indisponible' | 'echec';

/**
 * TCK-464 — l'étape du lieu : la suggestion se propose, l'adresse fine se replie, la carte
 * arbitre.
 *
 * Trois niveaux de certitude cohabitent ici, et l'étape les traite différemment :
 * la SUGGESTION (ville, région — géo-IP, souvent fausse) s'accepte d'un geste ; la POSITION DE
 * L'APPAREIL est proposée en un bouton, bien plus précise dès qu'on se trouve dans le bien ; et
 * la CARTE reste l'arbitre final, au doigt.
 */
export function StepLieu({
  form,
  geolocalisation,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /**
   * Injectable pour les tests — jamais en production. `navigator.geolocation` n'existe pas dans
   * jsdom, et le stubber globalement fuirait d'un test à l'autre. Même contrat que sur
   * `AutourDeMoi`.
   */
  readonly geolocalisation?: Pick<Geolocation, 'getCurrentPosition'>;
}) {
  const t = useTranslations('property.wizard');
  const { control, watch, setValue } = form;
  const { suggestion } = useGeoSuggestion();
  const [suggestionUtilisee, setSuggestionUtilisee] = useState(false);
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const [etatPosition, setEtatPosition] = useState<EtatPosition>('repos');
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
  // se trouve dans le bien. L'acquisition GPS prend couramment plusieurs secondes sur mobile : le
  // bouton se désactive et s'annonce occupé pendant l'attente (I-5), et le refus comme la panne
  // sont des ÉTATS rendus — jamais un bouton qui reste en attente pour toujours.
  const utiliserMaPosition = () => {
    const source =
      geolocalisation ?? (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);
    if (!source) {
      setEtatPosition('indisponible');
      return;
    }

    setEtatPosition('attente');
    source.getCurrentPosition(
      (pos) => {
        setEtatPosition('repos');
        setValue('latitude', pos.coords.latitude, { shouldDirty: true });
        setValue('longitude', pos.coords.longitude, { shouldDirty: true });
      },
      (erreur: GeolocationPositionError) => {
        // Un refus n'est PAS une panne : c'est une réponse, et elle se rend à l'écran.
        setEtatPosition(erreur?.code === 1 ? 'refuse' : 'echec');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const messagePosition =
    etatPosition === 'refuse' ? t('useMyPositionDenied')
    : etatPosition === 'indisponible' ? t('useMyPositionUnavailable')
    : etatPosition === 'echec' ? t('useMyPositionFailed')
    : null;

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
        <WizardCollapsibleSection
          open={detailsOuverts}
          id="wizard-details-adresse"
          testId="details-adresse"
        >
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
        </WizardCollapsibleSection>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 w-full"
          data-testid="bouton-position"
          onClick={utiliserMaPosition}
          disabled={etatPosition === 'attente'}
        >
          {etatPosition === 'attente' ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Crosshair aria-hidden="true" />
          )}
          {etatPosition === 'attente' ? t('useMyPositionLoading') : t('useMyPosition')}
        </Button>
        {messagePosition ? (
          <p role="alert" className="text-xs text-destructive">
            {messagePosition}
          </p>
        ) : null}
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
