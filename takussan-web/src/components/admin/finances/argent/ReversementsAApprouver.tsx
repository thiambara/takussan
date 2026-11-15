'use client';

import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { usePayoutApprove, usePayoutCancel } from '@/lib/queries/payments';
import type { Payout } from '@/types/invoice';

import type { GestesDeLArgent } from './gestes';

/** Les lectures de la synthèse du mois (`agencyReportingKeys.financeSummary`) et de ses files. */
const estLaSynthese = ({ queryKey }: { readonly queryKey: readonly unknown[] }) => queryKey[0] === 'agencies' && queryKey[2] === 'finance';

/**
 * TCK-2922 — les gestes EN LIGNE d'un reversement à approuver, sur la carte « À faire · reversements à
 * approuver » du bureau (maquette `app-argent`, approche A, e0) : « Refuser » et « Approuver », et
 * « Examiner » qui ouvre le détail.
 *
 * - **Approuver** est le geste du détail (`POST /api/payouts/{id}/approve`), second facteur compris :
 *   `useApiMutation` résout lui-même le refus `two_factor_step_up_required` (TCK-589) puis rejoue.
 *   Le détail garde la destination PRÉVUE quand il y en a une (son choix par défaut) : c'est ce que fait
 *   la ligne. Sans destination prévue (hors caution rendue), le détail en propose une à choisir — la ligne
 *   y mène alors au lieu d'approuver sans. Celui qui a préparé le reversement n'approuve pas (les quatre
 *   yeux, `SegregationOfDuties`) : le bouton le dit, désactivé.
 * - **Refuser** annule le reversement (`POST /api/payouts/{id}/cancel`) avec son MOTIF, que l'API garde
 *   (`metadata.cancel_reason`). L'annulation suit `PayoutPolicy::update` (le préparateur, ou
 *   `payouts.create`), pas `payouts.approve` : sans elle, pas de « Refuser » plutôt qu'un 403.
 *
 * Une fois le geste abouti, la file (`['payouts']`) et la synthèse du mois se relisent : la ligne part.
 */
export function GestesDUnReversement({
  p,
  gestes,
  onRefuser,
}: {
  readonly p: Payout;
  readonly gestes: GestesDeLArgent;
  readonly onRefuser: (p: Payout) => void;
}) {
  const t = useTranslations('admin.finances.argent.aFaire');
  const tDetail = useTranslations('payments.payoutDetail');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const approuver = usePayoutApprove(p.id);
  const [erreur, setErreur] = useState<string | null>(null);
  const raisonId = useId();
  const reference = p.reference_number ?? t('reversementSansReference');
  const preparateur = user != null && p.issued_by_id === user.id;
  const sansDestinationPrevue = !p.payout_method_masked && p.payee_role !== 'tenant';
  const peutRefuser = gestes.peutAnnulerUnReversement || preparateur;

  const surApprouver = async () => {
    if (sansDestinationPrevue) {
      gestes.ouvrirReversement(p.id);
      return;
    }
    setErreur(null);
    try {
      await approuver.mutateAsync(undefined);
      void queryClient.invalidateQueries({ predicate: estLaSynthese });
    } catch (e) {
      setErreur(messageErreur(e, t('approuveEchec')));
    }
  };

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" aria-label={t('examinerAria', { reference })} onClick={() => gestes.ouvrirReversement(p.id)}>
          {t('examiner')}
        </Button>
        {peutRefuser ? (
          <Button type="button" variant="ghost" size="sm" aria-label={t('refuserAria', { reference })} onClick={() => onRefuser(p)}>
            {t('refuser')}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          aria-label={t('approuverAria', { reference })}
          disabled={preparateur || approuver.isPending}
          aria-describedby={preparateur ? raisonId : undefined}
          onClick={() => void surApprouver()}
          className="gap-1.5"
        >
          <Check className="size-3.5" aria-hidden="true" />
          {t('approuver')}
        </Button>
      </span>
      {preparateur ? (
        <span id={raisonId} className="sr-only">
          {tDetail('approveSelfRefused')}
        </span>
      ) : null}
      {erreur ? (
        <span role="alert" className="text-ui text-destructive">
          {erreur}
        </span>
      ) : null}
    </span>
  );
}

/** « Refuser » : le motif (obligatoire ici), puis l'annulation. */
export function RefuserUnReversement({ p, onFermer }: { readonly p: Payout; readonly onFermer: () => void }) {
  const t = useTranslations('admin.finances.argent.aFaire');
  const f = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const annuler = usePayoutCancel(p.id);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const id = useId();
  const reference = p.reference_number ?? t('reversementSansReference');
  const pret = motif.trim() !== '';

  const confirmer = async () => {
    if (!pret) return;
    setErreur(null);
    try {
      await annuler.mutateAsync({ reason: motif.trim() });
      void queryClient.invalidateQueries({ predicate: estLaSynthese });
      onFermer();
    } catch (e) {
      setErreur(messageErreur(e, t('refus.echec')));
    }
  };

  return (
    // Le dialogue étroit des gestes du bureau (520 px, celui des commissions), sans importer leur module (frontière i18n).
    <Dialog open onOpenChange={(o) => (o ? undefined : onFermer())}>
      <DialogContent className="flex max-h-[calc(100dvh-var(--spacing)*16)] flex-col gap-0 overflow-hidden p-0 ring-border sm:max-w-[32.5rem]">
        <div className="flex flex-none items-start gap-3 border-b border-border py-4 pr-12 pl-6">
          <DialogTitle className="min-w-0 flex-1 font-display text-lg font-semibold tracking-titre">{t('refus.titre', { reference })}</DialogTitle>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-6 py-5">
            <div className="flex items-start gap-2.5 rounded-lg bg-destructive/10 px-3 py-2.5 text-ui leading-snug">
              <TriangleAlert className="mt-px size-4 flex-none text-destructive" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1">{t('refus.detail', { montant: f.montantCourt(p.net_amount, p.currency) })}</span>
            </div>
            <label htmlFor={`${id}-motif`} className="mt-5 mb-2 block text-sm font-medium">
              {t('refus.motif')} <span className="font-normal text-muted-foreground">{t('refus.motifAide')}</span>
            </label>
            <Textarea
              id={`${id}-motif`}
              value={motif}
              maxLength={500}
              rows={3}
              required
              placeholder={t('refus.motifExemple')}
              onChange={(e) => setMotif(e.target.value)}
            />
            {erreur ? (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {erreur}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-none items-center justify-end gap-2 border-t border-border bg-muted/40 px-6 py-3">
          <Button type="button" variant="ghost" onClick={onFermer}>
            {t('refus.garder')}
          </Button>
          <Button
            type="button"
            disabled={!pret || annuler.isPending}
            onClick={() => void confirmer()}
            className="bg-destructive text-background hover:bg-destructive/90"
          >
            {t('refus.confirmer')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
