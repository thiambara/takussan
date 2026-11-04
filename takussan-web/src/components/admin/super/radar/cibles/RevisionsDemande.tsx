'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Archive, ArrowLeft, Ban, GitMerge, History, Pencil, Plus, Undo2 } from 'lucide-react';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { DataState, PageHeader, StatusBadge } from '@/components/console';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchRadarTargetRevisions, radarKeys, revertRadarTargetRevision } from '@/lib/queries/radar';
import type { PaginatedResponse } from '@/types/api';
import type {
  RadarTargetRevision,
  RadarTargetRevisionDiscarded,
  RadarTargetRevisionOp,
  RadarTargetRevisionOperation,
  RadarTargetRevisionResponse,
} from '@/types/radar';
import { ECARTS_DEMANDE_RADAR, MOTIFS_REVISION_RADAR, REFUS_REVISION_RADAR } from '../codes-radar';
import { RadarNav } from '../RadarNav';
import { morceauxDuResume, parametresDuRefus, SEPARATEUR_DU_RESUME } from './criteres';
import { codeDuRefus, useMessageRefusCible } from './useMessageRefusCible';

const PAR_PAGE = 20;

const OPERATIONS: readonly RadarTargetRevisionOp[] = ['create', 'update', 'merge', 'retire'];

const ICONES: Record<RadarTargetRevisionOp, typeof Plus> = {
  create: Plus,
  update: Pencil,
  merge: GitMerge,
  retire: Archive,
};

/** Le nom d'une cible tel que la révision le connaît : l'état d'avant, sinon le nom qu'une opération lui a donné. */
export function nomsDeLaRevision(revision: RadarTargetRevision): ReadonlyMap<number, string> {
  const noms = new Map<number, string>();
  for (const op of revision.operations) {
    if (op.target_id !== null && op.name) noms.set(op.target_id, op.name);
  }
  return noms;
}

function nomDAvant(revision: RadarTargetRevision, id: number): string | null {
  const etat = revision.before.find((b) => b.id === id);
  return etat && !etat.created ? etat.name : null;
}

function estOperation(op: string | null): op is RadarTargetRevisionOp {
  return op !== null && (OPERATIONS as readonly string[]).includes(op);
}

/**
 * Le libellé d'un refus de « défaire », lu par son code : le 409 `radar.targets.revision_superseded` dit QUELLE révision
 * plus récente bloque (`params.revision_id`) ou QUELLE cible a changé depuis (`params.target_id` : épinglée, mise en pause
 * ou retirée par l'opérateur). Le 422 `radar.targets.too_many` dit le plafond que défaire dépasserait ; les autres 422 des
 * cibles (doublon) se lisent comme ailleurs dans les cibles. Jamais le code brut.
 */
function useMessageRefusRevision() {
  const t = useTranslations('superAdmin.pages.radar.targets.revisions');
  const messageRefus = useMessageRefusCible();

  return (erreur: unknown, revision: RadarTargetRevision): string => {
    const code = codeDuRefus(erreur);
    const params = parametresDuRefus(erreur);
    const refus = code === undefined ? undefined : REFUS_REVISION_RADAR[code];
    if (refus === 'alreadyReverted') return t('errors.alreadyReverted');
    if (refus === 'superseded') {
      if (typeof params.revision_id === 'number') return t('errors.superseded', { id: params.revision_id });
      if (typeof params.target_id === 'number') {
        const nom = nomDAvant(revision, params.target_id) ?? nomsDeLaRevision(revision).get(params.target_id)
          ?? t('targetFallback', { id: params.target_id });
        return t('errors.supersededTarget', { name: nom });
      }
    }
    if (code === 'radar.targets.too_many' && typeof params.max === 'number') return t('errors.tooMany', { max: params.max });
    if (erreur instanceof ApiError && erreur.status === 404) return t('errors.notFound');
    return messageRefus(erreur, t('errors.generic'));
  };
}

