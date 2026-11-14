'use client';

/**
 * TCK-267, TCK-2671 — l'état de la dernière demande de passage en pro, EN TÊTE de la page
 * (maquette `app-identite-agence`, écran 9 : `StatutDemande`).
 *
 * - Refusée : le motif d'abord, puis « remplacez la pièce, le reste est conservé » — le formulaire
 *   dessous reprend la demande (`resubmit_of`, ADR-0104 § 5).
 * - En cours : « Révoquer la demande », après confirmation (la révocation ne se défait pas).
 * - Les dates suivent la langue de l'écran (`useFormatteurs`) : elles étaient formatées en `fr-FR`
 *   écrit en dur.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { StatusBadge, type StatusTone } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { revokeAgencyUpgradeRequest } from '@/lib/queries/agency-upgrade';
import { cn } from '@/lib/utils';
import type { AgencyUpgradeRequest } from '@/types/agency-upgrade';

export type UpgradeRequestStatusProps = {
  readonly agencyId: number;
  readonly request: AgencyUpgradeRequest;
};

/** Le sens de chaque statut ; la couleur reste décidée par `StatusBadge`. */
const STATUS_TONE: Record<AgencyUpgradeRequest['status'], StatusTone> = {
  pending: 'attention',
  approved: 'success',
  rejected: 'danger',
  revoked: 'neutral',
};

const FOND: Record<AgencyUpgradeRequest['status'], string> = {
  pending: 'border-warning/30 bg-warning/10',
  approved: 'border-success/25 bg-success/10',
  rejected: 'border-destructive/25 bg-destructive/6',
  revoked: 'border-border bg-card',
};

export function UpgradeRequestStatus({ agencyId, request }: UpgradeRequestStatusProps) {
  const t = useTranslations('agency.upgrade.status');
  const messageErreur = useMessageErreurApi();
  const fmt = useFormatteurs();
  const { token } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [confirmer, setConfirmer] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const soumise = request.submitted_at ? fmt.jourMois(request.submitted_at) : null;
  const decidee = request.reviewed_at ? fmt.jourMois(request.reviewed_at) : null;

  async function handleRevoke() {
    if (!token || revoking) return;
    setRevoking(true);
    try {
      await revokeAgencyUpgradeRequest(token, agencyId, request.id);
      setConfirmer(false);
      toast.add({ title: t('toasts.revoked'), type: 'success' });
      router.refresh();
    } catch (error) {
      toast.add({ title: t('toasts.echecRevocation'), description: messageErreur(error, t('toasts.echecRevocationRepli')), type: 'error' });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section aria-labelledby={`demande-${request.id}-titre`} className={cn('rounded-xl border p-4', FOND[request.status])}>
      <div className="flex items-center gap-2">
        <h2 id={`demande-${request.id}-titre`} className="min-w-0 flex-1 font-display text-titre-court font-semibold tracking-titre text-balance">
          {t(`headings.${request.status}`)}
        </h2>
        <StatusBadge tone={STATUS_TONE[request.status]} label={t(`badges.${request.status}`)} className="shrink-0 whitespace-nowrap" />
      </div>

      <p className="mt-1 text-sm text-pretty text-encre-douce">
        {request.status === 'rejected'
          ? t('corps.refusee', { date: decidee ?? '—' })
          : request.status === 'approved'
            ? t('body.approved', { date: decidee ?? '—' })
            : request.status === 'pending'
              ? t('corps.enCours')
              : t('body.revoked')}
      </p>

      {request.status === 'rejected' && request.review_comment ? (
        <p className="mt-2.5 rounded-lg bg-card px-3 py-2 text-sm font-medium text-pretty">{t('motif', { motif: request.review_comment })}</p>
      ) : null}

      {soumise ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {request.status === 'rejected' ? t('soumiseEtDecidee', { date: soumise }) : t('submitted_at', { date: soumise })}
        </p>
      ) : null}

      {request.status === 'pending' ? (
        <>
          <Button type="button" variant="outline" className="mt-3 max-md:w-full" onClick={() => setConfirmer(true)}>
            {t('cta.revoke')}
          </Button>
          <Dialog open={confirmer} onOpenChange={(ouvert) => !revoking && setConfirmer(ouvert)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('confirmation.titre')}</DialogTitle>
                <DialogDescription>{t('confirmation.texte')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>{t('confirmation.garder')}</DialogClose>
                <Button type="button" variant="destructive" aria-busy={revoking || undefined} onClick={handleRevoke}>
                  {revoking ? t('cta.revoking') : t('confirmation.revoquer')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </section>
  );
}
