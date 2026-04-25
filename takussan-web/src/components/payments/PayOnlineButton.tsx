'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { PaymentProviderPicker } from './PaymentProviderPicker';
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
}

export function PayOnlineButton({
  paymentType,
  paymentId,
  currency,
  availableProviders,
  disabled,
}: PayOnlineButtonProps) {
  const t = useTranslations('payments.gateway');
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
        {t('button.payOnline')}
      </Button>
      <PaymentProviderPicker
        open={open}
        onOpenChange={setOpen}
        paymentType={paymentType}
        paymentId={paymentId}
        currency={currency}
        availableProviders={availableProviders}
      />
    </>
  );
}
