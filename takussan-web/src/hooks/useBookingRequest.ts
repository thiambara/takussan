'use client';
import { useState } from 'react';
import { submitBookingRequest } from '@/app/actions/property';
import type { BookingRequestPayload } from '@/types/visit';

export function useBookingRequest(slug: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: BookingRequestPayload): Promise<void> {
    setSubmitting(true);
    setError(null);
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
