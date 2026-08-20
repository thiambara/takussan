'use client';

import { useState, useTransition, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  listActiveSessionsAction,
  revokeSessionAction,
} from '@/app/actions/security';
import type { ActiveSession } from '@/lib/security';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-069 — Sessions actives. Lists Sanctum personal access tokens for the
 * current user; the token flagged `current: true` cannot be revoked from
 * this UI (user must log out instead — same invariant as the backend).
 *
 * Uses TanStack Query so the React Compiler doesn't flag a synchronous
 * `setState()` inside a `useEffect` (cascading renders warning).
 */
const SESSIONS_KEY = ['security', 'sessions'] as const;

export function ActiveSessionsSection() {
  const t = useTranslations('profile.security.sessions');
  const tCommon = useTranslations('common.status');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const query = useQuery<ActiveSession[], Error>({
    queryKey: SESSIONS_KEY,
    queryFn: async () => {
      const result = await listActiveSessionsAction();
      if (!result.ok) throw new Error(result.message);
      return result.data;
    },
  });

  const revoke = useMutation({
    mutationFn: async (sessionId: number) => {
      const result = await revokeSessionAction(sessionId);
      if (!result.ok) throw new Error(result.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });

  const handleRevoke = useCallback(
    (sessionId: number) => {
      setError(null);
      startTransition(() => {
        revoke.mutate(sessionId, {
          onError: (err) => setError(messageErreur(err)),
        });
      });
    },
    [revoke, messageErreur],
  );

  const sessions = query.data ?? null;
  const loading = query.isPending;
  const queryError = query.error ? messageErreur(query.error) : null;

  return (
    <div className="rounded-2xl border border-app-surface-3 bg-white p-6">
      <div>
        <h3 className="text-base font-semibold text-app-ink">{t('title')}</h3>
        <p className="mt-1 text-sm text-app-ink-muted">
          {t('description')}
        </p>
      </div>

      {(error ?? queryError) ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error ?? queryError}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-app-ink-muted">{tCommon('loading')}</p>
      ) : !sessions || sessions.length === 0 ? (
        <p className="mt-4 text-sm text-app-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-2 rounded-md border border-app-surface-3 bg-app-surface-1 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-app-ink">
                  {session.name || t('unnamed')}
                  {session.current ? (
                    <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      {t('current')}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-app-ink-muted">
                  {t('lastActivity')}{' '}
                  {session.last_used_at
                    ? new Date(session.last_used_at).toLocaleString('fr-FR')
                    : t('unknown')}
                </p>
                {session.ip ? (
                  <p className="text-xs text-app-ink-muted">{t('ip', { ip: session.ip })}</p>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={session.current || revoke.isPending}
                onClick={() => handleRevoke(session.id)}
                className={session.current ? '' : 'text-red-600 hover:text-red-700'}
              >
                {session.current ? t('currentShort') : t('revoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
