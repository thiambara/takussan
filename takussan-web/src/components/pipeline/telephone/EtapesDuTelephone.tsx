'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronDown, ChevronRight, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { type CanalDeContactClient } from '@/lib/queries/customer-gestures';
import { PIPELINE_STAGES } from '@/lib/queries/pipeline';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import type { LectureDuProspect } from '../lecture';
import { BandeauSuggestion, GestesDuProspect, ReferentDuProspect, cheminDeLaFiche } from '../pieces';
import { ChargerPlus, TitreDeSection } from './RelancesDuTelephone';

interface CarteProps {
  readonly prospect: PipelineCustomerCard;
  readonly lecture: LectureDuProspect;
  readonly noter?: (c: CanalDeContactClient) => void;
  readonly changer: (p: PipelineCustomerCard, to: CustomerPipelineStage) => void;
  readonly plusTard: (p: PipelineCustomerCard) => void;
}

/**
 * La carte d'une étape au téléphone (maquette a-1) : qui et quoi, le dernier contact, la prochaine
 * action en évidence (rouge quand une relance est due), les gestes, et « Changer d'étape » qui déplie
 * les six étapes DANS la carte — au doigt, sans menu flottant.
 */
function CarteEtape({ prospect, lecture, noter, changer, plusTard }: CarteProps) {
  const t = useTranslations('crm.pipeline');
  const [deplie, setDeplie] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card" data-customer-id={prospect.id} data-slot="carte-etape">
      <div className="px-4 pb-3 pt-3.5">
        <Link href={cheminDeLaFiche(prospect.id)} className="flex items-center gap-2 rounded outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <span className="min-w-0 flex-1 truncate text-base font-semibold">{lecture.nom}</span>
          {prospect.referent ? <ReferentDuProspect nom={prospect.referent.name} taille={24} /> : null}
          <ChevronRight className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
        </Link>
        {lecture.cherche ? <p className="mt-0.5 text-sm leading-snug text-encre-douce">{lecture.cherche}</p> : null}
        <p className="mt-0.5 text-ui text-muted-foreground first-letter:uppercase">{lecture.contacte ? t('dernier.libelle', { quand: lecture.quand }) : lecture.dernier}</p>
        {lecture.alerte ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-lg bg-destructive/8 px-3 py-2.5 text-destructive">
            <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            <p className="min-w-0 leading-snug">
              <span className="block text-sm font-semibold first-letter:uppercase">{lecture.alerte}</span>
              {lecture.prochaine ? <span className="block text-ui">{lecture.prochaine.texte}</span> : null}
            </p>
          </div>
        ) : lecture.prochaine ? (
          <div className="mt-3 flex items-center gap-2.5 rounded-lg bg-muted px-3 py-2.5 text-sm font-medium">
            <CalendarClock className="size-4 flex-none text-muted-foreground" aria-hidden="true" />
            {lecture.prochaine.texte}
          </div>
        ) : null}
        {prospect.suggested_stage ? <BandeauSuggestion className="mt-3" suggestion={prospect.suggested_stage} prenom={lecture.prenom} onOui={(to) => changer(prospect, to)} onPlusTard={() => plusTard(prospect)} /> : null}
      </div>
      <div className="flex items-center gap-2 border-t border-border py-2 pl-3 pr-2">
        <GestesDuProspect prospect={prospect} lecture={lecture} forme="rond" noter={noter} />
        <button
          type="button"
          aria-expanded={deplie}
          onClick={() => setDeplie(!deplie)}
          className={cn('ml-auto inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring', deplie ? 'bg-secondary text-primary-deep' : 'text-encre-douce')}
        >
          {t('changer.libelle')}
          <ChevronDown className={cn('size-4', deplie ? 'rotate-180' : 'text-muted-foreground')} aria-hidden="true" />
        </button>
      </div>
      {deplie ? (
        <div className="border-t border-border bg-muted/50 px-3 pb-3 pt-2.5">
          <p className="mb-2 px-1 text-ui text-muted-foreground">{t('changer.deplacer', { prenom: lecture.prenom })}</p>
          <div className="grid grid-cols-3 gap-2">
            {PIPELINE_STAGES.map((s) => {
              const actuelle = s === prospect.pipeline_stage;
              return (
                <button
                  key={s}
                  type="button"
                  aria-current={actuelle ? 'step' : undefined}
                  aria-label={actuelle ? t('changer.actuelle', { stage: t(`stage.${s}`) }) : undefined}
                  onClick={() => {
                    if (actuelle) return;
                    setDeplie(false);
                    changer(prospect, s);
                  }}
                  className={cn('inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring', actuelle ? 'border-primary bg-secondary font-semibold text-primary-deep' : 'border-border bg-card font-medium')}
                >
                  {t(`stage.${s}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 px-1 text-ui text-muted-foreground">{t('changer.motifRequis')}</p>
        </div>
      ) : null}
    </div>
  );
}

interface EtapesProps {
  readonly sections: readonly {
    readonly stage: CustomerPipelineStage;
    readonly cartes: readonly PipelineCustomerCard[];
    readonly total: number | undefined;
    readonly mediane: number | null | undefined;
    readonly isLoading: boolean;
    readonly isError: boolean;
    readonly onRetry: () => void;
    readonly onLoadMore: () => void;
    readonly isLoadingMore: boolean;
  }[];
  readonly lire: (p: PipelineCustomerCard) => LectureDuProspect;
  readonly noter?: (id: number) => (c: CanalDeContactClient) => void;
  readonly changer: (p: PipelineCustomerCard, to: CustomerPipelineStage) => void;
  readonly plusTard: (p: PipelineCustomerCard) => void;
}

/** TCK-2592 — la vue Étapes du téléphone : l'étape choisie au portefeuille (ou les sorties), carte par carte. */
export function EtapesDuTelephone({ sections, lire, noter, changer, plusTard }: EtapesProps) {
  const t = useTranslations('crm.pipeline');
  return (
    <>
      {sections.map((s) => {
        const total = Math.max(s.total ?? 0, s.cartes.length);
        return (
          <section key={s.stage} aria-label={t(`stage.${s.stage}`)} data-stage={s.stage}>
            <TitreDeSection compte={s.isLoading ? undefined : total} droite={s.mediane !== undefined && s.mediane !== null ? t('colonne.medianeEtape', { n: Math.round(s.mediane) }) : undefined}>
              {t(`stage.${s.stage}`)}
            </TitreDeSection>
            <div className="space-y-3 px-4 pb-6">
              {s.isLoading ? (
                [0, 1].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)
              ) : s.isError ? (
                <ErrorState className="text-sm" message={t('errors.loadFailed')} onRetry={s.onRetry} retryLabel={t('actions.retry')} />
              ) : s.cartes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{t('emptyColumn')}</p>
              ) : (
                s.cartes.map((p) => <CarteEtape key={p.id} prospect={p} lecture={lire(p)} noter={noter?.(p.id)} changer={changer} plusTard={plusTard} />)
              )}
            </div>
            {!s.isLoading && total > s.cartes.length ? (
              <div className="-mt-3 pb-6">
                <ChargerPlus shown={s.cartes.length} total={total} onClick={s.onLoadMore} enCours={s.isLoadingMore} />
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
