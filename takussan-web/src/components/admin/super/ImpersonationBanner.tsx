'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { useImpersonationSession, useStopImpersonation } from '@/hooks/useImpersonation';

/**
 * Global non-dismissible banner shown whenever a super-admin has an active
 * impersonation session (TCK-145). Mounted in the super-admin shell so the
 * cross-tenant context is unmistakable. The Stop button calls the
 * super-admin namespace endpoint with the operator's own session — see
 * TCK-144 notes for the dual-token rationale.
 */
export function ImpersonationBanner() {
  // TCK-292 — hook posé AVANT la sortie anticipée `if (!session) return null` : un
  // `useTranslations` placé après serait un hook conditionnel, refusé par le React Compiler.
  const t = useTranslations('superAdmin.impersonation');
  const session = useImpersonationSession();
  const stopMutation = useStopImpersonation();

  if (!session) return null;

  const expiresAt = new Date(session.expires_at);
  const expiresLabel = Number.isFinite(expiresAt.getTime())
    ? expiresAt.toLocaleString()
    : t('unknownExpiry');

  return (
    <div
      role="alert"
      data-testid="impersonation-banner"
      className="flex flex-wrap items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4" aria-hidden="true" />
        <span>
          {t('banner', {
            target: session.target_label ?? t('fallbackUser', { id: session.target_user_id }),
            expires: expiresLabel,
          })}
        </span>
      </div>
      <button
        type="button"
        onClick={() => stopMutation.mutate()}
        disabled={stopMutation.isPending}
        className="inline-flex items-center rounded-md bg-stone-900 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-stone-800 disabled:opacity-60"
      >
        {stopMutation.isPending ? t('stopping') : t('stop')}
      </button>
    </div>
  );
}
