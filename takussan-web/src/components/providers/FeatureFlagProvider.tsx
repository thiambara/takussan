'use client';

import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import type { FeatureFlagsMeResponse } from '@/types/super-admin';

type FeatureFlagContextValue = {
  flags: Record<string, boolean>;
  isLoading: boolean;
};

const FeatureFlagContext = createContext<FeatureFlagContextValue>({ flags: {}, isLoading: false });

async function fetchFlags(): Promise<FeatureFlagsMeResponse> {
  const res = await fetch('/api/feature-flags/me');
  return res.json() as Promise<FeatureFlagsMeResponse>;
}

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  // `/api/feature-flags/me` is auth-only (auth:sanctum). Skip the request for
  // anonymous visitors — flags default to {} (every `useFeatureFlag` → false).
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['feature-flags', 'me'],
    queryFn: fetchFlags,
    staleTime: 60_000,
    enabled: Boolean(user),
  });

  return (
    <FeatureFlagContext.Provider value={{ flags: query.data?.data ?? {}, isLoading: query.isLoading }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlag(key: string): boolean {
  return useContext(FeatureFlagContext).flags[key] ?? false;
}