function LienCible({ id, children }: { readonly id: number; readonly children: ReactNode }) {
  return (
    <Link
      href={`/super-admin/radar/targets/${id}`}
      className="rounded-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {children}
    </Link>
  );
}

interface LigneProps {
  readonly revision: RadarTargetRevision;
  readonly operation: RadarTargetRevisionOperation;
}

/** Une opération appliquée : ce qui a été fait, à quelle cible, avec quels critères, et le motif donné par l'IA. */
function LigneOperation({ revision, operation }: LigneProps) {
  const t = useTranslations('superAdmin.pages.radar.targets.revisions');
  const tCibles = useTranslations('superAdmin.pages.radar.targets');
  const tTypes = useTranslations('property.types');
  const tSites = useTranslations('superAdmin.pages.radar.sites');
  const fmt = useFormatteurs();
  const noms = nomsDeLaRevision(revision);
  const nom = (id: number) => noms.get(id) ?? nomDAvant(revision, id) ?? t('targetFallback', { id });
  const cite = (texte: string) => t('quoted', { name: texte });
  const Icone = ICONES[operation.op] ?? History;
  const ancienNom = operation.target_id !== null && (operation.op === 'update' || operation.op === 'merge')
    ? nomDAvant(revision, operation.target_id)
    : null;
  const fusionnees = operation.op === 'merge'
    ? operation.merge_ids.filter((id) => id !== operation.target_id).map((id) => cite(nomDAvant(revision, id) ?? t('targetFallback', { id })))
    : [];
  const resume = operation.criteria ? morceauxDuResume(operation.criteria, { t: tCibles, tTypes, tSites, fmt }).join(SEPARATEUR_DU_RESUME) : '';

  return (
    <li className="flex gap-3" data-testid={`radar-revision-${revision.id}-op`}>
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
        <Icone className="size-3.5" />
      </span>
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="text-pretty text-foreground">
          <span className="font-semibold">{t(`ops.${operation.op}`)}</span>
          {' '}
          {operation.target_id !== null ? <LienCible id={operation.target_id}>{cite(nom(operation.target_id))}</LienCible> : null}
          {ancienNom && operation.target_id !== null && ancienNom !== nom(operation.target_id) ? (
            <span className="text-muted-foreground">{' '}({t('renamedFrom', { name: ancienNom })})</span>
          ) : null}
          {fusionnees.length > 0 ? <span>{' '}{t('mergedFrom', { names: fusionnees.join(', ') })}</span> : null}
        </p>
        {resume ? <p className="text-xs text-pretty text-muted-foreground">{resume}</p> : null}
        {operation.reason && MOTIFS_REVISION_RADAR[operation.reason] ? (
          <p className="text-xs text-pretty text-muted-foreground">{t(`codeReasons.${MOTIFS_REVISION_RADAR[operation.reason]}`)}</p>
        ) : operation.reason ? (
          <p className="text-xs text-pretty text-muted-foreground italic">{t('reason', { reason: operation.reason })}</p>
        ) : null}
      </div>
    </li>
  );
}

/** Une opération écartée par le code : ce qu'elle proposait, et pourquoi elle n'a pas été appliquée. */
function LigneEcartee({ revision, ecartee }: { readonly revision: RadarTargetRevision; readonly ecartee: RadarTargetRevisionDiscarded }) {
  const t = useTranslations('superAdmin.pages.radar.targets.revisions');
  const noms = nomsDeLaRevision(revision);
  const cle = ECARTS_DEMANDE_RADAR[ecartee.code] ?? 'other';
  const max = typeof ecartee.params?.max === 'number' ? ecartee.params.max : '';
  const cible = ecartee.target_id !== null
    ? <LienCible id={ecartee.target_id}>{t('quoted', { name: ecartee.target_name || (noms.get(ecartee.target_id) ?? nomDAvant(revision, ecartee.target_id) ?? t('targetFallback', { id: ecartee.target_id })) })}</LienCible>
    : ecartee.name ? <span className="font-medium">{t('quoted', { name: ecartee.name })}</span> : null;

  return (
    <li className="space-y-0.5 text-sm" data-testid={`radar-revision-${revision.id}-ecartee`}>
      <p className="text-pretty text-foreground">
        <span className="font-semibold">{t(`ops.${estOperation(ecartee.op) ? ecartee.op : 'unknown'}`)}</span>
        {cible ? <>{' '}{cible}</> : null}
        <span className="text-muted-foreground">{' — '}{t(`discardReasons.${cle}`, { max })}</span>
      </p>
      {ecartee.reason ? <p className="text-xs text-pretty text-muted-foreground italic">{t('reason', { reason: ecartee.reason })}</p> : null}
    </li>
  );
}

