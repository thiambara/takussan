'use client';

import { createContext, useContext } from 'react';
import type { ParametresDuMenu } from './useMenuDeLEspace';

/**
 * TCK-2619 — les arguments du menu de l'espace (`useMenuDeLEspace`), que la coque (`AppShell`) tient, mis
 * à la portée de SES pages : la page introuvable cherche dans le menu de la barre et ses « Récents », comme
 * la palette, sans recomposer un second menu ni relire l'utilisateur. `null` hors de la coque (un test
 * isolé, `/super-admin`).
 */
export const ContexteDuMenuDeLaCoque = createContext<ParametresDuMenu | null>(null);

export function useContexteDuMenuDeLaCoque(): ParametresDuMenu | null {
  return useContext(ContexteDuMenuDeLaCoque);
}
