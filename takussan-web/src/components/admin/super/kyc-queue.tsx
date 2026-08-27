'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { Building2, ExternalLink, FileText, ShieldCheck, XCircle } from 'lucide-react';

import { DataTable, StatusBadge, type DataTableColumn, type StatusTone } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
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
 * Le marqueur DOM d'un libellé de sujet qui est un repli — cf. `nomDuSujet`.
 *
 * Il ne sert qu'aux tests, et c'est délibéré : l'AC2 doit pouvoir affirmer « aucune ligne ne
 * retombe sur un repli » sans énumérer les libellés de repli, qui changent. La version précédente
 * cherchait `/Agence #\d+/` — une forme qui ne matchait NI « Agence supprimée (#12) » NI
 * « User #7 » : l'assertion restait verte sur un écran entièrement en repli.
 */
export const REPLI_SUJET_TESTID = 'kyc-subject-fallback';

/**
 * Les codes que `KycWorkflowService` émet sur ses refus 422 — les seuls que CE panneau peut
 * atteindre.
 *
 * ⚠ Le `message` de ces refus est de l'ANGLAIS codé en dur côté serveur, et `messageErreurApi`
 * préfère délibérément la prose serveur (elle la suppose localisée par `Accept-Language`, ce
 * qu'un `abort()` n'est pas). Le repli `t('decisionFailed')` écrit pour ces cas n'était donc
 * JAMAIS atteint : « Only submitted KYC dossiers can be reviewed. » s'affichait mot pour mot à un
 * opérateur francophone — principe non négociable n°5 violé sur le chemin même que TCK-362 ouvre.
 *
 * Le cas se rencontre normalement, pas exceptionnellement : `staleTime` vaut 15 s et rien ne
 * rafraîchit la file toute seule, donc deux opérateurs — ou un seul revenu à son onglet — voient
 * un statut périmé.
 */
const CODES_REFUS_KYC = {
  transitionRefusee: 'kyc.not_transitionable',
  documentsManquants: 'kyc.documents_missing',
} as const;

/** Le `code` d'un refus 422 de l'API KYC, quand il y en a un. */
function codeRefusKyc(erreur: unknown): string | undefined {
  if (!(erreur instanceof ApiError) || erreur.status !== 422) return undefined;
  const corps = erreur.data;
  if (!corps || typeof corps !== 'object' || !('code' in corps)) return undefined;
  const brut = (corps as { code?: unknown }).code;
  return typeof brut === 'string' ? brut : undefined;
}

/**
 * Le libellé du sujet — et, quand ce n'en est pas un, le fait que c'est un REPLI.
 *
 * TCK-362 (AC2) — l'écran affichait « Agence #12 » pour TOUTES les lignes : `KycDossierResource`
 * n'émettait pas le sujet. Il l'émet désormais sous `include=subject`.
 *
 * ⚠ **Les trois cas de repli ne disent PAS la même chose, et un seul autorise « supprimée ».**
 * La première version les confondait sous `agencyFallback` (« Agence supprimée (#12) ») : l'écran
 * AFFIRMAIT une suppression qu'il n'avait pas constatée, y compris sur TOUTES les lignes le jour
 * où l'API cesserait d'émettre `subject`. Une console qui affirme ce qu'elle ne sait pas est pire
 * qu'une console qui l'avoue — c'est sur cet écran que se décide la vie d'une agence.
 *
 * | ce que la réponse porte | ce qu'on sait | libellé |
 * |---|---|---|
 * | `subject: {name: 'Dakar Immo'}` | le nom | « Dakar Immo » |
 * | `subject: null` | le sujet est **supprimé** | « Agence supprimée (#12) » |
 * | `subject: {type: 'User'}` | un sujet d'un AUTRE type | « User #7 » |
 * | pas de clé `subject` | **rien** — l'`include` a été omis | « Agence #12 » |
 *
 * Le dernier cas rend délibérément la forme d'AVANT le ticket : c'est celle que l'assertion d'AC2
 * cherche. Et `repli` est rendu dans le DOM (`data-testid`), pour que cette assertion attrape
 * **tout** repli, y compris un cinquième qu'on ajouterait demain.
 */
export function nomDuSujet(
  dossier: KycDossier,
  t: (key: string, values?: Record<string, string>) => string,
): { libelle: string; repli: boolean } {
  const id = String(dossier.subject_id);

  // `undefined` ≠ `null` : l'un dit « je n'ai pas demandé le sujet », l'autre « il n'y en a plus ».
  if (dossier.subject === undefined) return { libelle: t('agencyUnknown', { id }), repli: true };
  if (dossier.subject === null) return { libelle: t('agencyFallback', { id }), repli: true };

  const nom = dossier.subject.name?.trim();
  if (nom) return { libelle: nom, repli: false };

  return { libelle: t('subjectFallback', { type: dossier.subject.type, id }), repli: true };
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
  // TCK-364 — la locale ACTIVE, pas 'fr-FR'. Ce fichier est né APRÈS le relevé de TCK-364 et
  // portait donc à nouveau le helper module-level que ce ticket existe pour supprimer : un
  // fichier neuf n'entre en conflit avec rien, et l'AC « le grep 'fr-FR' ne renvoie rien » avait
  // été mesuré sur une base où celui-ci n'existait pas encore. Gardé par check-locale-figee.mjs.
  const fmt = useFormatteurs();

  const columns: DataTableColumn<KycDossier>[] = [
    {
      id: 'agency',
      header: t('columns.agency'),
      cell: (dossier) => {
        const sujet = nomDuSujet(dossier, t);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p
                className="truncate font-semibold text-foreground"
                data-testid={sujet.repli ? REPLI_SUJET_TESTID : undefined}
              >
                {sujet.libelle}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t('dossierRef', { id: String(dossier.id) })}
              </p>
            </div>
          </div>
        );
      },
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
      cell: (dossier) => fmt.dateTime(dossier.submitted_at),
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
  // TCK-364 — la locale ACTIVE, pas 'fr-FR'. Ce fichier est né APRÈS le relevé de TCK-364 et
  // portait donc à nouveau le helper module-level que ce ticket existe pour supprimer : un
  // fichier neuf n'entre en conflit avec rien, et l'AC « le grep 'fr-FR' ne renvoie rien » avait
  // été mesuré sur une base où celui-ci n'existait pas encore. Gardé par check-locale-figee.mjs.
  const fmt = useFormatteurs();
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
    /*
     * ⚠ Les deux refus de workflow sont NOMMÉS avant tout repli sur la prose serveur — cf.
     * `CODES_REFUS_KYC`. Le front possède ces deux libellés, et il redemande la file dans la
     * foulée : dans les deux cas, ce que l'écran affiche est périmé, et le dire sans le corriger
     * laisserait l'opérateur recliquer sur la même ligne.
     */
    onError: (err: ApiError) => {
      const code = codeRefusKyc(err);
      if (code === CODES_REFUS_KYC.transitionRefusee || code === CODES_REFUS_KYC.documentsManquants) {
        setError(t(code === CODES_REFUS_KYC.transitionRefusee ? 'staleDecision' : 'incompleteDossier'));
        void queryClient.invalidateQueries({ queryKey: ['super-admin', 'kyc'] });
        return;
      }
      setError(messageErreur(err, t('decisionFailed')));
    },
  });

  if (!dossier) {
    return (
      <aside className="rounded-xl bg-card p-5 text-sm text-muted-foreground ring-1 ring-border">
        <ShieldCheck className="mb-3 size-5" aria-hidden="true" />
        {t('selectRow')}
      </aside>
    );
  }

  const sujet = nomDuSujet(dossier, t);
  const instruisible = dossier.status === STATUT_INSTRUISIBLE;
  /*
   * ⚠ `.trim()` des DEUX côtés — la garde ici, et le corps envoyé plus haut.
   *
   * Sans le premier, six espaces passent la garde du front, partent sur le réseau et reviennent
   * en 422 : `TrimStrings` (middleware GLOBAL de Laravel) replie la chaîne à vide avant
   * `RejectKycDossierRequest`, et l'opérateur reçoit une erreur de validation à la place du
   * message que le front lui avait promis. Sans le second, un motif entouré d'espaces est
   * journalisé en audit tel quel. Les deux sont gardés (« un motif d'espaces », « un motif
   * entouré d'espaces »), parce que les retirer laissait la suite verte.
   */
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
          <h2
            className="mt-1 truncate font-display text-lg font-semibold text-foreground"
            data-testid={sujet.repli ? REPLI_SUJET_TESTID : undefined}
          >
            {sujet.libelle}
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

