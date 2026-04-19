'use client';
import { useState } from 'react';
import { submitVisitRequest } from '@/app/actions/property';
import type { VisitRequestPayload } from '@/types/visit';

export function useVisitRequest(slug: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: VisitRequestPayload): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitVisitRequest(slug, payload);
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
