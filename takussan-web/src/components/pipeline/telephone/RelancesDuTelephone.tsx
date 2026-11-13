'use client';

import { useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback';
import { type CanalDeContactClient } from '@/lib/queries/customer-gestures';
import { cn } from '@/lib/utils';
import type { CustomerPipelineStage } from '@/types/customer';
import type { PipelineCustomerCard } from '@/types/pipeline';

import type { LectureDuProspect } from '../lecture';
import { GestesDuProspect, cheminDeLaFiche } from '../pieces';

/** L'étape qui suit une étape vivante (Négociation → Gagné, qui demande son motif). */
export const ETAPE_SUIVANTE: Partial<Record<CustomerPipelineStage, CustomerPipelineStage>> = {
  lead: 'prospect',
  prospect: 'qualified',
  qualified: 'negotiating',
  negotiating: 'converted',
};

export function TitreDeSection({ children, compte, alerte, droite }: { readonly children: ReactNode; readonly compte: number | undefined; readonly alerte?: boolean; readonly droite?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2.5 pt-6">
      <h2 className="font-display text-lg font-semibold tracking-tight">{children}</h2>
      {compte !== undefined ? (
        <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-sm font-semibold tabular-nums', alerte && compte > 0 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-encre-douce')}>{compte}</span>
      ) : null}
      {droite ? <span className="ml-auto text-ui text-muted-foreground">{droite}</span> : null}
    </div>
  );
}

/** Le retard, en tuile : la clé du tri, lue avant le nom. Rouge à partir de 7 jours, ambre en dessous. */
function Retard({ jours }: { readonly jours: number }) {
  const t = useTranslations('crm.pipeline.retard');
  return (
    <span
      role="img"
      aria-label={t('aria', { days: jours })}
      data-slot="retard"
      data-ton={jours >= 7 ? 'rouge' : 'ambre'}
      className={cn('flex h-12 w-11 flex-none flex-col items-center justify-center rounded-lg leading-none', jours >= 7 ? 'bg-destructive/10 text-destructive' : 'bg-warning/15 text-warning')}
    >
      <span className="font-display text-xl font-semibold tabular-nums" aria-hidden="true">{jours}</span>
      <span className="mt-1 text-xs font-medium" aria-hidden="true">{t('unite', { days: jours })}</span>
    </span>
  );
}

interface LigneProps {
  readonly prospect: PipelineCustomerCard;
  readonly lecture: LectureDuProspect;
  readonly noter?: (c: CanalDeContactClient) => void;
  readonly onEtapeSuivante: (p: PipelineCustomerCard) => void;
  /** « Reporter » : la tâche en retard passe à demain ; absent quand rien ne se reporte. */
  readonly onReporter?: (p: PipelineCustomerCard) => void;
}

const SEUIL = 64;

/**
 * Une ligne d'« À relancer » : la tuile de retard, le nom et l'étape, ce qu'il y a à faire, l'objet,
 * puis les deux gestes. Balayée vers la gauche, elle découvre « Étape suivante » et « Reporter ».
 */
