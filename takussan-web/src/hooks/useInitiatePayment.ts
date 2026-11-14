'use client';

import type { Query } from '@tanstack/react-query';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import type { ApiError } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';

/**
 * TCK-079 — initiate / verify a payment via the backend gateway.
 *
 * Endpoint shape:
 *   POST /api/{paymentType}/{paymentId}/initiate     { provider, return_url?, cancel_url? }
 *   GET  /api/{paymentType}/{paymentId}/verify
 *
 * `paymentType` is one of `booking-payments`, `lease-payments`, `invoices`.
 * The hook accepts the type as the discriminator; the caller is responsible
 * for passing it along when redirecting from a Booking / Lease / Invoice view.
 */
export type GatewayPaymentType = 'booking-payments' | 'lease-payments' | 'invoices';

export type GatewayProvider = 'wave' | 'orange_money' | 'lemon_squeezy';

export interface InitiatePaymentVariables {
  readonly provider: GatewayProvider;
  readonly returnUrl?: string;
  readonly cancelUrl?: string;
}

export interface InitiatePaymentResult {
  readonly checkout_url: string;
  readonly transaction_id: string;
  readonly provider: GatewayProvider;
}

export interface VerifyPaymentResult {
  readonly status: string | null;
  readonly provider_status?: string;
  readonly transaction_id?: string;
  /**
   * TCK-596 (VERIF-596 passe 8, m-o) — le règlement vérifié a débité le payeur sans rien solder
   * (échéance annulée par un renouvellement, ou déjà réglée) : l'agence doit le rembourser.
   */
  readonly refund_pending?: boolean;
  /**
   * TCK-2650 — ce que la page de retour nomme (montant, période, fournisseur, référence), lu sur le
   * serveur, jamais dans l'adresse. Optionnel : absent, la page ne dit que l'issue.
   */
  readonly payment?: PaiementVerifie | null;
}

export interface PaiementVerifie {
  readonly amount?: number | null;
  /**
   * Le montant demandé au dernier checkout : la ligne, plus la pénalité de retard quand l'agence
   * l'encaisse en ligne. `null` sans checkout. C'est lui que le fournisseur débite.
   */
  readonly checkout_amount?: number | null;
  /**
   * La part de pénalité de retard de ce checkout, telle que l'initiation l'a figée (décision 6a du
   * porteur) : `0` sans pénalité, `null` sans checkout. Jamais déduite d'une soustraction.
   */
  readonly checkout_late_fee_amount?: number | null;
  readonly currency?: string | null;
  readonly payment_type?: string | null;
  readonly reference_number?: string | null;
  readonly provider?: string | null;
  readonly lease_id?: number | null;
  readonly period_start?: string | null;
  readonly period_end?: string | null;
  readonly paid_at?: string | null;
}

const STORAGE_KEY = 'tks.payments.lastProvider';

export function rememberProviderPreference(provider: GatewayProvider): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, provider);
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function readProviderPreference(): GatewayProvider | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === 'wave' || value === 'orange_money' || value === 'lemon_squeezy') {
      return value;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Mutation that initiates the checkout. Caller is responsible for redirecting
 * to `data.checkout_url` (the modal does this on success).
 */
export function useInitiatePayment(paymentType: GatewayPaymentType, paymentId: number) {
  return useApiMutation<ApiResponse<InitiatePaymentResult>, InitiatePaymentVariables>({
    path: `/api/${paymentType}/${paymentId}/initiate`,
    method: 'POST',
    body: (variables) => ({
      provider: variables.provider,
      return_url: variables.returnUrl,
      cancel_url: variables.cancelUrl,
    }),
  }, {
    // Un 409 (« déjà payée » : réglée ailleurs entre la lecture et le geste) relit le résumé du loyer et
    // l'historique : la page cesse d'offrir un paiement qui n'a plus lieu d'être (TCK-2650, TCK-2625).
    invalidate: [['me', 'rent-summary'], ['payments', 'history']],
    relireSurErreur: true,
  });
}

/**
 * Polling-friendly status query. The return page invokes this on a 15s
 * cadence and aborts after `max_attempts`.
 */
export function useVerifyPayment(
  paymentType: GatewayPaymentType,
  paymentId: number | null,
  options?: {
    readonly enabled?: boolean;
    /** Un délai fixe, ou — TCK-2650 — une fonction qui lit la dernière réponse pour s'arrêter. */
    readonly refetchInterval?: number | false | ((query: Query<ApiResponse<VerifyPaymentResult>, ApiError>) => number | false);
  },
) {
  return useApiQuery<ApiResponse<VerifyPaymentResult>>(
    ['payments', 'verify', paymentType, paymentId] as const,
    cheminApi`/api/${paymentType}/${paymentId ?? 0}/verify`,
    {
      enabled: Boolean(paymentId) && (options?.enabled ?? true),
      refetchInterval: options?.refetchInterval ?? false,
    },
  );
}
