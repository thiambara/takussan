'use client';

import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { customerStatusValues, pipelineStageValues } from '@/lib/enums/customer';
import { ESPACE_DES_ETIQUETTES_CRM, libelleEquipement } from '@/lib/libelle-equipement';
import { cn } from '@/lib/utils';
import type { Tag as TagType } from '@/types/tag';

/**
 * CRM filters — TCK-042, TCK-093, refaits par TCK-2590 (maquette `app-clients` a, « Liste »).
 *
 * Chaque filtre fait l'aller-retour par l'URL (`search`, `pipeline_stage`, `status`, `tags`) et part à
 * l'API en `filter[...]` ; chacun ramène en page 1. Choisir une étape quitte la vue « Négociation »,
 * qui n'est qu'une étape posée d'avance.
 *
 * TCK-2596 — « Prospects actifs » (`stage_group=active`, `filter[stage_group]` de l'API) est une option
 * du même menu : « Prospects » de « Ma journée » y arrive. Elle et l'étape précise s'excluent.
 *
 *  · `barre` (bureau) : Étape ▾ · Statut ▾ · Étiquettes ▾, sous les vues, la recherche à droite ;
 *  · `feuille` (téléphone) : les mêmes, empilés dans la feuille « Filtres ».
 */

export type CrmTagOption = Pick<TagType, 'id' | 'name' | 'color'> & { slug?: string | null };

interface Props {
  readonly crmTags?: readonly CrmTagOption[];
  readonly disposition?: 'barre' | 'feuille';
}

/** Les filtres lus dans l'URL, et leur écriture (page 1, vue « Négociation » quittée). */
export function useFiltresDesClients() {
  const { params, remplacer } = useVueDansLUrl();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const stage = params.get('pipeline_stage') ?? '';
  const enCours = params.get('stage_group') === 'active';
  const tags = (params.get('tags') ?? '').split(',').filter(Boolean);
  const poser = (cle: 'search' | 'status' | 'pipeline_stage' | 'stage_group' | 'tags', valeur: string | null) =>
    remplacer({
      [cle]: valeur,
      page: null,
      // Une étape précise, « Toutes les étapes » ou « Prospects actifs » remplacent le choix d'étape d'avant.
      ...(cle === 'pipeline_stage' ? { stage_group: null } : {}),
      ...(cle === 'stage_group' ? { pipeline_stage: null } : {}),
      ...((cle === 'pipeline_stage' || cle === 'stage_group') && params.get('vue') === 'negociation' ? { vue: null } : {}),
    });
  return {
    search,
    status,
    stage,
    enCours,
    tags,
    /** Le nombre de filtres posés (la recherche à part) : « Filtres · N ». */
    nombre: (status ? 1 : 0) + (stage || enCours ? 1 : 0) + (tags.length > 0 ? 1 : 0),
    poser,
    basculerEtiquette: (nom: string) => {
      const suite = tags.includes(nom) ? tags.filter((x) => x !== nom) : [...tags, nom];
      poser('tags', suite.length > 0 ? suite.join(',') : null);
    },
  };
}

/** La recherche : nom, prénom, e-mail, téléphone (`filter[search]`), temporisée. */
export function RechercheDesClients({ className }: { readonly className?: string }) {
  const t = useTranslations('crm.filters');
  const f = useFiltresDesClients();
  return (
    <DebouncedSearchInput
      id="customer-search"
      value={f.search}
      onCommit={(q) => f.poser('search', q.trim() || null)}
      placeholder={t('searchPlaceholder')}
      aria-label={t('searchLabel')}
      className={className}
    />
  );
}

