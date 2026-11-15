'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown } from 'lucide-react';

import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useApiQuery } from '@/hooks/useApiQuery';
import { nomAffichable } from '@/lib/identite';
import type { AffinageDesDemandes, CanalDeDemande, FiltreDesDemandes } from '@/lib/queries/contact-leads';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';

import { CANAUX_DES_DEMANDES } from '../filtre-des-demandes';

export interface VueDeLaBoite {
  readonly filtre: FiltreDesDemandes;
  readonly compte?: number;
  /** Le compte en rouge (des demandes attendent). */
  readonly alerte?: boolean;
}

/** Les vues du bureau, en contrôle segmenté compté (`Vues` de la maquette) : des bascules pressées. */
export function VuesDuBureau({
  vues,
  active,
  onChoisir,
}: {
  readonly vues: readonly VueDeLaBoite[];
  readonly active: FiltreDesDemandes;
  readonly onChoisir: (f: FiltreDesDemandes) => void;
}) {
  const t = useTranslations('contactLeads.filters');
  return (
    <div role="group" aria-label={t('label')} data-slot="vues-du-bureau" className="flex items-center gap-1 rounded-lg bg-muted p-1">
      {vues.map((v) => (
        <button
          key={v.filtre}
          type="button"
          aria-pressed={v.filtre === active}
          onClick={() => onChoisir(v.filtre)}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-ui font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring',
            v.filtre === active ? 'bg-card text-foreground shadow-actif' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t(v.filtre)}
          {v.compte !== undefined ? (
            <span className={cn('tabular-nums', v.alerte ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{v.compte}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

const DECLENCHEUR =
  'inline-flex h-9 flex-none items-center gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring';

function Filtre({ libelle, actif, children }: { readonly libelle: string; readonly actif: boolean; readonly children: (fermer: () => void) => ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger
        className={cn(DECLENCHEUR, actif ? 'border-primary/50 bg-secondary font-medium text-primary-deep' : 'border-border bg-card text-encre-douce')}
      >
        {libelle}
        <ChevronDown className="size-3 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1">{children(() => setOuvert(false))}</PopoverContent>
    </Popover>
  );
}

function Option({ choisie, onClick, children }: { readonly choisie: boolean; readonly onClick: () => void; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={choisie}
      onClick={onClick}
      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {choisie ? <Check className="size-4 flex-none text-primary" strokeWidth={1.75} aria-hidden="true" /> : null}
    </button>
  );
}

interface FiltresDuBureauProps {
  readonly affinage: AffinageDesDemandes;
  readonly onAffiner: (changements: Record<string, string | number | null>) => void;
  /** L'agence dont les agents se proposent ; `null` : pas de filtre Agent (le bailleur). */
  readonly agenceDesAgents: number | null;
}

/** Bien, Agent, Canal : trois filtres fermés, chacun dans l'URL (`?bien=`, `?agent=`, `?canal=`). */
export function FiltresDuBureau({ affinage, onAffiner, agenceDesAgents }: FiltresDuBureauProps) {
  const t = useTranslations('contactLeads.desktop');
  const [terme, setTerme] = useState('');
  const biens = useApiQuery<PaginatedResponse<{ id: number; title: string }>>(['properties', 'demandes', terme], '/api/properties', {
    params: { fields: { properties: ['id', 'title'] }, filter: terme ? { search: terme } : {}, per_page: 8 },
  });
  const agents = useApiQuery<PaginatedResponse<{ id: number; first_name: string | null; last_name: string | null }>>(
    ['agency-members', agenceDesAgents ?? 0, 'assign'],
    `/api/agencies/${agenceDesAgents ?? 0}/members`,
    {
      params: { fields: { users: ['id', 'first_name', 'last_name'] }, filter: { assignable: 1 }, sort: 'first_name', per_page: 100 },
      enabled: agenceDesAgents !== null,
    },
  );
  const bienChoisi = biens.data?.data.find((b) => b.id === affinage.bien);
  const agentChoisi = agents.data?.data.find((a) => a.id === affinage.agent);

  return (
    <>
      <Filtre libelle={bienChoisi?.title ?? t('property')} actif={affinage.bien != null}>
        {(fermer) => (
          <div className="space-y-1">
            <DebouncedSearchInput value={terme} onCommit={setTerme} placeholder={t('propertySearch')} aria-label={t('propertySearch')} busy={biens.isFetching} />
            <Option choisie={affinage.bien == null} onClick={() => (onAffiner({ bien: null }), fermer())}>
              {t('anyProperty')}
            </Option>
            {(biens.data?.data ?? []).map((b) => (
              <Option key={b.id} choisie={affinage.bien === b.id} onClick={() => (onAffiner({ bien: b.id }), fermer())}>
                {b.title}
              </Option>
            ))}
          </div>
        )}
      </Filtre>
      {agenceDesAgents !== null ? (
        <Filtre libelle={agentChoisi ? nomAffichable(agentChoisi) : t('agent')} actif={affinage.agent != null}>
          {(fermer) => (
            <div className="max-h-80 overflow-y-auto">
              <Option choisie={affinage.agent == null} onClick={() => (onAffiner({ agent: null }), fermer())}>
                {t('anyAgent')}
              </Option>
              {(agents.data?.data ?? []).map((a) => (
                <Option key={a.id} choisie={affinage.agent === a.id} onClick={() => (onAffiner({ agent: a.id }), fermer())}>
                  {nomAffichable(a)}
                </Option>
              ))}
            </div>
          )}
        </Filtre>
      ) : null}
      <Filtre libelle={affinage.canal ? t(`channels.${affinage.canal}`) : t('channel')} actif={affinage.canal != null}>
        {(fermer) => (
          <div>
            <Option choisie={affinage.canal == null} onClick={() => (onAffiner({ canal: null }), fermer())}>
              {t('anyChannel')}
            </Option>
            {CANAUX_DES_DEMANDES.map((c: CanalDeDemande) => (
              <Option key={c} choisie={affinage.canal === c} onClick={() => (onAffiner({ canal: c }), fermer())}>
                {t(`channels.${c}`)}
              </Option>
            ))}
          </div>
        )}
      </Filtre>
    </>
  );
}
