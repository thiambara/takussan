import type { Invoice } from '@/types/invoice';

/**
 * TCK-3011 (ADR-0139) — les gestes de la fiche d'une facture (`InvoiceDetailDialog`), décidés UNE fois,
 * hors du rendu (patron de `components/leases/fiche/gestes.ts`).
 *
 * Chaque geste se lit dans `abilities`, que l'API calcule pour ce lecteur, policy ET état compris
 * (`GestesDeLaFacture`). Le dialogue jugeait le seul statut, sans capacité : il offrait « Envoyer »,
 * « Marquer payée » et « Annuler » au client (403), et « Payer en ligne » sur un brouillon, que la
 * passerelle refuse (409 `payment.not_payable`). Tant qu'`abilities` n'est pas là, aucun geste.
 */
export interface GestesDeLaFacture {
  readonly envoyer: boolean;
  readonly marquerPayee: boolean;
  readonly annuler: boolean;
  readonly payerEnLigne: boolean;
}

export const AUCUN_GESTE_DE_FACTURE: GestesDeLaFacture = {
  envoyer: false,
  marquerPayee: false,
  annuler: false,
  payerEnLigne: false,
};

export function gestesDeLaFacture(facture: Pick<Invoice, 'abilities'> | null | undefined): GestesDeLaFacture {
  const a = facture?.abilities;
  if (!a) return AUCUN_GESTE_DE_FACTURE;
  return {
    envoyer: a.send === true,
    marquerPayee: a.mark_paid === true,
    annuler: a.cancel === true,
    payerEnLigne: a.pay === true,
  };
}