export function CustomerListFilters({ crmTags = [], disposition = 'barre' }: Props) {
  const t = useTranslations('crm.filters');
  const tStage = useTranslations('crm.pipeline.stage');
  const tStatus = useTranslations('crm.customerStatus');
  const tEtiquette = useTranslations(ESPACE_DES_ETIQUETTES_CRM);
  const f = useFiltresDesClients();
  const feuille = disposition === 'feuille';

  const etape = (
    <Filtre
      libelle={t('stage')}
      valeur={f.stage ? (tStage.has(f.stage) ? tStage(f.stage) : f.stage) : f.enCours ? t('activeStages') : null}
      actif={Boolean(f.stage) || f.enCours}
      pleine={feuille}
    >
      {(fermer) => (
        <>
          <OptionDeFiltre choisie={!f.stage && !f.enCours} onClick={() => (f.poser('pipeline_stage', null), fermer())}>
            {t('allStages')}
          </OptionDeFiltre>
          <OptionDeFiltre choisie={!f.stage && f.enCours} onClick={() => (f.poser('stage_group', 'active'), fermer())}>
            {t('activeStages')}
          </OptionDeFiltre>
          {pipelineStageValues.map((v) => (
            <OptionDeFiltre key={v} choisie={f.stage === v} onClick={() => (f.poser('pipeline_stage', v), fermer())}>
              {tStage(v)}
            </OptionDeFiltre>
          ))}
        </>
      )}
    </Filtre>
  );

  const statut = (
    <Filtre libelle={t('statusPlaceholder')} valeur={f.status ? (tStatus.has(f.status) ? tStatus(f.status) : f.status) : null} actif={Boolean(f.status)} pleine={feuille}>
      {(fermer) => (
        <>
          <OptionDeFiltre choisie={!f.status} onClick={() => (f.poser('status', null), fermer())}>
            {t('allStatuses')}
          </OptionDeFiltre>
          {customerStatusValues.map((v) => (
            <OptionDeFiltre key={v} choisie={f.status === v} onClick={() => (f.poser('status', v), fermer())}>
              {tStatus(v)}
            </OptionDeFiltre>
          ))}
        </>
      )}
    </Filtre>
  );

  // TCK-922 — l'option affiche l'étiquette traduite ; sa valeur reste le nom en base.
  const etiquettes =
    crmTags.length > 0 ? (
      <Filtre libelle={t('tags')} valeur={f.tags.length > 0 ? String(f.tags.length) : null} actif={f.tags.length > 0} pleine={feuille}>
        {(fermer) => (
          <>
            <p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-muted-foreground">{t('customerTags')}</p>
            {crmTags.map((tag) => (
              <OptionDeFiltre key={tag.id} choisie={f.tags.includes(tag.name)} onClick={() => f.basculerEtiquette(tag.name)} caseACocher>
                {libelleEquipement(tag, tEtiquette)}
              </OptionDeFiltre>
            ))}
            {f.tags.length > 0 ? (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={() => (f.poser('tags', null), fermer())}
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm text-destructive outline-none hover:bg-destructive/10 focus-visible:bg-destructive/10"
                >
                  <X className="size-3.5" aria-hidden="true" />
                  {t('clearAll')}
                </button>
              </>
            ) : null}
          </>
        )}
      </Filtre>
    ) : null;

  if (feuille) {
    return (
      <div className="space-y-3">
        {etape}
        {statut}
        {etiquettes}
      </div>
    );
  }
  return (
    <>
      {etape}
      {statut}
      {etiquettes}
    </>
  );
}

const DECLENCHEUR = 'inline-flex h-9 flex-none items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring';

/** Un filtre de la barre : « Étape ▾ », « Étape · Négociation ▾ » une fois posé. */
function Filtre({
  libelle,
  valeur,
  actif,
  pleine,
  children,
}: {
  readonly libelle: string;
  readonly valeur: string | null;
  readonly actif: boolean;
  /** Dans la feuille du téléphone : toute la largeur, 44 px. */
  readonly pleine?: boolean;
  readonly children: (fermer: () => void) => ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger
        className={cn(
          DECLENCHEUR,
          pleine && 'h-11 w-full justify-between',
          actif ? 'border-primary/50 bg-secondary font-medium text-primary-deep' : 'border-border bg-card text-foreground',
        )}
      >
        <span className="truncate">
          {libelle}
          {valeur ? ` · ${valeur}` : null}
        </span>
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-64 overflow-y-auto p-1">
        {children(() => setOuvert(false))}
      </PopoverContent>
    </Popover>
  );
}

export function OptionDeFiltre({
  choisie,
  onClick,
  caseACocher,
  children,
}: {
  readonly choisie: boolean;
  readonly onClick: () => void;
  readonly caseACocher?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={choisie}
      onClick={onClick}
      className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
    >
      {caseACocher ? (
        <span
          aria-hidden="true"
          className={cn('flex size-4 flex-none items-center justify-center rounded border', choisie ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card')}
        >
          {choisie ? <Check className="size-3" strokeWidth={2.5} /> : null}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {!caseACocher && choisie ? <Check className="size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
    </button>
  );
}
