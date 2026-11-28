import { ApiError } from '@/lib/api';

/**
 * TCK-593 (passe 2, N2) — le checkout en cours que porte un 409 `payment.checkout_in_progress`
 * (code stable de TCK-588 ; le checkout est une donnée à côté du code).
 *
 * L'API refuse un nouveau paiement en ligne tant qu'un checkout vit à un autre montant (ou chez un
 * autre fournisseur), et un règlement manuel tant qu'un checkout vit tout court. Elle rend alors le
 * montant figé de ce checkout et l'heure à partir de laquelle il ne sera plus réutilisé : l'écran
 * le dit, au lieu d'un refus nu.
 */
export interface CheckoutEnCours {
  readonly montant: number;
  readonly devise: string;
  /** ISO 8601 — l'heure à partir de laquelle un nouveau checkout s'ouvre. */
  readonly reessayerApres: string | null;
}

export function checkoutEnCours(erreur: unknown): CheckoutEnCours | null {
  if (!(erreur instanceof ApiError) || erreur.status !== 409 || erreur.codeMetier !== 'payment.checkout_in_progress') return null;
  // `checkout` est rangé À CÔTÉ du code, pas dans `params`.
  const checkout = (erreur.data as { checkout?: Record<string, unknown> }).checkout;
  if (!checkout || typeof checkout.amount !== 'number') return null;
  return {
    montant: checkout.amount,
    devise: typeof checkout.currency === 'string' ? checkout.currency : 'XOF',
    reessayerApres: typeof checkout.retry_after === 'string' ? checkout.retry_after : null,
  };
}
