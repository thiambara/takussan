'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useRepondreALaContreOffre } from '@/lib/queries/booking-gestes-du-client';
import type { BookingCounterOffer } from '@/types/booking';

import { jourDeLaContreOffre } from '../detail/contre-offre';

/**
 * TCK-2879 (ADR-0110 § 5 ; non dessinée sur e9) — la contre-offre de l'agence, côté CLIENT : l'encart
 * « L'agence vous propose {montant} jusqu'au {date}. », « Accepter » (primaire) et « Décliner ». Même
 * rendu sur la carte de « Mes réservations » et dans la fiche (où l'avis `counter_offer_received`
 * mène). Accepter confirme l'offre au montant proposé ; l'erreur de l'API se dit sous les gestes.
 */
export function ReponseALaContreOffre({
  bookingId,
  co,
  devise,
  className,
}: {
  readonly bookingId: number;
  readonly co: BookingCounterOffer;
  readonly devise: string | null | undefined;
  readonly className?: string;
}) {
  const t = useTranslations('bookings.client');
  const f = useFormatteurs();
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  const repondre = useRepondreALaContreOffre(bookingId);
  const [erreur, setErreur] = useState<string | null>(null);
  const montant = f.montantCourt(co.amount, devise ?? 'XOF');
  const jour = co.valid_until ? jourDeLaContreOffre(f, co.valid_until) : null;

  async function envoyer(reponse: 'accept' | 'decline') {
    setErreur(null);
    try {
      await repondre.mutateAsync({ contreOffreId: co.id, reponse });
      toast.add({ title: t(reponse === 'accept' ? 'toasts.contreOffreAcceptee' : 'toasts.contreOffreDeclinee'), type: 'success' });
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  return (
    <div data-slot="reponse-a-la-contre-offre" className={className}>
      <p className="rounded-lg bg-warning/15 px-3 py-2 text-sm leading-snug">
        {jour ? t('appel.contreOffre', { montant, date: jour.charAt(0).toLowerCase() + jour.slice(1) }) : t('appel.contreOffreSansDate', { montant })}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <Button type="button" className="h-11 flex-1" disabled={repondre.isPending} onClick={() => void envoyer('accept')}>
          {t('actions.accepter')}
        </Button>
        <Button type="button" variant="ghost" className="h-11 flex-none px-3" disabled={repondre.isPending} onClick={() => void envoyer('decline')}>
          {t('actions.decliner')}
        </Button>
      </div>
      {erreur ? (
        <p role="alert" className="mt-2 text-ui text-destructive">
          {erreur}
        </p>
      ) : null}
    </div>
  );
}
