'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2, Pin, X } from 'lucide-react';

import { iconeDuType } from '@/components/home/icones-de-categorie';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { WarningBanner } from '@/components/ui/warning-banner';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { ApiError } from '@/lib/api';
import { createRadarTarget, radarKeys, updateRadarTarget } from '@/lib/queries/radar';
import { cn } from '@/lib/utils';
import {
  RADAR_PROPERTY_TYPES,
  RADAR_SOURCE_SITES,
  RADAR_TARGET_BEDROOMS_MAX,
  RADAR_TARGET_MAX_AGE_DAYS,
  RADAR_TARGET_NAME_MAX,
  type RadarContract,
  type RadarTarget,
  type RadarTargetChanges,
  type RadarTargetResponse,
} from '@/types/radar';
import { ChoixDesLieux } from './ChoixDesLieux';
import {
  BROUILLON_VIDE,
  brouillonDe,
  criteresDe,
  memesCriteres,
  morceauxDuResume,
  SEPARATEUR_DU_RESUME,
  type BrouillonCriteres,
} from './criteres';
import { codeDuRefus, useMessageRefusCible } from './useMessageRefusCible';

/**
 * L'ordre des types : celui des filtres de la recherche publique (`FilterSidebar`, TCK-633), qui met en tête ce que
 * le marché dakarois cherche. Les seize valeurs de `PropertyType`, sans exception.
 */
const TYPES_DANS_L_ORDRE = [
  'apartment', 'house', 'villa', 'studio', 'room', 'land', 'office', 'shop',
  'warehouse', 'hotel', 'resort', 'garage', 'parking', 'farm', 'factory', 'other',
] as const satisfies readonly (typeof RADAR_PROPERTY_TYPES)[number][];

interface SegmentsProps<T extends string> {
  readonly legende: string;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly valeur: T;
  readonly onChange: (valeur: T) => void;
  readonly desactive?: boolean;
}

