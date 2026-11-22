'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { rememberProviderPreference, useInitiatePayment, type GatewayPaymentType, type GatewayProvider } from '@/hooks/useInitiatePayment';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { Locale } from '@/i18n/config';
import { formatCurrency, formatDate } from '@/lib/format';

import { checkoutEnCours } from './checkout-en-cours';

/**
 * Ouvrir le paiement d'une ligne chez un fournisseur, puis y envoyer le payeur. Une seule écriture,
 * lue par le sélecteur générique (`PaymentProviderPicker`) et par la feuille du locataire (TCK-2650) :
 * les adresses de retour et d'annulation portent la même référence (TCK-1291), et un checkout déjà
 * ouvert à un autre montant se dit avec son montant et son heure (passe 2, N2).
 */
export function useLancerLePaiement(paymentType: GatewayPaymentType, paymentId: number) {
  const t = useTranslations('payments.gateway');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const initiate = useInitiatePayment(paymentType, paymentId);
  const [erreur, setErreur] = useState<string | null>(null);

  async function lancer(provider: GatewayProvider): Promise<void> {
    setErreur(null);
    try {
      // TCK-1291 (P131.01) — l'adresse d'annulation porte la même référence que celle de retour :
      // sans elle, Wave et Orange Money retombent sur `…/return?status=failed` nu, que la page de
      // retour rend en « Lien de retour incorrect ».
      const retour = (statut: 'pending' | 'failed') =>
        typeof window !== 'undefined'
          ? `${window.location.origin}/app/payments/return?status=${statut}&payment_type=${paymentType}&payment_id=${paymentId}`
          : undefined;
      const result = await initiate.mutateAsync({
        provider,
        returnUrl: retour('pending'),
        cancelUrl: retour('failed'),
      });
      rememberProviderPreference(provider);
      const url = result.data?.checkout_url;
      if (url && typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (e) {
      // Passe 2, N2 — un checkout vit déjà, à un autre montant : on dit lequel, et jusqu'à quand.
      const enCours = checkoutEnCours(e);
      setErreur(
        enCours
          ? t('error.checkoutInProgress', {
              amount: formatCurrency(enCours.montant, locale, { currency: enCours.devise }),
              time: formatDate(enCours.reessayerApres, locale, { dateStyle: undefined, timeStyle: 'short' }),
            })
          : messageErreur(e, t('error.generic')),
      );
    }
  }

  return { lancer, erreur, enCours: initiate.isPending };
}
