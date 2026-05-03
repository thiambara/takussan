'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import type { MyProfilesResponse, Profile } from '@/types/profile';

export const profilesKeys = {
  all: ['me', 'profiles'] as const,
};

async function fetchProfilesViaProxy(): Promise<MyProfilesResponse> {
  const res = await fetch('/api/me/profiles', { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json();
}

async function patchActiveProfileViaProxy(profileId: string): Promise<{ data: Profile }> {
  const res = await fetch('/api/me/active-profile', {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data);
  }
  return res.json();
}

export function useMyProfiles() {
  const { user } = useAuth();
  return useQuery<MyProfilesResponse, ApiError>({
    queryKey: profilesKeys.all,
    queryFn: fetchProfilesViaProxy,
    enabled: !!user,
    staleTime: 30_000,
  });
}

export function useSwitchActiveProfile() {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();

  return useMutation<{ data: Profile }, ApiError, string>({
    mutationFn: patchActiveProfileViaProxy,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
        queryClient.invalidateQueries({ queryKey: profilesKeys.all }),
        refreshUser(),
      ]);
    },
  });
}
