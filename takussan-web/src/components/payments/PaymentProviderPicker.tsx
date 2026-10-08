'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  rememberProviderPreference,
  readProviderPreference,
  useInitiatePayment,
  type GatewayPaymentType,
  type GatewayProvider,
} from '@/hooks/useInitiatePayment';

import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { checkoutEnCours } from './checkout-en-cours';
import type { DetailMontantDu } from './montant-du';

interface ProviderOption {
  readonly id: GatewayProvider;
  /** Clé sous `payments.gateway.picker.providers.*` — le libellé se résout au rendu (TCK-292). */
  readonly labelKey: GatewayProvider;
  /** Codes ISO de devise : ce n'est PAS du texte traduisible. */
  readonly hint: string;
}

const PROVIDERS: readonly ProviderOption[] = [
  { id: 'wave', labelKey: 'wave', hint: 'XOF' },
  { id: 'orange_money', labelKey: 'orange_money', hint: 'XOF' },
  { id: 'lemon_squeezy', labelKey: 'lemon_squeezy', hint: 'USD/EUR' },
] as const;

interface PaymentProviderPickerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly paymentType: GatewayPaymentType;
  readonly paymentId: number;
  /**
   * Currency of the underlying payment row (XOF / USD / EUR…). Used to
   * disable providers whose currency support won't match.
   */
  readonly currency?: string;
  /**
   * List of providers configured for the agency. Drives which tiles are
   * enabled. Pass an empty array if the user must contact admin first.
   */
  readonly availableProviders?: readonly GatewayProvider[];
  /** TCK-593 — le montant dû, décomposé : loyer, puis pénalité quand elle est encaissée en ligne. */
  readonly montant?: DetailMontantDu;
}

const PROVIDER_CURRENCY_SUPPORT: Record<GatewayProvider, (c: string) => boolean> = {
  wave: (c) => c.toUpperCase() === 'XOF',
  orange_money: (c) => c.toUpperCase() === 'XOF',
  lemon_squeezy: (c) => c.toUpperCase() !== 'XOF' && c.toUpperCase() !== 'XAF',
};

export function PaymentProviderPicker({
  open,
  onOpenChange,
  paymentType,
  paymentId,
  currency = 'XOF',
  availableProviders,
  montant,
}: PaymentProviderPickerProps) {
  const t = useTranslations('payments.gateway');
  const locale = useLocale() as Locale;
  const enDevise = (valeur: number) => formatCurrency(valeur, locale, { currency });
  const messageErreur = useMessageErreurApi();
  // Derive an initial preference from localStorage (set once at mount of the
  // component instance — the parent uses `open` to mount/unmount the modal,
  // so each open builds a fresh instance with the current preference).
  const initialPreference = useMemo<GatewayProvider | null>(() => {
    const remembered = readProviderPreference();
    if (remembered) return remembered;
    if (availableProviders && availableProviders.length > 0) return availableProviders[0];
    return null;
    // We deliberately exclude `availableProviders` from deps: this is the
    // "first-paint" default; later switches are user-driven via `setSelected`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selected, setSelected] = useState<GatewayProvider | null>(initialPreference);
  const [error, setError] = useState<string | null>(null);

  const initiate = useInitiatePayment(paymentType, paymentId);

  const isProviderAvailable = useMemo(() => {
    return (provider: GatewayProvider): boolean => {
      const currencyOk = PROVIDER_CURRENCY_SUPPORT[provider](currency);
      if (!currencyOk) return false;
      if (!availableProviders) return true;
      return availableProviders.includes(provider);
    };
  }, [availableProviders, currency]);

  async function handleConfirm(): Promise<void> {
    if (!selected) return;
    setError(null);
    try {
      const result = await initiate.mutateAsync({
        provider: selected,
        returnUrl: typeof window !== 'undefined'
          ? `${window.location.origin}/app/payments/return?status=pending&payment_type=${paymentType}&payment_id=${paymentId}`
          : undefined,
      });
      rememberProviderPreference(selected);
      const url = result.data?.checkout_url;
      if (url && typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (e) {
      // Passe 2, N2 — un checkout vit déjà, à un autre montant : on dit lequel, et jusqu'à quand.
      const enCours = checkoutEnCours(e);
      setError(
        enCours
          ? t('error.checkoutInProgress', {
              amount: formatCurrency(enCours.montant, locale, { currency: enCours.devise }),
              time: formatDate(enCours.reessayerApres, locale, { dateStyle: undefined, timeStyle: 'short' }),
            })
          : messageErreur(e, t('error.generic')),
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('picker.title')}</DialogTitle>
          <DialogDescription>{t('picker.description')}</DialogDescription>
        </DialogHeader>

        {montant && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
              <dt className="text-muted-foreground">{t('breakdown.rent')}</dt>
              <dd className="text-right text-foreground">{enDevise(montant.loyer)}</dd>
              {montant.penaliteIncluse > 0 && (
                <>
                  <dt className="text-muted-foreground">{t('breakdown.lateFee')}</dt>
                  <dd className="text-right text-foreground">{enDevise(montant.penaliteIncluse)}</dd>
                </>
              )}
              <dt className="border-t border-border pt-1 font-medium text-foreground">
                {t('breakdown.total')}
              </dt>
              <dd
                className="border-t border-border pt-1 text-right font-semibold text-foreground"
                data-testid="montant-total"
              >
                {enDevise(montant.total)}
              </dd>
            </dl>
            {montant.penaliteHorsLigne > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('breakdown.lateFeeAtAgency', { amount: enDevise(montant.penaliteHorsLigne) })}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 py-2">
          {PROVIDERS.map((provider) => {
            const enabled = isProviderAvailable(provider.id);
            const isSelected = selected === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && setSelected(provider.id)}
                aria-pressed={isSelected}
                aria-label={`${t('picker.select')} ${t(`picker.providers.${provider.labelKey}`)}`}
                title={enabled ? undefined : t('picker.unavailable')}
                className={[
                  'flex items-center justify-between rounded-xl border p-4 text-left transition',
                  enabled ? 'cursor-pointer hover:border-border' : 'cursor-not-allowed opacity-50',
                  isSelected ? 'border-border ring-2 ring-border/10' : 'border-border',
                ].join(' ')}
              >
                <div>
                  <p className="font-medium text-foreground">
                    {t(`picker.providers.${provider.labelKey}`)}
                  </p>
                  <p className="text-xs text-muted-foreground">{provider.hint}</p>
                </div>
                {!enabled && (
                  <span className="text-xs text-muted-foreground">
                    {t('picker.contactAdmin')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={initiate.isPending}>
            {t('picker.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selected || initiate.isPending || (selected !== null && !isProviderAvailable(selected))}
          >
            {initiate.isPending ? t('picker.redirecting') : t('picker.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
