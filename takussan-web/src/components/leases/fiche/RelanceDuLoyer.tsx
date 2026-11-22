'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import { isReachable } from '@/components/crm/contact';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { Button, buttonVariants } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useAccesAdmin } from '@/lib/access/acces-admin-contexte';
import { useIssuePaymentLink, type LeaseWithRelations } from '@/lib/queries/leases';
import { cn } from '@/lib/utils';
import type { LeasePayment } from '@/types/lease';

/** L'écran Impayés, où vit LA relance (TCK-2660, décision du porteur du 2026-11-14, n° 16 b). */
const ECRAN_DES_IMPAYES = '/app/agency/finances';

/**
 * TCK-2818 — la relance d'un impayé depuis la fiche du bail. La fiche n'embarque pas la relance : elle
 * MÈNE à l'écran Impayés, qui l'ouvre depuis son adresse (TCK-2775 : `?tab=impayes&relance=<échéance>
 * &bail=<bail>`). Même aide (`useRelanceDUnImpaye`), même message, même lien de paiement, même note
 * que la file « À traiter » des baux et que l'écran — aucune copie (ADR-0105).
 *
 * Qui la voit : celui qui peut OUVRIR l'écran Impayés de l'agence du bail — la page `/app/agency/finances`
 * figure dans ses pages d'administration (`PAGES_ADMIN`, calculées par le layout de `/app`), et le bail
 * est de son agence active. Le locataire, le bailleur, un agent sans accès à l'écran ne la voient pas.
 * Sans fournisseur de ces pages, rien n'est offert (FAIL-CLOSED).
 *
 * Quelle échéance : une échéance EN RETARD (`is_overdue`, la règle de l'API, qui est celle de l'écran :
 * `days_late ≥ 1`). La pénalité seule restée due sur un loyer PAYÉ (TCK-2778) n'est pas un impayé de
 * l'écran : la fiche ne la relance pas (la file « À traiter » le fait).
 *
 * Sans numéro joignable (la règle de la file, TCK-2644) : « Copier le lien de paiement », avec la raison,
 * et aucun lien `wa.me`.
 */
export function useRelanceDeLaFiche(lease: LeaseWithRelations, locataire: boolean) {
  const acces = useAccesAdmin();
  const { user } = useAuth();
  const permise =
    !locataire &&
    lease.type !== 'sale' &&
    acces !== null &&
    acces.chemins.includes(ECRAN_DES_IMPAYES) &&
    user?.agency_id != null &&
    lease.agency_id === user.agency_id;
  const joignable = isReachable(lease.tenant?.phone);
  return {
    /** L'échéance se relance-t-elle depuis la fiche, pour ce lecteur ? */
    relancable: (p: LeasePayment) => permise && p.is_overdue && p.status !== 'paid' && p.status !== 'cancelled',
    joignable,
    /** L'adresse de l'écran Impayés qui ouvre la relance de cette échéance. */
    lien: (p: LeasePayment) => `${ECRAN_DES_IMPAYES}?tab=impayes&relance=${p.id}&bail=${lease.id}`,
  };
}

export type RelanceDeLaFiche = ReturnType<typeof useRelanceDeLaFiche>;

/** La carte Loyer : « Relancer » (vers l'écran Impayés), ou, sans numéro, le lien à copier et la raison. */
export function RelancerLeLoyer({ relance, echeance }: { readonly relance: RelanceDeLaFiche; readonly echeance: LeasePayment }) {
  const t = useTranslations('lease.fiche.loyer');
  const tRelance = useTranslations('lease.liste.relance');
  const tLien = useTranslations('lease.schedule.paymentLink');
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const lien = useIssuePaymentLink();
  const [copie, setCopie] = useState(false);
  const raisonId = useId();

  if (relance.joignable) {
    return (
      <Link href={relance.lien(echeance)} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-3 gap-1.5 bg-card')} data-testid="relancer-le-loyer">
        <IconeWhatsApp className="size-4" />
        {t('relancer')}
      </Link>
    );
  }

  // Le geste de « Copier le lien de paiement » de l'échéancier (TCK-602) : le lien n'est créé qu'au clic.
  const copier = async () => {
    try {
      const { data } = await lien.mutateAsync({ paymentId: echeance.id });
      try {
        await navigator.clipboard.writeText(data.url);
        setCopie(true);
      } catch {
        // Presse-papiers refusé : le lien s'affiche à la place.
        toast.add({ title: tLien('ready'), description: data.url, type: 'success' });
      }
    } catch (e) {
      toast.add({ title: tRelance('lienEchec'), description: messageErreur(e), type: 'error' });
    }
  };

  return (
    <div className="mt-3" data-testid="relancer-le-loyer">
      <Button type="button" variant="outline" size="sm" className="bg-card" aria-describedby={raisonId} aria-disabled={lien.isPending ? true : undefined} onClick={() => void (!lien.isPending && copier())}>
        {copie ? tRelance('lienCopie') : tRelance('copierLeLien')}
      </Button>
      <p id={raisonId} className="mt-2 text-ui text-muted-foreground">
        {tRelance('sansTelephone')}
      </p>
    </div>
  );
}
