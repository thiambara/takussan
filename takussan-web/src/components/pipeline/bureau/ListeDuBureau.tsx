'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EtapeDuClient } from '@/components/customer-dashboard/liste/pieces';
import { OptionDeFiltre } from '@/components/customer-dashboard/CustomerListFilters';
import { ErrorState } from '@/components/feedback';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { type CanalDeContactClient } from '@/lib/queries/customer-gestures';
import { PIPELINE_STAGES } from '@/lib/queries/pipeline';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import type { LectureDuProspect } from '../lecture';
import { AlerteDuProspect, GestesDuProspect, ReferentDuProspect, cheminDeLaFiche } from '../pieces';

interface ListeProps {
  readonly lignes: readonly PipelineCustomerCard[];
  readonly total: number | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly onLoadMore: () => void;
  readonly isLoadingMore: boolean;
  readonly lire: (p: PipelineCustomerCard) => LectureDuProspect;
  readonly changer: (p: PipelineCustomerCard, to: CustomerPipelineStage) => void;
  readonly noter?: (id: number) => (channel: CanalDeContactClient) => void;
}

const TH = 'h-11 px-3 text-left text-xs font-medium text-muted-foreground';
const TD = 'h-14 px-3 align-middle text-sm';

/**
 * TCK-2592 — la vue Liste du bureau (maquette `app-pipeline` a-0) : Client · Étape · Cherche · Dernier
 * contact · Prochaine action · Réf., triée par retard comme au téléphone, et « Charger plus (x/total) ».
 * Sous 1440, « Dernier contact » descend sous « Cherche » ; sous `xl`, le tableau garde sa largeur et
 * défile dans sa carte. L'étape se change sur place (au doigt et au clavier) ; une sortie demande son motif.
 */
export function ListeDuBureau({ lignes, total, isLoading, isError, onRetry, onLoadMore, isLoadingMore, lire, changer, noter }: ListeProps) {
  const t = useTranslations('crm.pipeline');
  const tL = useTranslations('crm.pipeline.liste');
  const compte = Math.max(total ?? 0, lignes.length);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card" data-slot="liste-du-pipeline">
      <table className="w-full table-fixed max-xl:min-w-[calc(var(--spacing)*250)]">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <th className={cn(TH, 'w-[calc(var(--spacing)*47.78)] pl-4')}>{tL('client')}</th>
            <th className={cn(TH, 'w-[calc(var(--spacing)*31.67)] w1440:w-[calc(var(--spacing)*36.67)]')}>{tL('etape')}</th>
            <th className={TH}>
              {tL('cherche')}
              <span className="w1440:hidden">{tL('chercheDernier')}</span>
            </th>
            <th className={cn(TH, 'hidden w-[calc(var(--spacing)*37.78)] w1440:table-cell')}>{tL('dernier')}</th>
            <th className={cn(TH, 'w-[calc(var(--spacing)*72.78)]')}>{tL('prochaine')}</th>
            <th className={cn(TH, 'w-[calc(var(--spacing)*13.33)]')}>{tL('referent')}</th>
            <th className={cn(TH, 'w-[calc(var(--spacing)*36.67)] pr-4')}>
              <span className="sr-only">{tL('gestes')}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {isLoading ? (
            [0, 1, 2, 3].map((i) => (
              <tr key={i}>
                <td colSpan={7} className="px-4 py-3">
                  <Skeleton className="h-6 rounded-md" />
                </td>
              </tr>
            ))
          ) : isError ? (
            <tr>
              <td colSpan={7} className="px-4 py-6">
                <ErrorState className="text-sm" message={t('errors.loadFailed')} onRetry={onRetry} retryLabel={t('actions.retry')} />
              </td>
            </tr>
          ) : lignes.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                {tL('vide')}
              </td>
            </tr>
          ) : (
            lignes.map((p) => <Ligne key={p.id} prospect={p} lecture={lire(p)} changer={changer} noter={noter?.(p.id)} />)
          )}
        </tbody>
      </table>
      {!isLoading && !isError && compte > lignes.length ? (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="flex w-full items-center justify-center gap-1.5 border-t border-border py-3 text-sm font-medium text-primary outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
        >
          {isLoadingMore ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('colonne.chargerPlus', { shown: lignes.length, total: compte })}
        </button>
      ) : null}
    </div>
  );
}

function Ligne({ prospect, lecture, changer, noter }: { readonly prospect: PipelineCustomerCard; readonly lecture: LectureDuProspect; readonly changer: ListeProps['changer']; readonly noter?: (c: CanalDeContactClient) => void }) {
  return (
    <tr data-customer-id={prospect.id}>
      <td className={cn(TD, 'pl-4')}>
        <Link href={cheminDeLaFiche(prospect.id)} className="block truncate rounded font-medium text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
          {lecture.nom}
        </Link>
      </td>
      <td className={TD}>
        <ChoixDEtape prospect={prospect} nom={lecture.nom} changer={changer} />
      </td>
      <td className={TD}>
        <span className="line-clamp-2 whitespace-normal text-balance text-encre-douce w1440:block w1440:truncate">{lecture.cherche ?? '—'}</span>
        <span className="block truncate text-sm text-muted-foreground first-letter:uppercase w1440:hidden">{lecture.dernier}</span>
      </td>
      <td className={cn(TD, 'hidden w1440:table-cell')}>
        <span className="block truncate text-muted-foreground first-letter:uppercase">{lecture.dernier}</span>
      </td>
      <td className={TD}>{lecture.alerte ? <AlerteDuProspect>{lecture.alerte}</AlerteDuProspect> : <span className="block truncate">{lecture.prochaine?.texte ?? '—'}</span>}</td>
      <td className={TD}>{prospect.referent ? <ReferentDuProspect nom={prospect.referent.name} taille={24} /> : <span className="text-muted-foreground">—</span>}</td>
      <td className={cn(TD, 'pr-4')}>
        <span className="flex items-center justify-end gap-1.5">
          <GestesDuProspect prospect={prospect} lecture={lecture} forme="ligne" noter={noter} />
        </span>
      </td>
    </tr>
  );
}

/** L'étape, changée sur place : la pastille ouvre les six étapes (Gagné et Perdu passent par le motif). */
function ChoixDEtape({ prospect, nom, changer }: { readonly prospect: PipelineCustomerCard; readonly nom: string; readonly changer: ListeProps['changer'] }) {
  const tCrm = useTranslations('agentCrm.pipeline');
  const tStage = useTranslations('crm.pipeline.stage');
  const [ouvert, setOuvert] = useState(false);
  return (
    <Popover open={ouvert} onOpenChange={setOuvert}>
      <PopoverTrigger aria-label={tCrm('stageSelect', { name: nom })} className="inline-flex items-center gap-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring">
        <EtapeDuClient stage={prospect.pipeline_stage} />
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-52 p-1">
        {PIPELINE_STAGES.map((s) => (
          <OptionDeFiltre
            key={s}
            choisie={s === prospect.pipeline_stage}
            onClick={() => {
              setOuvert(false);
              changer(prospect, s);
            }}
          >
            {tStage(s)}
          </OptionDeFiltre>
        ))}
      </PopoverContent>
    </Popover>
  );
}
