'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OptionDeFiltre } from '@/components/customer-dashboard/CustomerListFilters';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ETAPES_VIVANTES, type EtapeVivante, type EtatDuPipeline, type PorteeDuPipeline } from '@/lib/crm/pipeline';
import { cn } from '@/lib/utils';
import type { PipelineStats } from '@/types/pipeline';

/**
 * TCK-2592 — la tête commune du téléphone (maquette `app-pipeline-telephone`) : la bascule Liste |
 * Étapes et la portée (« Moi ▾ », ou l'agence, ou un collègue pour qui lit l'agence), puis le
 * portefeuille en quatre étapes — le compte et une jauge à la même échelle dans chaque case (la plus
 * chargée = pleine) ; une case touchée choisit son étape, l'en-tête ouvre les sorties.
 */
interface TeteProps {
  readonly etat: EtatDuPipeline;
  readonly stats: PipelineStats | undefined;
  readonly basculer: (vue: 'liste' | 'etapes') => void;
  readonly portees: readonly { readonly portee: PorteeDuPipeline; readonly libelle: string }[] | null;
  readonly porteeLibelle: string | null;
  /** Les initiales de la portée (« SS » pour « Moi ») ; `null` pour l'agence. */
  readonly porteeInitiales: string | null;
  readonly choisirPortee: (p: PorteeDuPipeline) => void;
  readonly choisirEtape: (e: EtapeVivante | null) => void;
  readonly ouvrirSorties: () => void;
  /** L'étape mise en avant (vue Étapes : celle qu'on lit). */
  readonly etapeActive: EtapeVivante | null;
}

export function TeteDuTelephone({ etat, stats, basculer, portees, porteeLibelle, porteeInitiales, choisirPortee, choisirEtape, ouvrirSorties, etapeActive }: TeteProps) {
  const t = useTranslations('crm.pipeline');
  const [ouvert, setOuvert] = useState(false);
  const comptes = ETAPES_VIVANTES.map((e) => stats?.stage_counts?.[e] ?? 0);
  const actifs = comptes.reduce((a, b) => a + b, 0);
  const pleine = Math.max(1, ...comptes);
  const memePortee = (a: PorteeDuPipeline, b: PorteeDuPipeline | null) => b !== null && a.type === b.type && (a.type !== 'agent' || (b.type === 'agent' && a.id === b.id));

  return (
    <>
      <div className="flex items-center gap-2 px-4 pt-3">
        <div className="flex h-13 min-w-0 flex-1 rounded-lg bg-muted p-1" role="group" aria-label={t('vue.aria')}>
          {(['liste', 'etapes'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={etat.vue === v}
              onClick={() => basculer(v)}
              className={cn('flex flex-1 items-center justify-center rounded-md text-corps font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring', etat.vue === v ? 'bg-card text-foreground shadow-actif' : 'text-muted-foreground')}
            >
              {t(`vue.${v}`)}
            </button>
          ))}
        </div>
        {portees && porteeLibelle ? (
          <Popover open={ouvert} onOpenChange={setOuvert}>
            <PopoverTrigger
              aria-label={`${t('portee.aria')} ${porteeLibelle}`}
              className="inline-flex h-13 flex-none items-center gap-2 rounded-lg border border-border bg-card pl-2.5 pr-3 text-corps font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              {porteeInitiales ? (
                <span aria-hidden="true" className="inline-flex size-[calc(var(--spacing)*6.5)] items-center justify-center rounded-full bg-fond-avatar text-pastille font-semibold text-accent">
                  {porteeInitiales}
                </span>
              ) : null}
              {porteeLibelle}
              <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-80 w-60 overflow-y-auto p-1">
              {portees.map(({ portee, libelle }) => (
                <OptionDeFiltre key={portee.type === 'agent' ? portee.id : portee.type} choisie={memePortee(portee, etat.portee)} onClick={() => (choisirPortee(portee), setOuvert(false))}>
                  {libelle}
                </OptionDeFiltre>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <div className="mx-4 mt-3 rounded-xl border border-border bg-card" data-slot="portefeuille">
        <button type="button" onClick={ouvrirSorties} aria-label={t('portefeuille.sortiesAria')} className="flex min-h-11 w-full items-center gap-2 rounded-t-xl pl-4 pr-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <span className="font-medium">{t('portefeuille.actifs', { count: actifs })}</span>
          <span className="ml-auto text-muted-foreground">{t('portefeuille.sorties', { gagnes: stats?.stage_counts?.converted ?? 0, perdus: stats?.stage_counts?.lost ?? 0 })}</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
        <div className="grid grid-cols-4 gap-1 border-t border-border p-1.5">
          {ETAPES_VIVANTES.map((e, i) => {
            const choisie = e === etapeActive;
            const compte = comptes[i];
            return (
              <button
                key={e}
                type="button"
                aria-pressed={choisie}
                aria-label={t('portefeuille.etapeAria', { stage: t(`stage.${e}`), count: compte })}
                onClick={() => choisirEtape(choisie && etat.vue === 'liste' ? null : e)}
                className={cn('rounded-lg px-2.5 pb-2.5 pt-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring', choisie && 'bg-secondary')}
              >
                <span className={cn('block font-display text-2xl font-semibold leading-none tracking-tight tabular-nums', choisie && 'text-primary-deep')}>{compte}</span>
                <span className={cn('mt-1 block truncate text-xs', choisie ? 'font-semibold text-primary-deep' : 'text-muted-foreground')}>{t(`court.${e}`)}</span>
                <span className={cn('mt-2 block h-1 overflow-hidden rounded-full', choisie ? 'bg-primary/20' : 'bg-muted')} aria-hidden="true">
                  <span className={cn('block h-full rounded-full', choisie ? 'bg-primary' : 'bg-primary/45')} style={{ width: `${Math.round((compte / pleine) * 100)}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