interface CarteProps {
  readonly revision: RadarTargetRevision;
  readonly ecrit: boolean;
  readonly onDefaire: (revision: RadarTargetRevision) => void;
}

function CarteRevision({ revision, ecrit, onDefaire }: CarteProps) {
  const t = useTranslations('superAdmin.pages.radar.targets.revisions');
  const fmt = useFormatteurs();
  const defaite = revision.reverted_at !== null;

  return (
    <li
      id={`revision-${revision.id}`}
      className="scroll-mt-24 space-y-3 rounded-xl bg-card p-4 ring-1 ring-border"
      data-testid={`radar-revision-${revision.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold text-foreground">{t('number', { id: revision.id })}</h2>
            <StatusBadge
              tone={defaite ? 'neutral' : 'success'}
              label={defaite ? t('reverted') : t('applied')}
              data-testid={`radar-revision-${revision.id}-etat`}
            />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {fmt.dateTime(revision.created_at)}
            {' · '}
            {t('signals', { count: revision.signals_count })}
          </p>
        </div>
        {ecrit && !defaite ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDefaire(revision)}
            data-testid={`radar-revision-${revision.id}-defaire`}
          >
            <Undo2 className="size-4" aria-hidden="true" />
            {t('revert')}
          </Button>
        ) : null}
      </div>

      {defaite && revision.reverted_at ? (
        <p className="text-xs text-muted-foreground" data-testid={`radar-revision-${revision.id}-defaite`}>
          {revision.reverted_by
            ? t('revertedBy', { date: fmt.dateTime(revision.reverted_at), name: revision.reverted_by.name })
            : t('revertedAt', { date: fmt.dateTime(revision.reverted_at) })}
        </p>
      ) : null}

      {revision.operations.length > 0 ? (
        <ul className="space-y-3">
          {revision.operations.map((operation, index) => (
            <LigneOperation key={`${operation.op}-${operation.target_id ?? 'x'}-${index}`} revision={revision} operation={operation} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t('noChange')}</p>
      )}

      {revision.discarded.length > 0 ? (
        <details className="group rounded-lg bg-muted/40 px-3 py-2">
          <summary className="flex cursor-pointer items-center gap-2 rounded-sm text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Ban className="size-4 text-muted-foreground" aria-hidden="true" />
            {t('discardedHeading', { count: revision.discarded.length })}
          </summary>
          <ul className="mt-2 space-y-2">
            {revision.discarded.map((ecartee, index) => (
              <LigneEcartee key={`${ecartee.code}-${ecartee.target_id ?? 'x'}-${index}`} revision={revision} ecartee={ecartee} />
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

/**
 * TCK-2470 (ADR-0087 §6) — l'historique des révisions des cibles de la demande : à chaque passage qui a appelé l'IA, les
 * opérations appliquées (créée, réglée, fusion, retirée — avec les noms des cibles et le motif donné par l'IA), les
 * propositions écartées par le code et pourquoi, et « défaire » avec confirmation.
 *
 * Lecture `platform.radar.operate` ; défaire : `platform.radar.publish`. Le 409 `radar.targets.revision_superseded` se
 * lit en clair : la révision plus récente qui bloque, ou la cible épinglée depuis.
 */
export function RevisionsDemande() {
  const t = useTranslations('superAdmin.pages.radar.targets.revisions');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const tCommon = useTranslations('common');
  const { can } = usePlatformAbilities();
  const queryClient = useQueryClient();
  const messageErreur = useMessageErreurApi();
  const messageRefus = useMessageRefusRevision();
  const lit = can('platform.radar.operate');
  const ecrit = can('platform.radar.publish');
  const [page, setPage] = useState(1);
  const [aDefaire, setADefaire] = useState<RadarTargetRevision | null>(null);

  const liste = useQuery<PaginatedResponse<RadarTargetRevision>, ApiError>({
    queryKey: radarKeys.targetRevisions(page),
    queryFn: () => fetchRadarTargetRevisions(page, PAR_PAGE),
    enabled: lit,
    staleTime: 10_000,
  });

  const defaire = useMutation<RadarTargetRevisionResponse, ApiError, number>({
    mutationFn: revertRadarTargetRevision,
    onSuccess: () => {
      setADefaire(null);
      void queryClient.invalidateQueries({ queryKey: radarKeys.targets() });
      void queryClient.invalidateQueries({ queryKey: radarKeys.demand() });
    },
    onError: (erreur) => {
      // Déjà défaite ailleurs : la liste relue le montre.
      if (codeDuRefus(erreur) === 'radar.targets.revision_reverted') {
        void queryClient.invalidateQueries({ queryKey: radarKeys.targets() });
      }
    },
  });

  const retour = (
    <Link
      href="/super-admin/radar/targets"
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('back')}
    </Link>
  );

  if (!lit) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <ErrorState message={tRadar('forbidden')} />
      </div>
    );
  }

  const ouvrir = (revision: RadarTargetRevision) => {
    defaire.reset();
    setADefaire(revision);
  };

  return (
    <div className="space-y-6">
      <RadarNav />
      {retour}
      <PageHeader title={t('title')} description={ecrit ? t('subtitle') : t('readOnly')} />

      <DataState
        loading={liste.isLoading}
        error={liste.isError ? messageErreur(liste.error, t('loadError')) : null}
        onRetry={() => void liste.refetch()}
        retryLabel={tCommon('actions.retry')}
        isEmpty={!liste.data || liste.data.data.length === 0}
        skeletonRows={3}
        skeletonRowClassName="h-32"
        emptyState={(
          <EmptyState
            icon={<History className="size-8" aria-hidden="true" />}
            title={t('empty.title')}
            description={t('empty.description')}
          />
        )}
      >
        <ol className="space-y-4" aria-label={t('listLabel')}>
          {(liste.data?.data ?? []).map((revision) => (
            <CarteRevision key={revision.id} revision={revision} ecrit={ecrit} onDefaire={ouvrir} />
          ))}
        </ol>
      </DataState>

      {liste.data && liste.data.meta.last_page > 1 ? (
        <Pagination page={liste.data.meta.current_page} lastPage={liste.data.meta.last_page} onChange={setPage} />
      ) : null}

      {ecrit ? (
        <Dialog open={aDefaire !== null} onOpenChange={(ouvert) => { if (!ouvert && !defaire.isPending) setADefaire(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{aDefaire ? t('revertDialog.title', { id: aDefaire.id }) : null}</DialogTitle>
              <DialogDescription>{t('revertDialog.body')}</DialogDescription>
            </DialogHeader>
            {defaire.error && aDefaire ? (
              <ErrorState message={messageRefus(defaire.error, aDefaire)} data-testid="radar-revision-refus" />
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setADefaire(null)} disabled={defaire.isPending}>
                {t('revertDialog.cancel')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => { if (aDefaire) defaire.mutate(aDefaire.id); }}
                disabled={defaire.isPending || defaire.isError}
                data-testid="radar-revision-defaire-confirmer"
              >
                {t('revertDialog.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