/** Un choix court et exclusif, en contrôle segmenté — la forme des filtres publics (transaction, meublé). */
function Segments<T extends string>({ legende, options, valeur, onChange, desactive = false }: SegmentsProps<T>) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-foreground">{legende}</legend>
      <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-lg bg-muted p-1">
        {options.map((option) => {
          const actif = option.value === valeur;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={actif}
              disabled={desactive}
              onClick={() => onChange(option.value)}
              className={cn(
                'min-h-8 rounded-md px-2 text-sm font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
                actif ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Section({ titre, children }: { readonly titre: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{titre}</h3>
      {children}
    </section>
  );
}

interface ChampNombreProps {
  readonly id: string;
  readonly libelle: string;
  readonly valeur: string;
  readonly onChange: (valeur: string) => void;
  readonly min?: number;
  readonly max?: number;
  readonly placeholder?: string;
  readonly desactive?: boolean;
}

function ChampNombre({ id, libelle, valeur, onChange, min = 0, max, placeholder, desactive }: ChampNombreProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{libelle}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={valeur}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={desactive}
        className="tabular-nums"
      />
    </div>
  );
}

interface PanneauCibleProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Absente : une création. Présente : le réglage de cette cible (jamais `retired` : l'appelant ne l'ouvre pas). */
  readonly cible?: RadarTarget;
  /** Appelé avec la cible que l'API vient de rendre. */
  readonly onEnregistree?: (cible: RadarTarget) => void;
}

/**
 * TCK-2469 (ADR-0087 §5) — créer ou régler une cible, dans un panneau. Les critères se choisissent comme dans les
 * filtres de la recherche publique (types en tuiles, transaction et meublé en segments, lieux du référentiel), et le
 * résumé se lit en direct au pied du panneau. Le formulaire ne juge rien : un refus de l'API (`radar.targets.*`) se lit
 * par son code, champ et borne nommés.
 *
 * Une cible de la demande dont on modifie les CRITÈRES devient épinglée (l'API le fait) : le panneau le dit avant.
 * Seuls le nom et les critères qui ont changé partent (`PATCH`).
 */
export function PanneauCible({ open, onOpenChange, cible, onEnregistree }: PanneauCibleProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md border-l border-border sm:max-w-xl" data-testid="radar-cible-panneau">
        {/* Remonté à chaque ouverture : le brouillon repart de la cible enregistrée, jamais d'une saisie abandonnée. */}
        {open ? <FormulaireCible cible={cible} onFermer={() => onOpenChange(false)} onEnregistree={onEnregistree} /> : null}
      </SheetContent>
    </Sheet>
  );
}

interface FormulaireCibleProps {
  readonly cible?: RadarTarget;
  readonly onFermer: () => void;
  readonly onEnregistree?: (cible: RadarTarget) => void;
}

function FormulaireCible({ cible, onFermer, onEnregistree }: FormulaireCibleProps) {
  const t = useTranslations('superAdmin.pages.radar.targets');
  const tTypes = useTranslations('property.types');
  const tSites = useTranslations('superAdmin.pages.radar.sites');
  const fmt = useFormatteurs();
  const queryClient = useQueryClient();
  const messageRefus = useMessageRefusCible();
  const id = useId();

  const [nom, setNom] = useState(cible?.name ?? '');
  const [brouillon, setBrouillon] = useState<BrouillonCriteres>(cible ? brouillonDe(cible.criteria) : BROUILLON_VIDE);
  const [enPause, setEnPause] = useState(false);
  const regler = (changes: Partial<BrouillonCriteres>) => setBrouillon((avant) => ({ ...avant, ...changes }));

  const criteres = criteresDe(brouillon);
  const resume = morceauxDuResume(criteres, { t, tTypes, tSites, fmt });
  const criteresModifies = cible ? !memesCriteres(criteres, cible.criteria) : true;
  const epinglera = cible?.origin === 'demand' && !cible.pinned && criteresModifies;

  const enregistrer = useMutation<RadarTargetResponse, ApiError, void>({
    mutationFn: () => {
      if (!cible) {
        return createRadarTarget({ name: nom.trim(), criteria: criteres, ...(enPause ? { status: 'paused' as const } : {}) });
      }
      const changes: RadarTargetChanges = {
        ...(nom.trim() !== cible.name ? { name: nom.trim() } : {}),
        ...(criteresModifies ? { criteria: criteres } : {}),
      };
      return updateRadarTarget(cible.id, changes);
    },
    onSuccess: (reponse) => {
      queryClient.setQueryData(radarKeys.target(reponse.data.id), reponse);
      void queryClient.invalidateQueries({ queryKey: radarKeys.targetLists() });
      onEnregistree?.(reponse.data);
      onFermer();
    },
  });

  const rienAEnvoyer = cible !== undefined && nom.trim() === cible.name && !criteresModifies;
  const pret = nom.trim() !== '' && !rienAEnvoyer && !enregistrer.isPending;

  const envoyer = (event: FormEvent) => {
    event.preventDefault();
    if (pret) enregistrer.mutate();
  };

  const refus = enregistrer.error;
  const doublon = codeDuRefus(refus) === 'radar.targets.duplicate' ? refus : null;
  const idDoublon = doublon ? Number((doublon.data as { params?: { target_id?: unknown } }).params?.target_id) : NaN;

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <SheetHeader className="min-w-0">
          <SheetTitle className="font-display text-lg tracking-tight">
            {cible ? t('form.editTitle', { name: cible.name }) : t('form.createTitle')}
          </SheetTitle>
          <SheetDescription>{t('form.description')}</SheetDescription>
        </SheetHeader>
        <Button type="button" variant="ghost" size="icon" onClick={onFermer} aria-label={t('form.close')}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <form onSubmit={envoyer} className="flex min-h-0 flex-1 flex-col" aria-describedby={`${id}-resume`}>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {epinglera ? (
            <WarningBanner icon={<Pin className="size-4" aria-hidden="true" />} data-testid="radar-cible-epinglera">
              {t('form.willPin')}
            </WarningBanner>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-nom`}>{t('form.name')}</Label>
            <Input
              id={`${id}-nom`}
              value={nom}
              maxLength={RADAR_TARGET_NAME_MAX}
              onChange={(event) => setNom(event.target.value)}
              placeholder={t('form.namePlaceholder')}
              required
              autoComplete="off"
            />
          </div>

          <Section titre={t('form.sections.what')}>
            <Segments<RadarContract | 'any'>
              legende={t('fields.contract')}
              options={[
                { value: 'any', label: t('form.any') },
                { value: 'rent', label: t('form.contract.rent') },
                { value: 'sale', label: t('form.contract.sale') },
              ]}
              valeur={brouillon.contract ?? 'any'}
              onChange={(valeur) => regler({ contract: valeur === 'any' ? null : valeur })}
            />
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">{t('fields.types')}</legend>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {TYPES_DANS_L_ORDRE.map((type) => {
                  const Icone = iconeDuType(type);
                  const actif = brouillon.types.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={actif}
                      onClick={() => regler({
                        types: actif ? brouillon.types.filter((v) => v !== type) : [...brouillon.types, type],
                      })}
                      className={cn(
                        'flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-sm font-medium transition-[background-color,border-color,color,scale] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        actif
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                      )}
                    >
                      <Icone className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="truncate">{tTypes(type)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </Section>

          <Section titre={t('form.sections.where')}>
            <ChoixDesLieux
              villes={brouillon.cities}
              quartiers={brouillon.neighborhoods}
              onVilles={(cities) => regler({ cities })}
              onQuartiers={(neighborhoods) => regler({ neighborhoods })}
            />
          </Section>

          <Section titre={t('form.sections.size')}>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">{t('form.price')}</legend>
              <div className="grid grid-cols-2 gap-2">
                <ChampNombre id={`${id}-prix-min`} libelle={t('form.min')} valeur={brouillon.priceMin} onChange={(priceMin) => regler({ priceMin })} />
                <ChampNombre id={`${id}-prix-max`} libelle={t('form.max')} valeur={brouillon.priceMax} onChange={(priceMax) => regler({ priceMax })} />
              </div>
              <p className="text-xs text-muted-foreground">{t('form.priceHint')}</p>
            </fieldset>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">{t('form.bedrooms')}</legend>
              <div className="grid grid-cols-2 gap-2">
                <ChampNombre id={`${id}-ch-min`} libelle={t('form.min')} valeur={brouillon.bedroomsMin} max={RADAR_TARGET_BEDROOMS_MAX} onChange={(bedroomsMin) => regler({ bedroomsMin })} />
                <ChampNombre id={`${id}-ch-max`} libelle={t('form.max')} valeur={brouillon.bedroomsMax} max={RADAR_TARGET_BEDROOMS_MAX} onChange={(bedroomsMax) => regler({ bedroomsMax })} />
              </div>
            </fieldset>
          </Section>

          <Section titre={t('form.sections.more')}>
            <Segments<'any' | 'yes' | 'no'>
              legende={t('fields.furnished')}
              options={[
                { value: 'any', label: t('form.any') },
                { value: 'yes', label: t('form.furnished.yes') },
                { value: 'no', label: t('form.furnished.no') },
              ]}
              valeur={brouillon.furnished === null ? 'any' : brouillon.furnished ? 'yes' : 'no'}
              onChange={(valeur) => regler({ furnished: valeur === 'any' ? null : valeur === 'yes' })}
            />
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">{t('fields.sites')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {RADAR_SOURCE_SITES.map((site) => {
                  const actif = brouillon.sites.includes(site);
                  return (
                    <button
                      key={site}
                      type="button"
                      aria-pressed={actif}
                      onClick={() => regler({ sites: actif ? brouillon.sites.filter((v) => v !== site) : [...brouillon.sites, site] })}
                      className={cn(
                        'min-h-8 rounded-full border px-3 text-sm font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        actif
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
                      )}
                    >
                      {tSites(site)}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">{t('form.sitesHint')}</p>
            </fieldset>
            <div className="max-w-48">
              <ChampNombre
                id={`${id}-age`}
                libelle={t('fields.max_age_days')}
                valeur={brouillon.maxAgeDays}
                min={1}
                max={RADAR_TARGET_MAX_AGE_DAYS}
                onChange={(maxAgeDays) => regler({ maxAgeDays })}
              />
            </div>
          </Section>

          {cible ? null : (
            <Section titre={t('form.sections.state')}>
              <Segments<'active' | 'paused'>
                legende={t('form.initialStatus')}
                options={[
                  { value: 'active', label: t('status.active') },
                  { value: 'paused', label: t('status.paused') },
                ]}
                valeur={enPause ? 'paused' : 'active'}
                onChange={(valeur) => setEnPause(valeur === 'paused')}
              />
            </Section>
          )}

          {refus ? (
            <div className="space-y-1.5" data-testid="radar-cible-refus">
              <ErrorState message={messageRefus(refus)} />
              {Number.isInteger(idDoublon) && idDoublon > 0 ? (
                <Link
                  href={`/super-admin/radar/targets/${idDoublon}`}
                  className="inline-block rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t('errors.seeDuplicate')}
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-border bg-muted/30 p-4">
          <div id={`${id}-resume`} aria-live="polite" data-testid="radar-cible-apercu">
            <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">{t('form.preview')}</p>
            <p className={cn('mt-1 text-sm text-pretty', resume.length > 0 ? 'text-foreground' : 'text-muted-foreground')}>
              {resume.length > 0 ? resume.join(SEPARATEUR_DU_RESUME) : t('form.previewEmpty')}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onFermer}>{t('form.cancel')}</Button>
            <Button type="submit" disabled={!pret}>
              {enregistrer.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {cible ? t('form.save') : t('form.create')}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
