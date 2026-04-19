'use client';
import { useState } from 'react';
import { submitPropertyReport } from '@/app/actions/property';
import type { ReportPayload } from '@/types/visit';

export function useReportProperty(slug: string) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(payload: ReportPayload): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitPropertyReport(slug, payload);
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
