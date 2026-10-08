import type { ReactNode } from 'react';
import { PlatformAbilitiesProvider } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PLATFORM_ABILITIES, type PlatformAbilities } from '@/lib/platform-abilities';

/** TCK-600 — un `super_admin` : tous les gestes. */
export const SUPER_ADMIN: PlatformAbilities = { level: 'super_admin', abilities: [...PLATFORM_ABILITIES] };

/** Un écran de la console, rendu avec les gestes d'un opérateur (`super_admin` par défaut). */
export function avecGestes(ui: ReactNode, value: PlatformAbilities = SUPER_ADMIN) {
  return <PlatformAbilitiesProvider value={value}>{ui}</PlatformAbilitiesProvider>;
}
