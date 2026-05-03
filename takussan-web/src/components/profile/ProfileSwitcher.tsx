'use client';

import { Check, ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { isSuperAdmin } from '@/lib/roles';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import type { Profile, ProfileType } from '@/types/profile';
import { ProfileBadge, profileShortLabel, profileTypeLabel } from './ProfileBadge';

const TYPE_ORDER: ProfileType[] = ['owner', 'agent', 'broker', 'service_provider'];

interface ProfileSwitcherProps {
  user: User;
  className?: string;
}

/**
 * Header switcher for the active profile. Multi-profile users get a menu
 * grouped by profile type. Mono-profile renders a static label only.
 * Pure-admin users (no profile, super_admin / agency_admin without persona)
 * see "Admin Takussan".
 */
export function ProfileSwitcher({ user, className }: ProfileSwitcherProps) {
  const profilesQuery = useMyProfiles();
  const switchMutation = useSwitchActiveProfile();

  const profiles = profilesQuery.data?.data ?? [];
  const activeId = profilesQuery.data?.meta.active_profile_id ?? null;
  const active = profiles.find((p) => p.id === activeId) ?? null;

  const grouped = useMemo(() => {
    const map = new Map<ProfileType, Profile[]>();
    for (const t of TYPE_ORDER) map.set(t, []);
    for (const p of profiles) {
      const list = map.get(p.type);
      if (list) list.push(p);
    }
    return map;
  }, [profiles]);

  if (profilesQuery.isLoading) {
    return (
      <span
        data-testid="profile-switcher-loading"
        className={cn('h-8 w-32 animate-pulse rounded-md bg-white/10', className)}
        aria-hidden="true"
      />
    );
  }

  if (profiles.length === 0) {
    if (isSuperAdmin(user.roles)) {
      return (
        <span
          data-testid="profile-switcher-admin-label"
          className={cn('hidden items-center gap-2 rounded-md px-2 py-1 text-sm text-white/80 sm:inline-flex', className)}
        >
          Admin Takussan
        </span>
      );
    }
    return null;
  }

  if (profiles.length === 1) {
    const only = profiles[0];
    return (
      <span
        data-testid="profile-switcher-static"
        className={cn(
          'hidden items-center gap-2 rounded-md px-2 py-1 text-sm text-white/90 sm:inline-flex',
          className,
        )}
      >
        <ProfileBadge profile={only} variant="dot" />
        <span className="truncate max-w-[14rem]">{profileShortLabel(only)}</span>
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="profile-switcher-trigger"
        aria-label="Changer de profil"
        disabled={switchMutation.isPending}
        className={cn(
          'inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none transition-colors text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60',
          className,
        )}
      >
        {active ? (
          <>
            <ProfileBadge profile={active} variant="dot" />
            <span className="truncate max-w-[14rem]">{profileShortLabel(active)}</span>
          </>
        ) : (
          <span>Choisir un profil</span>
        )}
        <ChevronDown className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        {TYPE_ORDER.map((type) => {
          const list = grouped.get(type) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={type} role="group" aria-label={profileTypeLabel(type)}>
              <DropdownMenuLabel>{profileTypeLabel(type)}</DropdownMenuLabel>
              {list.map((profile) => {
                const isActive = profile.id === activeId;
                return (
                  <DropdownMenuItem
                    key={profile.id}
                    data-testid={`profile-switcher-item-${profile.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    disabled={switchMutation.isPending}
                    onClick={() => {
                      if (isActive || switchMutation.isPending) return;
                      switchMutation.mutate(profile.id);
                    }}
                    className="flex items-start justify-between gap-3"
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{profile.agency?.name ?? profileTypeLabel(type)}</span>
                      {profile.agency?.slug ? (
                        <span className="text-xs text-app-ink-muted">{profile.agency.slug}</span>
                      ) : null}
                    </span>
                    {isActive ? <Check className="size-4 text-emerald-600" aria-hidden="true" /> : null}
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
