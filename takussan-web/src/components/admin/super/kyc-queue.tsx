'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Building2, ExternalLink, FileText, ShieldCheck, XCircle } from 'lucide-react';

import { DataTable, StatusBadge, type DataTableColumn, type StatusTone } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { ApiError } from '@/lib/api';
import { postKycReview } from '@/lib/queries/super-admin';
import type { KycDossier, KycDossierStatus } from '@/types/super-admin';
import { cn } from '@/lib/utils';

/**
 * Le statut du dossier → le ton sémantique du DS (TCK-357). Aucune couleur en dur ici : c'est
 * `StatusBadge` qui décide de la teinte, et lui seul.
 */
const KYC_STATUS_TONES: Record<KycDossierStatus, StatusTone> = {
  pending: 'neutral',
  submitted: 'attention',
  verified: 'success',
  rejected: 'danger',
};

/**
 * Le seul état depuis lequel l'API accepte une décision.
 *
 * `KycWorkflowService::assertTransitionable()` lève un 422 sur tout autre statut. Le front ne
 * propose donc les deux boutons que là — proposer une action que l'API refusera est une promesse
 * qu'on ne tient pas, et le 422 arriverait après le clic.
 */
const STATUT_INSTRUISIBLE: KycDossierStatus = 'submitted';

/**
 * Le plancher de `RejectKycDossierRequest` : `['required', 'string', 'min:5', 'max:2000']`.
 * Recopié ici parce que rien ne le transporte, et vérifié à la source le 2026-08-27.
 */
const MOTIF_LONGUEUR_MIN = 5;

/** Les trois pièces qu'un dossier d'agence doit porter (`KycWorkflowService::AGENCY_REQUIRED_DOCUMENTS`). */
const DOCUMENTS_REQUIS = ['rccm', 'ninea', 'director_id'] as const;

/**
 * Le nom de l'agence, et l'identifiant seulement en repli.
 *
 * TCK-362 (AC2) — l'écran affichait « Agence #12 » pour TOUTES les lignes : `KycDossierResource`
 * n'émettait pas le sujet. Il l'émet désormais sous `include=subject` ; ce repli ne sert donc plus
 * qu'un dossier dont le sujet a été supprimé, où l'identifiant est la seule chose qui reste.
 */
export function nomDuSujet(
  dossier: KycDossier,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  return dossier.subject?.name?.trim() || t('agencyFallback', { id: String(dossier.subject_id) });
}

