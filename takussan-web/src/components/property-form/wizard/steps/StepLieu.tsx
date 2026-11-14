'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Crosshair, Loader2 } from 'lucide-react';
import { useFormState, type UseFormReturn } from 'react-hook-form';

import { FormInput } from '@/components/forms';
import { Button } from '@/components/ui/button';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { cn } from '@/lib/utils';
import { useGeoSuggestion } from '@/hooks/useGeoSuggestion';
import { ChampsLieu } from '../../ChampsLieu';
import { ChampsPosition } from '../../ChampsPosition';
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
  refus = 0,
  geolocalisation,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /**
   * TCK-574 — le nombre de « Continuer » refusés, compté par l'assistant. Chaque nouveau refus
   * redéplie le détail d'adresse s'il porte une erreur.
   */
  readonly refus?: number;
  /**
   * Injectable pour les tests — jamais en production. `navigator.geolocation` n'existe pas dans
   * jsdom, et le stubber globalement fuirait d'un test à l'autre. Même contrat que sur
   * `AutourDeMoi`.
   */
  readonly geolocalisation?: Pick<Geolocation, 'getCurrentPosition'>;
}) {
  const t = useTranslations('property.wizard');
  const { control, setValue } = form;
  const { suggestion } = useGeoSuggestion();
  const [suggestionUtilisee, setSuggestionUtilisee] = useState(false);
  const [detailsOuverts, setDetailsOuverts] = useState(false);

  // Une erreur posée dans le détail d'adresse REPLIÉ ne se voyait pas : « Continuer » ne faisait
  // rien, sans rien dire (revue adverse v2 — un code pays d'un caractère, ou un brouillon repris
  // à `street: null`). La section se déplie quand une erreur y APPARAÎT — ajustement d'état
  // décidé pendant le rendu, même patron que la reprise de brouillon de `PropertyWizard` —, et
  // l'utilisateur garde la main pour la replier ensuite.
  const { errors } = useFormState({ control, name: ['street', 'postal_code', 'country'] });
  const erreurDansLesDetails = Boolean(errors.street || errors.postal_code || errors.country);
  const [erreurVue, setErreurVue] = useState(false);
  if (erreurDansLesDetails !== erreurVue) {
    setErreurVue(erreurDansLesDetails);
    if (erreurDansLesDetails) setDetailsOuverts(true);
  }
  // TCK-574 — …et à CHAQUE refus de « Continuer ». Replié à la main après avoir vu l'erreur, le
  // détail la cachait de nouveau : l'erreur étant déjà posée, rien n'« apparaissait », et
  // « Continuer » ne faisait plus rien, sans rien dire.
  const [refusVu, setRefusVu] = useState(refus);
  if (refus !== refusVu) {
    setRefusVu(refus);
    if (erreurDansLesDetails) setDetailsOuverts(true);
  }
  const [etatPosition, setEtatPosition] = useState<EtatPosition>('repos');
  // ⚠ On retient QUELS champs la suggestion a remplis, pas seulement qu'elle a été acceptée.
  // L'AC6 demande que « les champs remplis soient distinguables » : faire flasher la région alors
  // que la géo-IP ne la connaissait pas signalerait une écriture qui n'a pas eu lieu.
  const [champsRemplis, setChampsRemplis] = useState<readonly ('city' | 'region')[]>([]);

  const minuterie = useRef<number | null>(null);
  useEffect(() => () => {
    if (minuterie.current !== null) window.clearTimeout(minuterie.current);
  }, []);

  const accepterSuggestion = () => {
    if (!suggestion) return;
    setValue('city', suggestion.city, { shouldDirty: true, shouldValidate: true });
    // TCK-633 — le texte change : l'identifiant de l'ancien choix ne le décrit plus. `ChampsLieu`
    // rapproche le nouveau texte du référentiel s'il y nomme une ville.
    setValue('geo_city_id', null, { shouldDirty: true });
    setValue('geo_neighborhood_id', null, { shouldDirty: true });
    const remplis: ('city' | 'region')[] = ['city'];
    // La région n'est écrite que si la géo-IP la connaît : `useGeoSuggestion` rend `''` sinon, et
    // poser une chaîne vide effacerait une correction déjà saisie.
    if (suggestion.region) {
      setValue('region', suggestion.region, { shouldDirty: true });
      setValue('geo_region_id', null, { shouldDirty: true });
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

  // TCK-2819 (lot 2) — maquette a-1 : la suggestion en pastille, région / ville / quartier en grille
  // (deux colonnes au bureau, le quartier sur toute la ligne), la rue dans un encadré repliable, puis
  // « Sur la carte » et ses gestes en pastilles. `ChampsLieu` et `ChampsPosition` restent ceux de la
  // page d'édition : seule leur mise en page change ici.
  return (
    <>
      <div className="space-y-5">
        {suggestion ? (
          <GeoSuggestionChip
            city={suggestion.city}
            region={suggestion.region}
            onAccept={accepterSuggestion}
            hidden={suggestionUtilisee}
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2 lg:[&>*:nth-child(3)]:col-span-2">
          <ChampsLieu form={form} flash={champsRemplis} />
        </div>

        <section className="rounded-xl border border-border bg-card">
          <button
            type="button"
            className="flex min-h-12 w-full items-center gap-2 rounded-xl px-4 text-left focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() => setDetailsOuverts((o) => !o)}
            aria-expanded={detailsOuverts}
            aria-controls="wizard-details-adresse"
            aria-label={detailsOuverts ? t('addressDetailsHide') : t('addressDetailsShow')}
          >
            <span className="min-w-0 flex-1 text-corps font-medium text-foreground">{t('addressDetailsTitle')}</span>
            <span className="text-ui text-muted-foreground">
              {detailsOuverts ? t('addressDetailsToggleHide') : t('addressDetailsToggleShow')}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 flex-none text-muted-foreground transition-transform', detailsOuverts && 'rotate-180')}
            />
          </button>
          <WizardCollapsibleSection
            open={detailsOuverts}
            id="wizard-details-adresse"
            testId="details-adresse"
          >
            <div className="grid grid-cols-2 gap-4 border-t border-border p-4 lg:grid-cols-[minmax(0,1fr)_8.75rem_8.75rem]">
              <div className="col-span-2 lg:col-span-1">
                <FormInput
                  control={control}
                  name="street"
                  label={t('fields.street')}
                  placeholder={t('placeholders.street')}
                />
              </div>
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
        </section>
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-corps font-semibold text-foreground">{t('mapTitle')}</h2>
          <p className="mt-1 text-ui leading-snug text-muted-foreground">{t('mapIntro')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="min-h-11 w-full rounded-full"
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
        <ChampsPosition form={form} indiceCarte={t('mapHint')} presentation="assistant" />
      </div>
    </>
  );
}
