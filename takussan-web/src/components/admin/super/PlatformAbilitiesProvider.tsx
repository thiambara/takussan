'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import type { PlatformAbilities, PlatformAbility } from '@/lib/platform-abilities';

const Contexte = createContext<PlatformAbilities | null>(null);

/**
 * TCK-600 (ADR-0047) — les gestes de l'opérateur, résolus par le layout de la console sur le
 * serveur : la barre latérale n'affiche jamais, même un instant, une entrée hors de son niveau.
 */
export function PlatformAbilitiesProvider({
  value,
  children,
}: {
  value: PlatformAbilities;
  children: React.ReactNode;
}) {
  return <Contexte.Provider value={value}>{children}</Contexte.Provider>;
}

/**
 * `can(geste)` : l'opérateur porte ce geste. `can()` sans geste : une surface qu'aucun geste ne
 * déclare reste au `super_admin` — la même règle que l'API (refus par défaut, ADR-0047).
 *
 * ⚠ Hors fournisseur, TOUT est refusé : un écran monté ailleurs que dans la console n'hérite
 * d'aucun geste par oubli. L'API reste le juge ; ce filtre n'évite que les erreurs au clic.
 */
export function usePlatformAbilities() {
  const valeur = useContext(Contexte);
  const level = valeur?.level ?? null;
  const gestes = useMemo(() => new Set(valeur?.abilities ?? []), [valeur]);
  const can = useCallback(
    (geste?: PlatformAbility) => (geste === undefined ? level === 'super_admin' : gestes.has(geste)),
    [gestes, level],
  );

  return { level, can };
}
