/**
 * TCK-593 (Partie 3) — ce que le paiement en ligne d'une échéance de loyer encaissera, DÉCOMPOSÉ.
 *
 * ⚠ Aucune addition ici : chaque montant est lu tel que l'API le rend (`LeasePaymentResource`,
 * calculé une seule fois par `PaymentGatewayService::amountDue`). Le front choisit quoi afficher où,
 * il ne recalcule pas ce qui est dû — c'est ce qui laissait le bouton annoncer un montant et la
 * passerelle en encaisser un autre.
 */
export interface DetailMontantDu {
  /** `amount_due` — exactement ce que la passerelle encaissera. */
  readonly total: number;
  /** `remaining_amount` — le loyer restant dû. */
  readonly loyer: number;
  /** La pénalité encaissée AVEC ce paiement ; `0` quand l'agence ne l'encaisse pas en ligne. */
  readonly penaliteIncluse: number;
  /** La pénalité due mais à régler auprès de l'agence ; `0` quand il n'y en a pas. */
  readonly penaliteHorsLigne: number;
}

export interface EcheanceMontants {
  readonly amount_due: number;
  readonly remaining_amount: number;
  readonly late_fee_outstanding: number;
  readonly late_fee_payable_online: boolean;
}

export function detailMontantDu(e: EcheanceMontants): DetailMontantDu {
  const penalite = e.late_fee_outstanding > 0 ? e.late_fee_outstanding : 0;
  return {
    total: e.amount_due,
    loyer: e.remaining_amount,
    penaliteIncluse: e.late_fee_payable_online ? penalite : 0,
    penaliteHorsLigne: e.late_fee_payable_online ? 0 : penalite,
  };
}
