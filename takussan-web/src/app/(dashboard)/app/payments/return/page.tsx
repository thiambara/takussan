'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useVerifyPayment,
  type GatewayPaymentType,
} from '@/hooks/useInitiatePayment';
import { Button } from '@/components/ui/button';

const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_DURATION_MS = 120_000; // 2 min
const MIN_LOADING_MS = 800;

type StatusBucket = 'pending' | 'success' | 'failed' | 'unknown';

function bucketFor(status: string | null | undefined, hint?: string | null): StatusBucket {
  const value = (status ?? '').toLowerCase();
  if (value === 'paid' || value === 'success') return 'success';
  if (value === 'failed' || value === 'cancelled') return 'failed';
  if (value === 'pending' || value === 'partially_paid' || value === '') {
    if (hint === 'failed') return 'failed';
    if (hint === 'success') return 'success';
    return 'pending';
  }
  return 'unknown';
}

function PaymentReturnInner() {
  const t = useTranslations('payments.gateway');
  const router = useRouter();
  const params = useSearchParams();

  const paymentType = params.get('payment_type') as GatewayPaymentType | null;
  const paymentIdParam = params.get('payment_id');
  const paymentId = paymentIdParam ? Number.parseInt(paymentIdParam, 10) : null;
  const providerHint = params.get('status'); // success / failed / pending — hint from provider

  const [showLoading, setShowLoading] = useState(true);
  const [budgetExhausted, setBudgetExhausted] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  // Always show "verifying" for at least 800 ms so the webhook has a chance.
  useEffect(() => {
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
    }
    const t = setTimeout(() => setShowLoading(false), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, []);

  // Polling is enabled while we still hold a pending bucket and budget remains.
  const isPaymentRefValid = !!paymentType && !!paymentId && Number.isFinite(paymentId);

  const verify = useVerifyPayment(
    (paymentType ?? 'booking-payments') as GatewayPaymentType,
    paymentId,
    {
      enabled: isPaymentRefValid && !budgetExhausted,
      refetchInterval: isPaymentRefValid && !budgetExhausted ? POLL_INTERVAL_MS : false,
    },
  );

  const status = verify.data?.data?.status ?? null;
  const bucket = bucketFor(status, providerHint);
  const reachedTerminal = bucket === 'success' || bucket === 'failed';

  // Schedule a single timer to mark the polling budget exhausted.
  useEffect(() => {
    if (!isPaymentRefValid) return;
    if (reachedTerminal) return;
    const timer = setTimeout(() => {
      setBudgetExhausted(true);
    }, MAX_POLL_DURATION_MS);
    return () => clearTimeout(timer);
  }, [isPaymentRefValid, reachedTerminal]);

  const isVerifying = showLoading || (isPaymentRefValid && !budgetExhausted && bucket === 'pending');

  if (!paymentType || !paymentId) {
    return (
      <main className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t('return.invalid.title')}</h1>
        <p className="mt-3 text-sm text-stone-600">{t('return.invalid.body')}</p>
        <div className="mt-6">
          <Button onClick={() => router.push('/app/payments')}>{t('return.actions.backToPayments')}</Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-foreground">
        {bucket === 'success' && t('return.success.title')}
        {bucket === 'failed' && t('return.failed.title')}
        {bucket === 'pending' && t('return.pending.title')}
        {bucket === 'unknown' && t('return.unknown.title')}
      </h1>
      <p className="mt-3 text-sm text-stone-600">
        {bucket === 'success' && t('return.success.body')}
        {bucket === 'failed' && t('return.failed.body')}
        {(bucket === 'pending' || bucket === 'unknown') && t('return.pending.body')}
      </p>
      {isVerifying && (
        <div
          className="mt-8 flex justify-center"
          aria-live="polite"
          role="status"
        >
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-stone-200 border-t-stone-900" />
        </div>
      )}
      {!isVerifying && (
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={() => router.push('/app/payments')}>{t('return.actions.backToPayments')}</Button>
          {bucket === 'pending' && (
            <Button variant="outline" onClick={() => verify.refetch()}>
              {t('return.actions.refresh')}
            </Button>
          )}
        </div>
      )}
    </main>
  );
}

export default function PaymentReturnPage() {
  return (
    <Suspense fallback={<main className="py-16 text-center text-sm text-stone-500">…</main>}>
      <PaymentReturnInner />
    </Suspense>
  );
}
