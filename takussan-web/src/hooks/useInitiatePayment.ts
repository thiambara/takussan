'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
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
  });
}

/**
 * Polling-friendly status query. The return page invokes this on a 15s
 * cadence and aborts after `max_attempts`.
 */
export function useVerifyPayment(
  paymentType: GatewayPaymentType,
  paymentId: number | null,
  options?: { readonly enabled?: boolean; readonly refetchInterval?: number | false },
) {
  return useApiQuery<ApiResponse<VerifyPaymentResult>>(
    ['payments', 'verify', paymentType, paymentId] as const,
    `/api/${paymentType}/${paymentId ?? 0}/verify`,
    {
      enabled: Boolean(paymentId) && (options?.enabled ?? true),
      refetchInterval: (options?.refetchInterval ?? false) as number | false,
    },
  );
}
