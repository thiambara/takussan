'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

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

/**
 * Libellé d'un espace. `secours` est le repli quand le profil n'a pas encore été chargé — il
 * arrive traduit de l'appelant, ce module n'ayant pas accès aux hooks (patron TCK-286 : la donnée
 * porte la clé, le rendu la résout).
 */
function profileLabel(profile: Profile | undefined, secours: string): string {
  if (!profile) return secours;
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
  const t = useTranslations('profile.switcher');
  const messageErreur = useMessageErreurApi();

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
        title: t('switched', { name: profileLabel(switched, t('fallbackLabel')) }),
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
        title: t('switchFailed'),
        description: messageErreur(err, t('switchFailed')),
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
