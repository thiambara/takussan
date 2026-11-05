'use client';

import { Check, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { espacesAProposer, slugAAfficher } from '@/lib/espaces';
import { isSuperAdmin } from '@/lib/roles';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user';
import { PROFILE_TYPES, type Profile, type ProfileType } from '@/types/profile';
import { ProfileBadge, profileShortLabel, profileTypeLabel } from './ProfileBadge';

/**
 * L'ordre d'affichage des regroupements, dérivé de `PROFILE_TYPES` par un rang
 * EXHAUSTIF — et non recopié à la main.
 *
 * ⚠ La version précédente était une liste littérale de quatre types. Elle
 * n'omettait pas seulement le libellé d'`agency_admin` : `grouped` est construit
 * en n'initialisant la Map que sur `TYPE_ORDER`, si bien qu'un profil
 * `agency_admin` était **écarté du menu sans trace** (`map.get(p.type)` rend
 * `undefined`, la ligne `if (list)` l'avale). Un administrateur d'agence ayant
 * aussi un profil owner ne pouvait donc plus revenir sur son profil admin.
 *
 * `Record<ProfileType, number>` est exhaustif : ajouter un type à
 * `PROFILE_TYPES` sans lui donner de rang ici casse la compilation (TCK-329 AC5).
 */
const TYPE_RANK: Record<ProfileType, number> = {
  agency_admin: 0,
  owner: 1,
  agent: 2,
  service_provider: 3,
};

const TYPE_ORDER: ProfileType[] = [...PROFILE_TYPES].sort((a, b) => TYPE_RANK[a] - TYPE_RANK[b]);

interface ProfileSwitcherProps {
  readonly user: User;
  readonly className?: string;
  /**
   * TCK-2478 — `barre` (défaut) : le déclencheur de la barre haute, inchangé. `carte` : l'en-tête
   * d'espace de la barre latérale (`EnTeteDEspace`), une carte pleine largeur visible à TOUTES les
   * largeurs — elle vit aussi dans le tiroir mobile, qui recouvre la barre haute.
   */
  readonly variante?: 'barre' | 'carte';
  /** `carte` — le libellé du persona (« Administrateur »), seconde ligne de la carte. */
  readonly libelle?: string;
  /** `carte` — le verbe du déclencheur (« Changer d’espace »), en tête de son nom accessible. */
  readonly libelleChanger?: string;
}

const STYLE_CARTE = 'flex w-full items-center gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-left text-foreground';

/** Le contenu de la carte : le nom de l'agence en gras, puis le persona ; le persona seul sans agence. */
function ContenuDeCarte({ nom, libelle }: { readonly nom: string | null; readonly libelle: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-semibold">{nom ?? libelle}</span>
      {nom ? <span className="block truncate text-xs text-muted-foreground">{libelle}</span> : null}
    </span>
  );
}

/**
 * Header switcher for the active profile. Multi-profile users get a menu
 * grouped by profile type. Mono-profile renders a static label only.
 * Pure-admin users (no profile, super_admin / agency_admin without persona)
 * see "Admin Takussan".
 */
export function ProfileSwitcher({
  user,
  className,
  variante = 'barre',
  libelle = '',
  libelleChanger = '',
}: ProfileSwitcherProps) {
  const t = useTranslations('profile.switcher');
  const tTypes = useTranslations('profile.types');
  const profilesQuery = useMyProfiles();
  const switchMutation = useSwitchActiveProfile();

  const activeId = profilesQuery.data?.meta.active_profile_id ?? null;
  // TCK-497 — ce qu'on PROPOSE n'est plus exactement ce que l'API LISTE. Une
  // agence `individual` porte deux profils pour une seule personne, dont le
  // sélecteur tirait deux lignes identiques au caractère près. Le contrat ne
  // change pas — `espacesAProposer` ne fusionne que l'affichage, et le résolveur
  // de capacités fait déjà un OR entre les profils d'une même agence.
  const profiles = espacesAProposer(profilesQuery.data?.data ?? [], activeId);
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

  const carte = variante === 'carte';

  if (profilesQuery.isLoading) {
    if (carte) {
      return (
        <span
          data-testid="profile-switcher-loading"
          className={cn('block h-12 w-full animate-pulse rounded-lg bg-muted', className)}
          aria-hidden="true"
        />
      );
    }
    return (
      <span
        data-testid="profile-switcher-loading"
        className={cn('h-8 w-32 animate-pulse rounded-md bg-card/10', className)}
        aria-hidden="true"
      />
    );
  }

  // TCK-2478 — la carte sans choix (aucun profil, ou un seul espace) : la même carte, sans bouton ni
  // chevron. Un client sans profil y lit son persona (« Client »).
  if (carte && profiles.length <= 1) {
    const seul = profiles[0] ?? null;
    return (
      <div data-testid="profile-switcher-static" className={cn(STYLE_CARTE, className)}>
        <ContenuDeCarte nom={seul?.agency?.name ?? null} libelle={libelle} />
      </div>
    );
  }

  if (profiles.length === 0) {
    if (isSuperAdmin(user.roles)) {
      return (
        <span
          data-testid="profile-switcher-admin-label"
          className={cn('hidden items-center gap-2 rounded-md px-2 py-1 text-sm text-primary-foreground/80 lg:inline-flex', className)}
        >
          {t('adminLabel')}
        </span>
      );
    }
    return null;
  }

  // TCK-505 (#1) — sous `lg`, rien : un libellé statique n'est pas un contrôle, et son point seul
  // (8 px, `aria-hidden`) ne dit rien. Le déclencheur multi-profils, lui, garde point + chevron
  // pour que le changement de profil reste possible à 768 px ; seul son libellé se cache.
  if (profiles.length === 1) {
    const only = profiles[0];
    return (
      <span
        data-testid="profile-switcher-static"
        className={cn(
          'hidden items-center gap-2 rounded-md px-2 py-1 text-sm text-primary-foreground/90 lg:inline-flex',
          className,
        )}
      >
        <ProfileBadge profile={only} variant="dot" className="ring-1 ring-primary-foreground/70" />
        <span className="truncate max-w-[14rem]">{profileShortLabel(only, tTypes)}</span>
      </span>
    );
  }

  const nomCarte = active?.agency?.name ?? (active ? null : t('choose'));

  return (
    <DropdownMenu>
      {carte ? (
        <DropdownMenuTrigger
          data-testid="profile-switcher-trigger"
          aria-label={[libelleChanger, nomCarte, libelle].filter(Boolean).join(' — ')}
          disabled={switchMutation.isPending}
          className={cn(
            STYLE_CARTE,
            'outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
            className,
          )}
        >
          <ContenuDeCarte nom={nomCarte} libelle={libelle} />
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          data-testid="profile-switcher-trigger"
          aria-label={t('changeAria')}
          disabled={switchMutation.isPending}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none transition-colors text-primary-foreground hover:bg-card/10 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
            className,
          )}
        >
          {active ? (
            <>
              <ProfileBadge profile={active} variant="dot" className="ring-1 ring-primary-foreground/70" />
              <span className="hidden lg:inline truncate max-w-[14rem]">{profileShortLabel(active, tTypes)}</span>
            </>
          ) : (
            <span>{t('choose')}</span>
          )}
          <ChevronDown className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align={carte ? 'start' : 'end'} className="min-w-64">
        {TYPE_ORDER.map((type) => {
          const list = grouped.get(type) ?? [];
          if (list.length === 0) return null;
          return (
            <div key={type} role="group" aria-label={profileTypeLabel(type, tTypes)}>
              <DropdownMenuLabel>{profileTypeLabel(type, tTypes)}</DropdownMenuLabel>
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
                      <span className="font-medium">{profile.agency?.name ?? profileTypeLabel(type, tTypes)}</span>
                      {slugAAfficher(profile) ? (
                        <span className="text-xs text-muted-foreground">
                          {slugAAfficher(profile)}
                        </span>
                      ) : null}
                    </span>
                    {isActive ? <Check className="size-4 text-success" aria-hidden="true" /> : null}
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
