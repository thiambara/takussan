'use client';

import { useTranslations } from 'next-intl';

import type { AgencyRole } from '@/types/agency-role';

/**
 * P164.04 (TCK-1808) — le nom AFFICHÉ d'un rôle. Un rôle système est rangé avec un défaut
 * français (`AgencyRoleBaseType::defaultRoleName()` : « Administrateur ») que l'agence ne peut pas
 * modifier : il se lit par son type, sous `profile.roles.<base_profile_type>`, dans la langue de
 * l'écran (principe 5). Un rôle créé garde le nom que l'agence a saisi.
 */
export function useNomDuRole(): (role: Pick<AgencyRole, 'name' | 'is_system' | 'base_profile_type'>) => string {
  const tRoles = useTranslations('profile.roles');

  return (role) =>
    role.is_system && tRoles.has(role.base_profile_type) ? tRoles(role.base_profile_type) : role.name;
}
