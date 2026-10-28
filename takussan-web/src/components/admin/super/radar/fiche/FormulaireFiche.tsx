'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RADAR_PROPERTY_TYPES, type RadarExtracted, type RadarListingDetail } from '@/types/radar';
import { ChampFiche } from './ChampFiche';
import type { SurPassage } from './passage';
import { ChampQuartier } from './ChampQuartier';
import { ChampChoix, ChampListe, ChampNombre } from './controles';
import { PanneauNature } from './PanneauNature';
import { RadarDroppedPhones } from './RadarDroppedPhones';
import { useMessageEchecFiche } from './useMessageEchecFiche';
import type { CleCorrigeable, CorrectionsFiche } from './useCorrectionsFiche';

const CONTRATS = ['rent', 'sale'] as const;
const PERIODES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

interface FormulaireFicheProps {
  readonly detail: RadarListingDetail;
  readonly corrections: CorrectionsFiche;
  readonly surPassage: SurPassage;
  /** La barre des trois gestes (valider, doublon, écarter) : elle partage la barre d'actions collante. */
  readonly gestes: ReactNode;
  /** L'échec d'un geste : affiché avec celui de l'enregistrement. */
  readonly erreurGeste?: unknown;
}

/**
 * TCK-2387 (ADR-0077 §5) — la fiche lue, champ par champ, corrigeable tant qu'elle est `extracted`.
 *
 * Les corrections s'accumulent localement ({@link CorrectionsFiche}) et partent ensemble par
 * « Enregistrer » — les seuls champs modifiés. Un refus se lit par son code (409 d'étape, 422), jamais
 * par une phrase de l'API.
 */