function LigneRelance({ prospect, lecture, noter, onEtapeSuivante, onReporter }: LigneProps) {
  const t = useTranslations('crm.pipeline');
  const [decalage, setDecalage] = useState(0);
  const [ouverte, setOuverte] = useState(false);
  const depart = useRef<{ x: number; y: number } | null>(null);
  const largeur = onReporter ? 2 * 96 : 96;
  const suivante = ETAPE_SUIVANTE[prospect.pipeline_stage];

  return (
    <li className="relative overflow-hidden bg-card" data-customer-id={prospect.id} data-slot="ligne-relance">
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={!ouverte}>
        {suivante ? (
          <button type="button" tabIndex={ouverte ? 0 : -1} onClick={() => (setOuverte(false), onEtapeSuivante(prospect))} className="flex w-24 items-center justify-center bg-primary px-2 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring">
            {t('geste.etapeSuivante')}
          </button>
        ) : null}
        {onReporter ? (
          <button type="button" tabIndex={ouverte ? 0 : -1} onClick={() => (setOuverte(false), onReporter(prospect))} className="flex w-24 items-center justify-center bg-secondary px-2 text-sm font-semibold text-primary-deep outline-none focus-visible:ring-3 focus-visible:ring-ring">
            {t('geste.reporter')}
          </button>
        ) : null}
      </div>
      <div
        className="relative flex min-h-20 touch-pan-y items-center gap-3 bg-card py-3 pl-4 pr-3 transition-transform duration-150 motion-reduce:transition-none"
        style={{ transform: `translateX(${ouverte ? -largeur : decalage}px)` }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          depart.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          const d = depart.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (Math.abs(e.clientY - d.y) > Math.abs(dx)) return;
          setDecalage(Math.min(0, Math.max(-largeur, dx + (ouverte ? -largeur : 0))));
        }}
        onPointerUp={() => {
          if (!depart.current) return;
          depart.current = null;
          setOuverte(decalage < -SEUIL);
          setDecalage(0);
        }}
        onPointerCancel={() => {
          depart.current = null;
          setDecalage(0);
        }}
      >
        {lecture.retard !== null ? <Retard jours={lecture.retard} /> : null}
        <Link href={cheminDeLaFiche(prospect.id)} className="min-w-0 flex-1 rounded outline-none focus-visible:ring-3 focus-visible:ring-ring">
          <span className="flex items-baseline gap-1.5">
            <span className="truncate text-base font-semibold leading-tight">{lecture.nom}</span>
            <span className="flex-none text-xs text-muted-foreground">{t(`court.${prospect.pipeline_stage}`)}</span>
          </span>
          {lecture.quoi ? <span className="mt-0.5 block truncate text-sm font-medium leading-snug">{lecture.quoi}</span> : null}
          {lecture.cherche ? <span className="block truncate text-ui leading-snug text-muted-foreground">{lecture.cherche}</span> : null}
        </Link>
        <span className="flex flex-none items-center gap-2">
          <GestesDuProspect prospect={prospect} lecture={lecture} forme="rond" noter={noter} />
        </span>
      </div>
    </li>
  );
}

interface RelancesProps {
  readonly relances: { readonly lignes: readonly PipelineCustomerCard[]; readonly total: number | undefined; readonly isLoading: boolean; readonly isError: boolean; readonly onRetry: () => void; readonly onLoadMore: () => void; readonly isLoadingMore: boolean };
  readonly aJour: { readonly lignes: readonly PipelineCustomerCard[]; readonly total: number | undefined; readonly onLoadMore: () => void; readonly isLoadingMore: boolean };
  /** Le personnel : « À relancer » existe ; le bailleur n'a que les prospects (« À jour » sans relance). */
  readonly personnel: boolean;
  readonly lire: (p: PipelineCustomerCard) => LectureDuProspect;
  readonly noter?: (id: number) => (c: CanalDeContactClient) => void;
  readonly onEtapeSuivante: (p: PipelineCustomerCard) => void;
  readonly onReporter: (p: PipelineCustomerCard) => void;
  readonly peutReporter: (p: PipelineCustomerCard) => boolean;
}

/**
 * TCK-2592 — la Liste du téléphone (maquette a-0) : « À relancer », la plus ancienne relance d'abord,
 * puis « À jour » repliée en carte (trois initiales, « et 44 autres »), qui se déplie.
 */
