'use client';

import { useState, useTransition, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Laptop, Smartphone } from 'lucide-react';
import { StatusBadge } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { RangeeDeSecurite } from './RangeeDeSecurite';
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

/** Le nom d'une session qui dit un téléphone : son icône (le nom vient du jeton, rien de plus sûr). */
const MOBILE = /android|iphone|ipad|mobile/i;

export function ActiveSessionsSection() {
  const t = useTranslations('profile.security.sessions');
  const fmt = useFormatteurs();
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

  // TCK-2635 — « Appareils connectés » (maquette `SectionSecurite`) : un titre de bloc, le nombre de
  // sessions, puis une rangée par session dans une carte à filets. La session courante se dit, et ne
  // se révoque pas d'ici (même invariant que l'API).
  return (
    <section aria-labelledby="titre-des-sessions">
      <div className="mb-2">
        <h3 id="titre-des-sessions" className="text-corps font-semibold">
          {t('title')}
        </h3>
        <p className="text-ui text-muted-foreground">
          {sessions && sessions.length > 0 ? t('compte', { n: sessions.length }) : t('description')}
        </p>
      </div>

      {(error ?? queryError) ? (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error ?? queryError}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">{tCommon('loading')}</p>
      ) : !sessions || sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
          {sessions.map((session) => (
            <li key={session.id}>
              <RangeeDeSecurite
                icone={MOBILE.test(session.name ?? '') ? Smartphone : Laptop}
                titre={session.name || t('unnamed')}
                niveau="h4"
                statut={session.current ? <StatusBadge tone="info" label={t('currentShort')} /> : undefined}
                detail={[
                  `${t('lastActivity')} ${session.last_used_at ? fmt.dateTime(session.last_used_at) : t('unknown')}`,
                  session.ip ? t('ip', { ip: session.ip }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                action={
                  session.current ? undefined : (
                    <Button variant="outline" size="sm" disabled={revoke.isPending} onClick={() => handleRevoke(session.id)}>
                      {t('revoke')}
                    </Button>
                  )
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
