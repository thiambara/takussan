'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
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

function profileLabel(profile: Profile | undefined): string {
  if (!profile) return 'profil';
  if (profile.agency?.name) return profile.agency.name;
  return profile.type;
}

type SwitchContext = {
  previousProfiles: MyProfilesResponse | undefined;
};

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
  const router = useRouter();
  const toast = useToast();

  return useMutation<{ data: Profile }, ApiError, string, SwitchContext>({
    mutationFn: patchActiveProfileViaProxy,
    onMutate: async (profileId) => {
      // Optimistically flip the active id so the menu's check mark moves
      // before the network round-trip resolves. Snapshot the previous value
      // for rollback in `onError`.
      await queryClient.cancelQueries({ queryKey: profilesKeys.all });
      const previousProfiles = queryClient.getQueryData<MyProfilesResponse>(profilesKeys.all);
      if (previousProfiles) {
        queryClient.setQueryData<MyProfilesResponse>(profilesKeys.all, {
          ...previousProfiles,
          meta: { ...previousProfiles.meta, active_profile_id: profileId },
        });
      }
      return { previousProfiles };
    },
    onSuccess: (_data, profileId) => {
      const profiles = queryClient.getQueryData<MyProfilesResponse>(profilesKeys.all);
      const switched = profiles?.data.find((p) => p.id === profileId);
      toast.add({
        title: `Espace basculé sur ${profileLabel(switched)}`,
        type: 'success',
      });
      // Re-render server components with the new cookie context so dashboard
      // pages refetch under the right team_id.
      router.refresh();
    },
    onError: (err, _profileId, context) => {
      if (context?.previousProfiles) {
        queryClient.setQueryData(profilesKeys.all, context.previousProfiles);
      }
      toast.add({
        title: 'Impossible de basculer de profil',
        description: err.displayMessage,
        type: 'error',
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profilesKeys.all }),
        // TCK-135 — custom roles and permission catalogue are scoped by
        // active profile's agency, so swapping profiles must drop both.
        queryClient.invalidateQueries({ queryKey: ['roles'] }),
        queryClient.invalidateQueries({ queryKey: ['permissions'] }),
        refreshUser(),
      ]);
    },
  });
}
