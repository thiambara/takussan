import type { Inventory } from '@/types/inventory';

/**
 * TCK-3011 (ADR-0139) — les gestes de la fiche d'un état des lieux, décidés UNE fois, hors du rendu
 * (patron de `components/leases/fiche/gestes.ts`).
 *
 * Chaque geste se lit dans ce que l'API calcule pour ce lecteur, policy ET état compris
 * (`GestesDeLEtatDesLieux`) : `abilities.edit`, `.submit`, `.dispute`, et `can_sign_as`, qui ne nomme
 * plus que les rôles qui peuvent encore signer. La fiche faisait `abilities.update && status` ; elle ne
 * lit plus le statut pour décider. Tant qu'`abilities` n'est pas là, aucun geste.
 */
export interface GestesDeLEtatDesLieux {
  /** Modifier le brouillon : ses pièces, ses photos (`PATCH`, photos), et le reprendre sur le terrain. */
  readonly modifier: boolean;
  /** L'envoyer en signature. */
  readonly envoyer: boolean;
  /** Le contester : ses deux parties seules. */
  readonly contester: boolean;
  /** Recueillir sur place la signature du locataire (code SMS), ou celle du bailleur pour son compte. */
  readonly signerSurPlace: boolean;
  /** Le canevas du locataire, du bailleur : depuis son propre compte. */
  readonly signerCommeLocataire: boolean;
  readonly signerCommeBailleur: boolean;
}

export const AUCUN_GESTE_D_ETAT_DES_LIEUX: GestesDeLEtatDesLieux = {
  modifier: false,
  envoyer: false,
  contester: false,
  signerSurPlace: false,
  signerCommeLocataire: false,
  signerCommeBailleur: false,
};

export function gestesDeLEtatDesLieux(
  inventory: Pick<Inventory, 'abilities' | 'can_sign_as' | 'sign_on_behalf_of'>,
): GestesDeLEtatDesLieux {
  const a = inventory.abilities;
  if (!a) return AUCUN_GESTE_D_ETAT_DES_LIEUX;
  const roles = inventory.can_sign_as ?? [];
  return {
    modifier: a.edit === true,
    envoyer: a.submit === true,
    contester: a.dispute === true,
    // Qui conduit l'état des lieux (`update`) recueille les signatures sur place : celle du locataire
    // (`tenant_onsite`), ou celle du bailleur pour le compte duquel il signe.
    signerSurPlace:
      a.update === true && (roles.includes('tenant_onsite') || (roles.includes('landlord') && inventory.sign_on_behalf_of != null)),
    signerCommeLocataire: roles.includes('tenant'),
    signerCommeBailleur: roles.includes('landlord'),
  };
}