export function KycQueueTable({
  dossiers,
  selectedId,
  onSelect,
}: {
  dossiers: readonly KycDossier[];
  selectedId: number | null;
  onSelect: (dossier: KycDossier) => void;
}) {
  const t = useTranslations('superAdmin.pages.kyc');
  const tStatus = useTranslations('kyc.status');

  const columns: DataTableColumn<KycDossier>[] = [
    {
      id: 'agency',
      header: t('columns.agency'),
      cell: (dossier) => (
        <div className="flex min-w-0 items-center gap-3">
          <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{nomDuSujet(dossier, t)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {t('dossierRef', { id: String(dossier.id) })}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (dossier) => (
        <StatusBadge tone={KYC_STATUS_TONES[dossier.status] ?? 'neutral'} label={tStatus(dossier.status)} />
      ),
    },
    {
      id: 'documents',
      header: t('columns.documents'),
      className: 'text-muted-foreground',
      cell: (dossier) =>
        t('documentsCount', {
          present: String(nombreDePiecesFournies(dossier)),
          total: String(DOCUMENTS_REQUIS.length),
        }),
    },
    {
      id: 'submittedAt',
      header: t('columns.submittedAt'),
      className: 'text-muted-foreground',
      cell: (dossier) => formatDate(dossier.submitted_at),
    },
    {
      id: 'action',
      header: t('columns.action'),
      headerSrOnly: true,
      align: 'end',
      cell: (dossier) => (
        <Button type="button" variant="outline" size="sm" onClick={() => onSelect(dossier)}>
          {t('review')}
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      caption={t('tableCaption')}
      columns={columns}
      rows={dossiers}
      rowKey={(dossier) => dossier.id}
      rowProps={(dossier) => ({
        'data-testid': `kyc-dossier-${dossier.id}`,
        className: cn(selectedId === dossier.id && 'bg-muted'),
      })}
    />
  );
}

/**
 * Le panneau de décision — sur le patron de `ModerationDecisionPanel` (`super/moderation.tsx`).
 *
 * Trois écarts avec lui, tous voulus :
 *
 * 1. **Le motif n'est exigé que pour le REJET.** La modération demande un motif pour ses quatre
 *    décisions ; ici `RejectKycDossierRequest` le rend obligatoire (`min:5`) et `verify()` n'en
 *    prend aucun. Un motif obligatoire pour vérifier serait un obstacle inventé par le front.
 * 2. **Le bouton « Rejeter » n'est PAS désactivé quand le motif manque** — il l'annonce. Un bouton
 *    grisé sans explication laisse l'opérateur chercher ce qui bloque ; et c'est aussi ce qui rend
 *    la règle éprouvable en tentant réellement la soumission (TCK-362, AC3).
 * 3. **Les deux boutons disparaissent hors de `submitted`** : l'API refuse la transition, cf.
 *    `STATUT_INSTRUISIBLE`.
 */
export function KycDecisionPanel({
  dossier,
  onDone,
}: {
  dossier: KycDossier | null;
  onDone: () => void;
}) {
  const t = useTranslations('superAdmin.pages.kyc');
  const tStatus = useTranslations('kyc.status');
  const tDocuments = useTranslations('kyc.documents');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  /*
   * ⚠ Le motif ne se remet PAS à zéro ici : l'appelant monte ce panneau avec `key={dossier.id}`,
   * donc changer de dossier le remonte et l'état repart vide.
   *
   * Un `useEffect(() => setReason(''), [dossier.id])` aurait fait la même chose et le lint
   * l'a refusé (`Calling setState synchronously within an effect can trigger cascading renders`,
   * ADR-0015). Le `key` est de toute façon la forme juste : sans elle, un motif saisi pour un
   * dossier partirait avec la décision d'un AUTRE — une décision juste, motivée par autre chose,
   * qui est le pire défaut possible sur cet écran.
   */

  const mutation = useMutation({
    mutationFn: ({ action }: { action: 'verify' | 'reject' }) => {
      if (!dossier) throw new Error('kyc:no-dossier-selected');
      return postKycReview(dossier.id, action, action === 'reject' ? reason.trim() : undefined);
    },
    onSuccess: async () => {
      setReason('');
      setError(null);
      /*
       * TCK-362 (AC4) — la file ET le compteur, sans rechargement.
       *
       * `['super-admin', 'kyc']` est un PRÉFIXE : il couvre la page courante, chaque autre page
       * en cache et la tuile de compte, qui vit sous la même racine. `system-metrics` s'y ajoute
       * parce qu'une vérification bascule l'agence en `active` / `is_verified`
       * (`KycWorkflowService::verify`) — deux des huit tuiles de l'accueil comptent exactement ça.
       */
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'kyc'] }),
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'system-metrics'] }),
      ]);
      onDone();
    },
    onError: (err: ApiError) => setError(messageErreur(err, t('decisionFailed'))),
  });

  if (!dossier) {
    return (
      <aside className="rounded-xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border">
        <ShieldCheck className="mb-3 size-5" aria-hidden="true" />
        {t('selectRow')}
      </aside>
    );
  }

  const instruisible = dossier.status === STATUT_INSTRUISIBLE;
  const motifTropCourt = reason.trim().length < MOTIF_LONGUEUR_MIN;

  const rejeter = () => {
    if (motifTropCourt) {
      setError(t('reasonRequired', { min: String(MOTIF_LONGUEUR_MIN) }));
      return;
    }
    mutation.mutate({ action: 'reject' });
  };

  return (
    <aside className="rounded-xl bg-card p-5 ring-1 ring-border" data-testid="kyc-decision-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t('decisionTitle')}
          </p>
          <h2 className="mt-1 truncate font-display text-lg font-semibold text-foreground">
            {nomDuSujet(dossier, t)}
          </h2>
          <p className="text-xs text-muted-foreground">{t('dossierRef', { id: String(dossier.id) })}</p>
        </div>
        <StatusBadge
          tone={KYC_STATUS_TONES[dossier.status] ?? 'neutral'}
          label={tStatus(dossier.status)}
        />
      </div>

      <ul className="mt-4 space-y-1">
        {DOCUMENTS_REQUIS.map((type) => {
          const piece = dossier.documents.find((doc) => doc.document_type === type);
          return (
            <li key={type} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-foreground">{tDocuments(type)}</span>
              {piece ? (
                <a
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  href={piece.signed_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText className="size-3.5" aria-hidden="true" />
                  {t('openDocument')}
                  <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <XCircle className="size-3.5" aria-hidden="true" />
                  {t('documentMissing')}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {dossier.rejection_reason ? (
        <p className="mt-4 rounded-lg bg-muted p-3 text-sm text-foreground">
          {t('previousReason', { reason: dossier.rejection_reason })}
        </p>
      ) : null}

      {instruisible ? (
        <>
          <label className="mt-4 block space-y-2 text-sm font-medium text-foreground">
            <span>{t('reasonLabel')}</span>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('reasonPlaceholder')}
              rows={4}
            />
          </label>

          {error ? <ErrorState className="mt-3" message={error} /> : null}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ action: 'verify' })}
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t('verify')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={mutation.isPending}
              onClick={rejeter}
            >
              <XCircle className="size-4" aria-hidden="true" />
              {t('reject')}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t('notReviewable')}</p>
      )}
    </aside>
  );
}

function nombreDePiecesFournies(dossier: KycDossier): number {
  return DOCUMENTS_REQUIS.filter((type) =>
    dossier.documents.some((doc) => doc.document_type === type),
  ).length;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
