'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { espacesAProposer, slugAAfficher } from '@/lib/espaces';
import { PROFILE_TYPES, type Profile, type ProfileType } from '@/types/profile';
import { profileTypeLabel } from './ProfileBadge';

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

/**
 * Les espaces du compte, regroupés par type et dans l'ordre de `TYPE_ORDER` — la lecture et la bascule
 * de profil (`useMyProfiles`, `useSwitchActiveProfile`).
 */
function useEspacesDuCompte() {
  const profilesQuery = useMyProfiles();
  const switchMutation = useSwitchActiveProfile();
  const activeId = profilesQuery.data?.meta.active_profile_id ?? null;
  // TCK-497 — ce qu'on PROPOSE n'est plus exactement ce que l'API LISTE. Une
  // agence `individual` porte deux profils pour une seule personne, dont le
  // sélecteur tirait deux lignes identiques au caractère près. Le contrat ne
  // change pas — `espacesAProposer` ne fusionne que l'affichage, et le résolveur
  // de capacités fait déjà un OR entre les profils d'une même agence.
  const profiles = espacesAProposer(profilesQuery.data?.data ?? [], activeId);
  const grouped = new Map<ProfileType, Profile[]>();
  for (const type of TYPE_ORDER) grouped.set(type, []);
  for (const p of profiles) grouped.get(p.type)?.push(p);
  return { switchMutation, activeId, profiles, grouped };
}

/**
 * TCK-2491 (ADR-0090 §2) — le changement d'espace, DANS le menu du compte de la colonne de `/app` : les
 * éléments de menu des espaces (un groupe par type, l'espace actif coché), à poser dans un
 * `DropdownMenuContent`. Rien quand il n'y a pas de choix (aucun espace, ou un seul) : il n'y a alors
 * rien à changer, et le pied de la colonne dit déjà l'espace.
 *
 * Il hérite de `ProfileSwitcher`, le sélecteur de l'ancienne barre du haut, retiré avec elle (revue
 * adverse de TCK-2491) : même lecture, même mutation, mêmes règles (TCK-329, TCK-497).
 */
export function EspacesDuMenu({ titre }: { readonly titre?: string }) {
  const tTypes = useTranslations('profile.types');
  const { switchMutation, activeId, profiles, grouped } = useEspacesDuCompte();
  if (profiles.length <= 1) return null;
  return (
    <>
      {titre ? <DropdownMenuLabel className="pb-0 font-medium text-foreground">{titre}</DropdownMenuLabel> : null}
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
                  data-testid={`espace-du-menu-${profile.id}`}
                  aria-current={isActive ? 'true' : undefined}
                  disabled={switchMutation.isPending}
                  onClick={() => {
                    if (isActive || switchMutation.isPending) return;
                    switchMutation.mutate(profile.id);
                  }}
                  className="flex items-start justify-between gap-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="break-words font-medium">{profile.agency?.name ?? profileTypeLabel(type, tTypes)}</span>
                    {slugAAfficher(profile) ? (
                      <span className="break-words text-xs text-muted-foreground">{slugAAfficher(profile)}</span>
                    ) : null}
                  </span>
                  {isActive ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> : null}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
          </div>
        );
      })}
    </>
  );
}
