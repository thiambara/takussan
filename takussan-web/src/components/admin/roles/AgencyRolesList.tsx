'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Copy, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AgencyRole, AgencyRoleBaseType } from '@/types/agency-role';

/**
 * Ordre d'affichage des groupes. Figé ici, et non dérivé de l'ordre de la
 * réponse : l'API trie par `name`, donc l'ordre des groupes y dépendrait des
 * noms que l'agence a choisis pour ses rôles — il changerait à chaque
 * création.
 */
const GROUP_ORDER: readonly AgencyRoleBaseType[] = [
  'agency_admin',
  'agent',
  'owner',
  'service_provider',
];

interface AgencyRolesListProps {
  readonly roles: readonly AgencyRole[];
  readonly selectedId: number | null;
  readonly onSelect: (role: AgencyRole) => void;
  readonly onClone: (role: AgencyRole) => void;
  readonly onDelete: (role: AgencyRole) => void;
  /** `false` masque « Cloner » — l'utilisateur n'a pas `roles.create_custom`. */
  readonly canCreate: boolean;
  /** `false` masque « Supprimer » — pas de `roles.delete_custom`. */
  readonly canDelete: boolean;
}

/**
 * TCK-279 (AC11) — colonne gauche de `/admin/roles` : les rôles de l'agence,
 * groupés par `base_profile_type`.
 *
 * Un rôle système porte son badge et **n'expose ni « Modifier » ni
 * « Supprimer »** : la policy les refuse en 403 quoi qu'il arrive
 * (`AgencyRolePolicy::update` sort sur `is_system` avant même de regarder la
 * capacité). Seul « Cloner » y a un sens, et c'est le geste que la spec
 * prescrit.
 */
export function AgencyRolesList({
  roles,
  selectedId,
  onSelect,
  onClone,
  onDelete,
  canCreate,
  canDelete,
}: AgencyRolesListProps) {
  const t = useTranslations('admin.roles');

  const grouped = useMemo(() => {
    const map = new Map<AgencyRoleBaseType, AgencyRole[]>();
    for (const type of GROUP_ORDER) map.set(type, []);
    for (const role of roles) {
      // Un type inconnu du front (catalogue élargi côté serveur) ne
      // disparaît pas en silence : il crée son propre groupe.
      if (!map.has(role.base_profile_type)) map.set(role.base_profile_type, []);
      map.get(role.base_profile_type)!.push(role);
    }
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [roles]);

  const groupLabel = (type: AgencyRoleBaseType): string => {
    const key = `list.groups.${type}`;
    return t.has(key) ? t(key) : type;
  };

  return (
    <nav aria-label={t('list.heading')} className="space-y-5" data-testid="agency-roles-list">
      {grouped.map(([type, list]) => (
        <section key={type} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {groupLabel(type)}
          </h3>
          <ul className="space-y-1.5">
            {list.map((role) => {
              const isSelected = role.id === selectedId;
              return (
                <li key={role.id}>
                  <div
                    className={cn(
                      'rounded-xl border transition-colors',
                      isSelected
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border bg-card hover:bg-muted/50',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(role)}
                      aria-current={isSelected ? 'true' : undefined}
                      aria-label={t('actions.select_role', { name: role.name })}
                      className="w-full px-3 py-2.5 text-left"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{role.name}</span>
                        {role.is_system ? (
                          <Badge variant="outline" className="shrink-0">
                            {t('list.system_badge')}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {t('list.capability_count', { count: role.capabilities?.length ?? 0 })}
                        {' · '}
                        {t('list.profiles_count', { count: role.profiles_count ?? 0 })}
                      </span>
                    </button>

                    <div className="flex gap-1 border-t border-border/60 px-2 py-1.5">
                      {canCreate && role.is_clonable ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onClone(role)}
                          className="h-7 px-2 text-xs"
                        >
                          <Copy className="mr-1 size-3.5" aria-hidden="true" />
                          {t('actions.clone')}
                        </Button>
                      ) : null}
                      {canDelete && !role.is_system ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(role)}
                          className="h-7 px-2 text-xs text-destructive"
                        >
                          <Trash2 className="mr-1 size-3.5" aria-hidden="true" />
                          {t('actions.delete')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
