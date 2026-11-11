'use client';

import { useTranslations } from 'next-intl';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useMyProfiles, useSwitchActiveProfile } from '@/hooks/useProfiles';
import { espacesAProposer, sousLigneDEspace } from '@/lib/espaces';
import { cn } from '@/lib/utils';
import { PROFILE_TYPES, type Profile, type ProfileType } from '@/types/profile';
import { IndicateurDeChoix, SigleDEspace } from './ChoixDEspace';
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
      {titre ? <DropdownMenuLabel className="pb-1 font-medium text-muted-foreground">{titre}</DropdownMenuLabel> : null}
      {/* TCK-2621 — une ligne par espace : sigle, agence, « rôle · ville », coche. Le groupe par rôle reste
          (ordre et `role="group"` nommé) ; son intitulé visible est parti, le rôle étant sur chaque ligne. */}
      <div className="space-y-1 px-0.75 pb-1">
        {TYPE_ORDER.map((type) => {
          const list = grouped.get(type) ?? [];
          if (list.length === 0) return null;
          const role = profileTypeLabel(type, tTypes);
          return (
            <div key={type} role="group" aria-label={role} className="space-y-1">
              {list.map((profile) => {
                const isActive = profile.id === activeId;
                const nom = profile.agency?.name ?? role;
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
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-2',
                      isActive ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
                    )}
                  >
                    <SigleDEspace nom={nom} actif={isActive} className="size-9 rounded-xl text-xs" />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate text-sm font-semibold">{nom}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {sousLigneDEspace(role, profile.agency?.city)}
                      </span>
                    </span>
                    <IndicateurDeChoix actif={isActive} />
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}
      </div>
      <DropdownMenuSeparator />
    </>
  );
}

/**
 * TCK-2619 — le même changement d'espace, dans la FEUILLE du compte (téléphone) : des boutons de 48 px
 * au lieu d'éléments de menu (une feuille est un dialogue, pas un `menu`). Même lecture, même mutation,
 * mêmes règles ; rien quand il n'y a pas de choix.
 */
export function EspacesDeLaFeuille({ titre }: { readonly titre: string }) {
  const tTypes = useTranslations('profile.types');
  const { switchMutation, activeId, profiles, grouped } = useEspacesDuCompte();
  if (profiles.length <= 1) return null;
  return (
    <section data-slot="espaces-de-la-feuille" aria-label={titre} className="pb-2">
      <p className="pb-2 pt-1 text-xs font-medium text-muted-foreground">{titre}</p>
      <ul className="space-y-2">
        {TYPE_ORDER.flatMap((type) =>
          (grouped.get(type) ?? []).map((profile) => {
            const isActive = profile.id === activeId;
            const role = profileTypeLabel(type, tTypes);
            const nom = profile.agency?.name ?? role;
            return (
              <li key={profile.id}>
                <button
                  type="button"
                  data-testid={`espace-de-la-feuille-${profile.id}`}
                  aria-current={isActive ? 'true' : undefined}
                  disabled={switchMutation.isPending}
                  onClick={() => {
                    if (isActive || switchMutation.isPending) return;
                    switchMutation.mutate(profile.id);
                  }}
                  className={cn(
                    'flex min-h-12 w-full items-center gap-3 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    isActive ? 'border-primary/40 bg-primary/5' : 'border-border bg-card hover:bg-muted/60',
                  )}
                >
                  <SigleDEspace nom={nom} actif={isActive} className="size-10 rounded-xl text-sm" />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-corps font-semibold">{nom}</span>
                    {/* TCK-2621 — « rôle · ville », jamais le slug. */}
                    <span className="truncate text-ui text-muted-foreground">{sousLigneDEspace(role, profile.agency?.city)}</span>
                  </span>
                  <IndicateurDeChoix actif={isActive} />
                </button>
              </li>
            );
          }),
        )}
      </ul>
    </section>
  );
}