export function RelancesDuTelephone({ relances, aJour, personnel, lire, noter, onEtapeSuivante, onReporter, peutReporter }: RelancesProps) {
  const t = useTranslations('crm.pipeline');
  const [deplie, setDeplie] = useState(!personnel);
  const premiers = aJour.lignes.slice(0, 3).map(lire);
  const autres = Math.max(0, (aJour.total ?? aJour.lignes.length) - premiers.length);

  return (
    <>
      {personnel ? (
        <>
          <TitreDeSection compte={relances.total} alerte droite={t('relances.tri')}>
            {t('relances.titre')}
          </TitreDeSection>
          {relances.isLoading ? (
            <div className="space-y-px border-y border-border">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 rounded-none" />
              ))}
            </div>
          ) : relances.isError ? (
            <ErrorState className="mx-4 text-sm" message={t('errors.loadFailed')} onRetry={relances.onRetry} retryLabel={t('actions.retry')} />
          ) : relances.lignes.length === 0 ? (
            <p className="mx-4 rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground">{t('relances.vide')}</p>
          ) : (
            <>
              <ul className="divide-y divide-border border-y border-border bg-card" data-slot="a-relancer">
                {relances.lignes.map((p) => (
                  <LigneRelance key={p.id} prospect={p} lecture={lire(p)} noter={noter?.(p.id)} onEtapeSuivante={onEtapeSuivante} onReporter={peutReporter(p) ? onReporter : undefined} />
                ))}
              </ul>
              {(relances.total ?? 0) > relances.lignes.length ? (
                <ChargerPlus shown={relances.lignes.length} total={relances.total ?? 0} onClick={relances.onLoadMore} enCours={relances.isLoadingMore} />
              ) : null}
              <p className="px-4 pt-2.5 text-ui leading-snug text-muted-foreground">{t('relances.balayer')}</p>
            </>
          )}
        </>
      ) : null}

      <TitreDeSection compte={aJour.total}>{t('relances.aJour')}</TitreDeSection>
      {deplie ? (
        <div className="mb-6">
          {aJour.lignes.length > 0 ? (
            <ul className="divide-y divide-border border-y border-border bg-card">
              {aJour.lignes.map((p) => (
                <LigneRelance key={p.id} prospect={p} lecture={lire(p)} noter={noter?.(p.id)} onEtapeSuivante={onEtapeSuivante} />
              ))}
            </ul>
          ) : null}
          {(aJour.total ?? 0) > aJour.lignes.length ? <ChargerPlus shown={aJour.lignes.length} total={aJour.total ?? 0} onClick={aJour.onLoadMore} enCours={aJour.isLoadingMore} /> : null}
          {personnel ? (
            <div className="px-4 pt-2">
              <button type="button" onClick={() => setDeplie(false)} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring">
                {t('relances.replier')}
                <ChevronDown className="size-4 rotate-180" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-4 pb-6">
        <button
          type="button"
          onClick={() => setDeplie(true)}
          aria-expanded={false}
          aria-label={t('relances.deplier')}
          className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="flex flex-none -space-x-2" aria-hidden="true">
            {premiers.map((l, i) => (
              <span key={i} className="inline-flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary-deep ring-2 ring-card">
                {l.initiales}
              </span>
            ))}
          </span>
          <span className="min-w-0 flex-1 leading-snug">
            <span className="block text-base font-medium">{t('relances.rienEnRetard')}</span>
            {premiers.length > 0 ? (
              <span className="block truncate text-sm text-muted-foreground">{t('relances.etAutres', { noms: premiers.map((l) => l.prenom).join(', '), count: autres })}</span>
            ) : null}
          </span>
          <ChevronDown className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
        </button>
        </div>
      )}
    </>
  );
}

export function ChargerPlus({ shown, total, onClick, enCours }: { readonly shown: number; readonly total: number; readonly onClick: () => void; readonly enCours: boolean }) {
  const t = useTranslations('crm.pipeline');
  return (
    <div className="px-4 pt-3">
      <button type="button" onClick={onClick} disabled={enCours} className="flex h-11 w-full items-center justify-center rounded-lg border border-border bg-card text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60">
        {t('colonne.chargerPlus', { shown, total })}
      </button>
    </div>
  );
}
