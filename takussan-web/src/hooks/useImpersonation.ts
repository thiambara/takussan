'use client';

import { useSyncExternalStore } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  clearImpersonationSession,
  IMPERSONATION_EVENT,
  readImpersonationSession,
  writeImpersonationSession,
  type ImpersonationSession,
} from '@/lib/impersonation';
import {
  postImpersonate,
  postStopImpersonation,
} from '@/lib/queries/super-admin';
import type { ApiError } from '@/lib/api';

function subscribe(notify: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(IMPERSONATION_EVENT, notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener(IMPERSONATION_EVENT, notify);
    window.removeEventListener('storage', notify);
  };
}

export function useImpersonationSession(): ImpersonationSession | null {
  return useSyncExternalStore(
    subscribe,
    () => readImpersonationSession(),
    () => null,
  );
}

export function useImpersonate() {
  return useMutation<
    ImpersonationSession,
    ApiError,
    { targetUserId: number; targetLabel?: string }
  >({
    mutationFn: async ({ targetUserId, targetLabel }) => {
      const res = await postImpersonate(targetUserId);
      const session: ImpersonationSession = {
        token: res.token,
        expires_at: res.expires_at,
        actor_id: res.actor_id,
        target_user_id: res.target_user_id,
        target_label: targetLabel,
      };
      writeImpersonationSession(session);
      return session;
    },
  });
}

export function useStopImpersonation() {
  return useMutation<{ revoked_count: number }, ApiError, void>({
    mutationFn: async () => {
      const current = readImpersonationSession();
      if (!current) return { revoked_count: 0 };
      const res = await postStopImpersonation(current.target_user_id);
      clearImpersonationSession();
      return { revoked_count: res.revoked_count };
    },
  });
}
