'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { OptionDeFiltre, type CrmTagOption } from '@/components/customer-dashboard/CustomerListFilters';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ESPACE_DES_ETIQUETTES_CRM, libelleEquipement } from '@/lib/libelle-equipement';
import { ETAPES_VIVANTES, type EtatDuPipeline, type PorteeDuPipeline } from '@/lib/crm/pipeline';
import { cn } from '@/lib/utils';
import type { AgencyStaffMember } from '@/types/agent-crm';
import type { PipelineStats } from '@/types/pipeline';

/**
 * TCK-2592 — la barre du bureau (maquette `app-pipeline` a) : le référent (la portée : Moi, Agence ou un
 * agent), l'étiquette, « À relancer seulement » (Étapes) ou l'étape (Liste), et la recherche ; puis les
 * quatre indicateurs cliquables de la vue Étapes.
 */

const DECLENCHEUR = 'inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring';

function Deroulant({ libelle, valeur, actif, children }: { readonly libelle: string; readonly valeur: string | null; readonly actif: boolean; readonly children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger className={cn(DECLENCHEUR, actif ? 'border-primary/50 bg-secondary font-medium text-primary-deep' : 'border-border bg-card text-encre-douce')}>
        {valeur ? (
          <>
            <span className="font-normal text-muted-foreground">{libelle}</span>
            {valeur}
          </>
        ) : (
          libelle
        )}
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1">
        {children(() => setOuvert(false))}
      </PopoverContent>
    </Popover>
  );
}

export interface BarreProps {
  readonly etat: EtatDuPipeline;
  readonly vue: 'liste' | 'etapes';
  /** `null` : le bailleur, sans portée. */
  readonly portees: readonly { readonly portee: PorteeDuPipeline; readonly libelle: string }[] | null;
  readonly porteeLibelle: string | null;
  readonly choisirPortee: (p: PorteeDuPipeline) => void;
  readonly crmTags: readonly CrmTagOption[];
  readonly poser: (cle: 'tags' | 'search' | 'relance' | 'etape', valeur: string | null) => void;
  readonly segments?: ReactNode;
}

export function BarreDuPipeline({ etat, vue, portees, porteeLibelle, choisirPortee, crmTags, poser, segments }: BarreProps) {
  const t = useTranslations('crm.pipeline');
  const tStage = useTranslations('crm.pipeline.stage');
  const tEtiquette = useTranslations(ESPACE_DES_ETIQUETTES_CRM);
  const etiquette = crmTags.find((x) => x.slug === etat.tags || x.name === etat.tags);
  const memePortee = (a: PorteeDuPipeline, b: PorteeDuPipeline | null) => b !== null && a.type === b.type && (a.type !== 'agent' || (b.type === 'agent' && a.id === b.id));

  return (
    <div className="flex flex-wrap items-center gap-2" data-slot="barre-du-pipeline">
      {segments ? (
        <>
          {segments}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        </>
      ) : null}
      {portees ? (
        <Deroulant libelle={t('filtres.referent')} valeur={porteeLibelle} actif>
          {(fermer) =>
            portees.map(({ portee, libelle }) => (
              <OptionDeFiltre key={portee.type === 'agent' ? portee.id : portee.type} choisie={memePortee(portee, etat.portee)} onClick={() => (choisirPortee(portee), fermer())}>
                {libelle}
              </OptionDeFiltre>
            ))
          }
        </Deroulant>
      ) : null}
      {vue === 'liste' ? (
        <Deroulant libelle={t('filtres.etape')} valeur={etat.etape ? tStage(etat.etape) : null} actif={etat.etape !== null}>
          {(fermer) => (
            <>
              <OptionDeFiltre choisie={etat.etape === null} onClick={() => (poser('etape', null), fermer())}>
                {t('filtres.etapeToutes')}
              </OptionDeFiltre>
              {ETAPES_VIVANTES.map((s) => (
                <OptionDeFiltre key={s} choisie={etat.etape === s} onClick={() => (poser('etape', s), fermer())}>
                  {tStage(s)}
                </OptionDeFiltre>
              ))}
            </>
          )}
        </Deroulant>
      ) : null}
      <Deroulant libelle={t('filtres.etiquette')} valeur={etiquette ? libelleEquipement(etiquette, tEtiquette) : etat.tags} actif={etat.tags !== null}>
        {(fermer) => (
          <>
            <OptionDeFiltre choisie={etat.tags === null} onClick={() => (poser('tags', null), fermer())}>
              {t('filtres.etiquetteToutes')}
            </OptionDeFiltre>
            {crmTags.map((x) => (
              <OptionDeFiltre key={x.id} choisie={etat.tags === (x.slug ?? x.name)} onClick={() => (poser('tags', x.slug ?? x.name), fermer())}>
                {libelleEquipement(x, tEtiquette)}
              </OptionDeFiltre>
            ))}
          </>
        )}
      </Deroulant>
      {vue === 'etapes' && portees ? (
        <label className={cn(DECLENCHEUR, 'cursor-pointer gap-2 border-border bg-card has-focus-visible:ring-3 has-focus-visible:ring-ring')}>
          <input type="checkbox" checked={etat.relance} onChange={(e) => poser('relance', e.target.checked ? '1' : null)} className="size-4 rounded accent-primary outline-none" />
          {t('filtres.relance')}
        </label>
      ) : null}
      <DebouncedSearchInput
        id="pipeline-search"
        value={etat.search ?? ''}
        onCommit={(q) => poser('search', q.trim() || null)}
        placeholder={t('filtres.recherche')}
        aria-label={t('filtres.rechercheAria')}
        className="ml-auto w-full sm:w-64"
      />
    </div>
  );
}