export function FormulaireFiche({ detail, corrections, surPassage, gestes, erreurGeste }: FormulaireFicheProps) {
  const t = useTranslations('superAdmin.pages.radar.listing');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const tTypes = useTranslations('property.types');
  const messageDEchec = useMessageEchecFiche();

  const extracted: RadarExtracted = detail.extracted ?? {};
  const editable = detail.stage === 'extracted';
  const desactive = !editable || corrections.enCours;
  const texteSource = detail.raw_text;

  const champ = (
    cle: CleCorrigeable & keyof RadarExtracted,
    contenu: Parameters<typeof ChampFiche>[0]['children'],
    aide?: React.ReactNode,
  ) => (
    <ChampFiche
      nom={cle}
      libelle={t(`fields.${cle}`)}
      champ={extracted[cle] as Parameters<typeof ChampFiche>[0]['champ']}
      modifie={corrections.modifie(cle)}
      texteSource={texteSource}
      surPassage={surPassage}
      aide={aide}
    >
      {contenu}
    </ChampFiche>
  );

  const texte = (cle: 'title' | 'city') => champ(cle, ({ id, decritPar }) => (
    <Input
      id={id}
      aria-describedby={decritPar}
      disabled={desactive}
      value={(corrections.valeur(cle) as string | null) ?? ''}
      onChange={(event) => corrections.corriger(cle, event.target.value === '' ? null : event.target.value)}
    />
  ));

  const nombre = (cle: 'bedrooms' | 'bathrooms' | 'surface_m2' | 'price', aide?: React.ReactNode, pas = 1, min = 0) =>
    champ(cle, ({ id, decritPar }) => (
      <ChampNombre
        key={corrections.reprise}
        id={id}
        decritPar={decritPar}
        desactive={desactive}
        pas={pas}
        min={min}
        valeur={corrections.valeur(cle) as number | null}
        onChange={(valeur) => corrections.corriger(cle, valeur)}
      />
    ), aide);

  const choix = (cle: 'property_type' | 'contract' | 'rent_period', options: readonly { value: string; label: string }[]) =>
    champ(cle, ({ id, decritPar }) => (
      <ChampChoix
        id={id}
        decritPar={decritPar}
        desactive={desactive}
        valeur={corrections.valeur(cle) as string | null}
        options={options}
        onChange={(valeur) => corrections.corriger(cle, valeur)}
      />
    ));

  const prixLu = extracted.price?.raw;

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void corrections.enregistrer();
      }}
      data-testid="radar-fiche-form"
    >
      {!editable ? (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="radar-fiche-lecture-seule">
          {t('readOnly', { stage: tRadar(`stages.${detail.stage}`) })}
        </p>
      ) : null}

      <fieldset className="space-y-3" disabled={!editable}>
        <legend className="mb-2 font-display text-base font-semibold text-foreground">{t('sections.listing')}</legend>
        {texte('title')}
        {champ('description', ({ id, decritPar }) => (
          <Textarea
            id={id}
            aria-describedby={decritPar}
            disabled={desactive}
            rows={5}
            value={(corrections.valeur('description') as string | null) ?? ''}
            onChange={(event) => corrections.corriger('description', event.target.value === '' ? null : event.target.value)}
          />
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          {choix('property_type', RADAR_PROPERTY_TYPES.map((v) => ({ value: v, label: tTypes(v) })))}
          {choix('contract', CONTRATS.map((v) => ({ value: v, label: t(`options.contracts.${v}`) })))}
          {nombre('price', prixLu ? t('hints.priceRead', { raw: prixLu }) : undefined, 1, 1)}
          {choix('rent_period', PERIODES.map((v) => ({ value: v, label: tRadar(`periods.${v}`) })))}
          {nombre('bedrooms')}
          {nombre('bathrooms')}
          {nombre('surface_m2', undefined, 0.5)}
          {champ('furnished', ({ id, decritPar }) => {
            const valeur = corrections.valeur('furnished') as boolean | null;
            return (
              <ChampChoix
                id={id}
                decritPar={decritPar}
                desactive={desactive}
                valeur={valeur === null ? null : String(valeur)}
                options={[{ value: 'true', label: t('options.furnished.yes') }, { value: 'false', label: t('options.furnished.no') }]}
                onChange={(suivante) => corrections.corriger('furnished', suivante === null ? null : suivante === 'true')}
              />
            );
          })}
        </div>
        {champ('amenities', ({ id, decritPar }) => (
          <ChampListe
            key={corrections.reprise}
            id={id}
            decritPar={decritPar}
            desactive={desactive}
            valeur={corrections.valeur('amenities') as readonly string[] | null}
            onChange={(valeur) => corrections.corriger('amenities', valeur)}
          />
        ), t('hints.amenities'))}
      </fieldset>

      <fieldset className="space-y-3" disabled={!editable}>
        <legend className="mb-2 font-display text-base font-semibold text-foreground">{t('sections.place')}</legend>
        {texte('city')}
        <ChampQuartier
          detail={detail}
          choisi={corrections.valeur('neighborhood_id') as number | null}
          modifie={corrections.modifie('neighborhood_id')}
          desactive={desactive}
          onChoisir={(id) => corrections.corriger('neighborhood_id', id)}
          surPassage={surPassage}
        />
      </fieldset>

      <fieldset className="space-y-3" disabled={!editable}>
        <legend className="mb-2 font-display text-base font-semibold text-foreground">{t('sections.advertiser')}</legend>
        <PanneauNature detail={detail} corrections={corrections} desactive={desactive} surPassage={surPassage} />
      </fieldset>
      {/* Hors du `fieldset` : rattacher un annonceur reste permis sur une fiche relue, que le fieldset désactive. */}
      <RadarDroppedPhones detail={detail} corrections={corrections} />

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-card px-1 py-3" data-testid="radar-fiche-actions">
        {editable ? (
          <>
            <Button type="submit" disabled={corrections.nombre === 0 || corrections.enCours}>
              {corrections.enCours ? t('actions.saving') : t('actions.save')}
            </Button>
            {corrections.nombre > 0 ? (
              <>
                <Button type="button" variant="ghost" disabled={corrections.enCours} onClick={corrections.abandonner}>
                  {t('actions.discard')}
                </Button>
                <span className="text-sm text-muted-foreground">{t('actions.dirty', { count: corrections.nombre })}</span>
              </>
            ) : null}
          </>
        ) : null}
        {gestes}
        {corrections.erreur || erreurGeste ? (
          <p role="alert" className="basis-full text-sm text-destructive">
            {corrections.erreur ? messageDEchec(corrections.erreur) : messageDEchec(erreurGeste, t('errors.gestureFailed'))}
          </p>
        ) : null}
        {corrections.enregistre && corrections.nombre === 0 && !erreurGeste ? (
          <p role="status" className="basis-full text-sm text-muted-foreground">{t('actions.saved')}</p>
        ) : null}
      </div>
    </form>
  );
}
