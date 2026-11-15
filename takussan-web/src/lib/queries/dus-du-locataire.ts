'use client';

import { usePaymentsHistory } from '@/lib/queries/payments';

/**
 * Les échéances dues du locataire connecté, telles que la page Paiements les lit (TCK-2169, TCK-2650) :
 * `GET /api/payments/history` filtré CÔTÉ SERVEUR sur les statuts dus, du plus ancien au plus récent,
 * jusqu'à un horizon de six mois. « Paiements » et la carte « Loyer » de l'accueil (TCK-2625, qui y lit
 * le montant exact d'un « Payer » : `amount_due`, pénalité encaissée en ligne comprise) passent tous deux
 * par ce hook : mêmes paramètres, donc même clé et même cache.
 *
 * Un module à part, et non `payments.ts` : les tests de la page doublent `@/lib/queries/payments`
 * entier, et ce hook passe par SON `usePaymentsHistory` — la doublure le sert donc aussi.
 */
export const STATUTS_DUS = 'pending,partially_paid,late,failed';

/**
 * P199.05 (TCK-2169) — l'horizon des dus lus, en mois. L'échéancier d'un bail est émis en entier à
 * l'activation (60 lignes pour cinq ans) : la lecture de 50 lignes s'arrêtait en silence. Elle est
 * bornée par `date_to` (le début de période, côté API) ; sans borne basse, les retards restent.
 */
export const HORIZON_DES_DUS_MOIS = 6;

export function horizonDesDus(maintenant: Date = new Date()): string {
  const borne = new Date(maintenant);
  borne.setUTCMonth(borne.getUTCMonth() + HORIZON_DES_DUS_MOIS);
  return borne.toISOString().slice(0, 10);
}

/** `enabled` ne change pas la clé (`usePaymentsHistory` l'en retire) : le cache reste partagé. */
export function useDusDuLocataire(options: { readonly enabled?: boolean } = {}) {
  return usePaymentsHistory({ status: STATUTS_DUS, sort: 'date', per_page: 50, date_to: horizonDesDus(), enabled: options.enabled });
}
