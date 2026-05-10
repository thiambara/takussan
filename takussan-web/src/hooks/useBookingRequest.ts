'use client';
import { useState } from 'react';
import { submitBookingRequest } from '@/app/actions/property';
import type { BookingRequestPayload } from '@/types/visit';
import { useTriggerMinimalProfileOnce } from '@/hooks/useTriggerMinimalProfileOnce';

export function useBookingRequest(slug: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // TCK-253 — Booking is a strong-intent signal; nudge the customer to
  // share city + search_intent (sheet runs in parallel, never blocks).
  const { triggerIfNeeded } = useTriggerMinimalProfileOnce();

  async function submit(payload: BookingRequestPayload): Promise<void> {
    setSubmitting(true);
    setError(null);
    // Fire the trigger as we begin the request — the sheet opens
    // alongside the spinner, not after the round-trip.
    triggerIfNeeded();
    try {
      const res = await submitBookingRequest(slug, payload);
      if (!res.ok) {
        setError(res.message);
        throw new Error(res.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}