interface TuileProps {
  readonly libelle: string;
  readonly valeur?: ReactNode;
  readonly detail: ReactNode;
  readonly large?: boolean;
  readonly onClick?: () => void;
  readonly actif?: boolean;
}

function Tuile({ libelle, valeur, detail, large, onClick, actif }: TuileProps) {
  const contenu = (
    <>
      <div className="min-w-0 flex-1 text-left leading-snug">
        <p className="truncate text-ui text-muted-foreground">{libelle}</p>
        {valeur !== undefined ? <p className="font-display text-2xl font-semibold tabular-nums tracking-titre">{valeur}</p> : null}
        <div className={cn('text-xs text-muted-foreground', large ? 'truncate max-lg:whitespace-normal' : 'overflow-hidden text-ellipsis')}>{detail}</div>
      </div>
      {onClick ? <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" /> : null}
    </>
  );
  const classe = cn('flex min-w-0 items-center gap-3 rounded-xl border bg-card px-4 py-3', large ? 'flex-[1.7]' : 'flex-1', actif ? 'border-primary/50' : 'border-border');
  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={actif} className={cn(classe, 'outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring')}>
      {contenu}
    </button>
  ) : (
    <div className={classe}>{contenu}</div>
  );
}

export interface IndicateursProps {
  readonly stats: PipelineStats | undefined;
  readonly onActifs?: () => void;
  readonly onPassages?: () => void;
  readonly onConversion?: () => void;
  readonly onMediane?: () => void;
  readonly sortiesOuvertes?: boolean;
}

/** Les quatre indicateurs (TCK-2591) : chacun ouvre la vue qui le justifie. */
export function IndicateursDuPipeline({ stats, onActifs, onPassages, onConversion, onMediane, sortiesOuvertes }: IndicateursProps) {
  const t = useTranslations('crm.pipeline');
  const aucun = t('indicateurs.aucun');
  const actifs = stats ? ETAPES_VIVANTES.reduce((s, e) => s + (stats.stage_counts?.[e] ?? 0), 0) : undefined;
  const sorties = stats?.exits_last_30d;
  const conversion = stats && sorties && sorties.converted + sorties.lost > 0 ? `${Math.round(stats.conversion_rate * 100)} %` : aucun;
  return (
    <div className="flex gap-3 max-xl:grid max-xl:grid-cols-2" data-slot="indicateurs-du-pipeline">
      <Tuile libelle={t('indicateurs.actifs')} valeur={actifs ?? aucun} detail={t('indicateurs.actifsDetail')} onClick={onActifs} />
      <Tuile libelle={t('indicateurs.passages')} valeur={stats?.stage_changes_last_30d ?? aucun} detail={t('indicateurs.passagesDetail')} onClick={onPassages} />
      <Tuile
        libelle={t('indicateurs.conversion')}
        valeur={conversion}
        detail={t('indicateurs.conversionDetail', { gagnes: sorties?.converted ?? 0, perdus: sorties?.lost ?? 0 })}
        onClick={onConversion}
        actif={sortiesOuvertes}
      />
      <Tuile
        large
        libelle={t('indicateurs.mediane')}
        onClick={onMediane}
        detail={
          <span className="mt-1 flex gap-3 text-foreground">
            {ETAPES_VIVANTES.map((e) => {
              const m = stats?.median_days_in_stage?.[e];
              return (
                <span key={e} className="leading-tight">
                  <span className="block font-display text-base font-semibold tabular-nums">{m === undefined || m === null ? aucun : t('indicateurs.jours', { n: Math.round(m) })}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{t(`court.${e}`)}</span>
                </span>
              );
            })}
          </span>
        }
      />
    </div>
  );
}

/** Les segments de la liste du bureau : « À relancer 6 · À jour 47 · Tous 53 ». */
export function SegmentsDuPipeline({ actif, comptes, choisir }: { readonly actif: EtatDuPipeline['segment']; readonly comptes: Partial<Record<EtatDuPipeline['segment'], number>>; readonly choisir: (s: EtatDuPipeline['segment']) => void }) {
  const t = useTranslations('crm.pipeline.segments');
  const libelles = { 'a-relancer': t('aRelancer'), 'a-jour': t('aJour'), tous: t('tous') } as const;
  return (
    <div role="group" aria-label={t('aria')} className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {(['a-relancer', 'a-jour', 'tous'] as const).map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === actif}
          onClick={() => choisir(s)}
          className={cn('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-ui font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring', s === actif ? 'bg-card text-foreground shadow-actif' : 'text-muted-foreground hover:text-foreground')}
        >
          {libelles[s]}
          {comptes[s] !== undefined ? <span className={cn('tabular-nums', s === 'a-relancer' && (comptes[s] ?? 0) > 0 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{comptes[s]}</span> : null}
        </button>
      ))}
    </div>
  );
}

export type { AgencyStaffMember };
