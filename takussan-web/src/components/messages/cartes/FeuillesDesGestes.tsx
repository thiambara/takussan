'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Textarea } from '@/components/ui/textarea';
import { cheminApi } from '@/lib/chemin-api';
import { cn } from '@/lib/utils';

import { useErreurDuGeste } from './CadreDeCarte';
import { clesDeLObjet, useGesteDeLaCarte } from './useGesteDeLaCarte';

/**
 * TCK-2962 — les deux gestes d'une carte qui demandent une saisie, en feuille (téléphone) ou panneau
 * (bureau), sur la route de l'objet. Leurs textes vivent sous `messaging` : le fil est atteint depuis la
 * racine (le widget public), où les espaces `maintenance` et `lease` ne sont pas servis
 * (`check-i18n-namespaces`) — d'où ces feuilles plutôt que `QuoteRejectionModal` et `LeasePaymentDialog`.
 */

/** `RejectQuoteRequest` : un motif d'au moins 10 caractères (la règle de `QuoteRejectionModal`), 1000 au plus. */
export const MOTIF_MIN = 10;
const MOTIF_MAX = 1000;

interface FeuilleProps {
  readonly conversationId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** « Refuser » un devis : `POST /api/maintenance-requests/{id}/quote/reject` avec le motif. */
export function RefuserLeDevis({ conversationId, interventionId, open, onOpenChange }: FeuilleProps & { readonly interventionId: number }) {
  const t = useTranslations('messaging.cartes.refusDuDevis');
  const erreurDuGeste = useErreurDuGeste();
  const envoi = useGesteDeLaCarte(conversationId, clesDeLObjet.intervention());
  const [motif, setMotif] = useState('');
  const pret = motif.trim().length >= MOTIF_MIN && !envoi.isPending;
  const formulaire = `refuser-le-devis-${interventionId}`;

  const fermer = (o: boolean) => {
    if (!o) {
      setMotif('');
      envoi.reset();
    }
    onOpenChange(o);
  };

  return (
    <FeuilleDuBas
      open={open}
      onOpenChange={fermer}
      titre={t('titre')}
      pied={
        <Button type="submit" form={formulaire} variant="destructive" size="lg" className="w-full" disabled={!pret}>
          {t('envoyer')}
        </Button>
      }
    >
      <form
        id={formulaire}
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pret) return;
          envoi.mutate(
            { chemin: cheminApi`/api/maintenance-requests/${interventionId}/quote/reject`, corps: { reason: motif.trim() } },
            { onSuccess: () => fermer(false) },
          );
        }}
      >
        <label htmlFor={`${formulaire}-motif`} className="block text-sm font-medium">
          {t('motif')}
        </label>
        <Textarea profil="texte-long" id={`${formulaire}-motif`} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t('motifPlaceholder')} maxLength={MOTIF_MAX} rows={3} />
        <p className="text-xs text-muted-foreground">{t('aide', { min: MOTIF_MIN })}</p>
        {envoi.error ? (
          <p role="alert" className="text-xs text-destructive">
            {erreurDuGeste(envoi.error)}
          </p>
        ) : null}
      </form>
    </FeuilleDuBas>
  );
}

/** Les moyens d'un encaissement à la main (`PaymentMethod`, ceux que `LeasePaymentDialog` propose). */
export const MOYENS_D_ENCAISSEMENT = ['cash', 'bank_transfer', 'mobile_money', 'check', 'card'] as const;
type Moyen = (typeof MOYENS_D_ENCAISSEMENT)[number];

/** « Encaisser à la main » : `POST /api/lease-payments/{id}/mark-paid`, réglée aujourd'hui, avec son moyen. */
export function EncaisserALaMain({
  conversationId,
  paiementId,
  bailId,
  montant,
  open,
  onOpenChange,
}: FeuilleProps & { readonly paiementId: number; readonly bailId: number | null | undefined; readonly montant: string }) {
  const t = useTranslations('messaging.cartes.encaissement');
  const erreurDuGeste = useErreurDuGeste();
  const envoi = useGesteDeLaCarte(conversationId, clesDeLObjet.echeance(bailId));
  const [moyen, setMoyen] = useState<Moyen>('cash');

  const fermer = (o: boolean) => {
    if (!o) envoi.reset();
    onOpenChange(o);
  };

  return (
    <FeuilleDuBas
      open={open}
      onOpenChange={fermer}
      titre={t('titre')}
      pied={
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={envoi.isPending}
          onClick={() =>
            envoi.mutate({ chemin: cheminApi`/api/lease-payments/${paiementId}/mark-paid`, corps: { payment_method: moyen } }, { onSuccess: () => fermer(false) })
          }
        >
          {t('envoyer')}
        </Button>
      }
    >
      <p className="text-sm leading-relaxed text-muted-foreground">{t('texte', { montant })}</p>
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-medium">{t('moyen')}</legend>
        <div className="flex flex-wrap gap-2">
          {MOYENS_D_ENCAISSEMENT.map((m) => (
            <label
              key={m}
              className={cn(
                'inline-flex min-h-10 cursor-pointer items-center rounded-full px-3.5 text-sm font-medium outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring',
                moyen === m ? 'bg-foreground text-background' : 'bg-muted text-foreground',
              )}
            >
              <input type="radio" name={`moyen-${paiementId}`} value={m} checked={moyen === m} onChange={() => setMoyen(m)} className="sr-only" />
              {t(`moyens.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {envoi.error ? (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {erreurDuGeste(envoi.error)}
        </p>
      ) : null}
    </FeuilleDuBas>
  );
}
