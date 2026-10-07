'use client';

import { useCan } from '@/hooks/useCan';

/**
 * TCK-587 (ADR-0031 §3) — les statuts qui PUBLIENT un bien : y passer exige `properties.publish`
 * (`UpdateStatusPropertyRequest`), exactement comme `publish` et `PUT …/visibility`.
 */
export const STATUTS_DE_PUBLICATION: ReadonlySet<string> = new Set(['available', 'published']);

/**
 * TCK-587 — ce que les menus d'un bien peuvent PROPOSER, lu dans les capacités du profil actif.
 *
 * Le serveur juge : publier, dépublier et passer un bien en `available` / `published` exigent
 * `properties.publish` ; supprimer, `properties.delete`. Le menu en proposait les gestes à tout
 * membre, et le bailleur dont le bien venait d'être PROPOSÉ à l'agence se voyait offrir
 * « Publier » — pour un 403. Pendant le chargement des capacités, rien n'est proposé : un geste
 * offert puis retiré est pire qu'un geste qui arrive.
 */
export function useGestesDuBien(): { readonly canPublish: boolean; readonly canDelete: boolean } {
  const { can: canPublish } = useCan('properties.publish');
  const { can: canDelete } = useCan('properties.delete');
  return { canPublish, canDelete };
}
