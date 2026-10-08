'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { PaymentProviderPicker } from './PaymentProviderPicker';
import type { DetailMontantDu } from './montant-du';
import type {
  GatewayPaymentType,
  GatewayProvider,
} from '@/hooks/useInitiatePayment';

interface PayOnlineButtonProps {
  readonly paymentType: GatewayPaymentType;
  readonly paymentId: number | null | undefined;
  readonly currency?: string;
  /**
   * Providers configured for the agency (resolved by the parent page from
   * `GET /api/integrations`). Pass `undefined` to allow all (the modal still
   * uses currency rules to disable mismatched providers); pass `[]` to hide
   * the button entirely.
   */
  readonly availableProviders?: readonly GatewayProvider[];
  readonly disabled?: boolean;
  /**
   * TCK-593 — le montant dû, décomposé tel que l'API le rend. Fourni, il s'affiche sur le bouton
   * (« Payer 150 000 FCFA ») et se détaille dans le sélecteur ; absent, le bouton reste générique.
   */
  readonly montant?: DetailMontantDu;
}

export function PayOnlineButton({
  paymentType,
  paymentId,
  currency,
  availableProviders,
  disabled,
  montant,
}: PayOnlineButtonProps) {
  const t = useTranslations('payments.gateway');
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);

  if (availableProviders !== undefined && availableProviders.length === 0) {
    return null;
  }
  if (!paymentId || !Number.isFinite(paymentId)) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="default"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {montant
          ? t('button.payAmount', {
              amount: formatCurrency(montant.total, locale, { currency: currency ?? 'XOF' }),
            })
          : t('button.payOnline')}
      </Button>
      <PaymentProviderPicker
        open={open}
        onOpenChange={setOpen}
        paymentType={paymentType}
        paymentId={paymentId}
        currency={currency}
        availableProviders={availableProviders}
        montant={montant}
      />
    </>
  );
}
