import { PAYMENT_STATUS_VALUES } from '@/components/payments/constants';
import type { PaymentHistoryEntity } from '@/lib/queries/payments';

import type { OngletArgent } from './vue-argent';

/**
 * TCK-2677 (ADR-0100 § 4 et § 7) — l'adresse de « Argent » qui répond à une adresse de
 * `/app/payments`, pour l'admin de l'agence active : « les liens profonds ne cassent pas ».
 *
 * | `/app/payments`               | `/app/agency/finances`  |
 * |-------------------------------|-------------------------|
 * | (aucun), `tab=history`, autre | `tab=encaissements`     |
 * | `tab=invoices`                | `tab=factures`          |
 * | `tab=payouts`                 | `tab=reversements`      |
 * | `tab=approvals`               | `tab=a-approuver`       |
 * | `tab=bills`                   | `tab=interventions`     |
 *
 * Un `tab` inconnu valait l'historique dans `PaymentsTabs` : il vaut ici « Encaissements ».
 *
 * Les filtres de l'historique (`PaymentsHistoryFilters`) passent avec leur valeur, et seulement vers
 * « Encaissements » — ils ne filtraient que l'historique. `page` tombe : la page N d'une autre
 * sélection (autres bornes, autre taille de page) ne désigne rien. Tout autre paramètre tombe, sans
 * erreur.
 *
 * Une valeur qu'« Argent » ne connaît pas tombe aussi (vérification de TCK-2677) : `status` hors
 * {@link PAYMENT_STATUS_VALUES} (`status=completed`, d'un ancien favori, faisait tomber la page sur
 * « Une erreur est survenue »), `entity_type` hors des quatre entités — et `entity_id` avec lui, qui
 * ne désigne rien sans son type.
 */
const ONGLETS: Readonly<Record<string, OngletArgent>> = {
  history: 'encaissements',
  invoices: 'factures',
  payouts: 'reversements',
  approvals: 'a-approuver',
  bills: 'interventions',
};

const FILTRES_DE_L_HISTORIQUE = ['status', 'entity_type', 'entity_id', 'date_from', 'date_to'] as const;

const ENTITES: readonly PaymentHistoryEntity[] = ['property', 'lease', 'booking', 'customer'];

/** Les valeurs qu'« Argent » sait lire ; `true` pour un filtre sans liste fermée. */
function valeurConnue(cle: (typeof FILTRES_DE_L_HISTORIQUE)[number], valeur: string, params: ParametresDeLaPage): boolean {
  if (cle === 'status') return (PAYMENT_STATUS_VALUES as readonly string[]).includes(valeur);
  if (cle === 'entity_type') return (ENTITES as readonly string[]).includes(valeur);
  if (cle === 'entity_id') return valeurConnue('entity_type', premiere(params.entity_type) ?? '', params);
  return true;
}

/** Ce que Next passe à une page : `searchParams` résolu. */
export type ParametresDeLaPage = Readonly<Record<string, string | string[] | undefined>>;

function premiere(valeur: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valeur) ? valeur[0] : valeur;
  return v === undefined || v === '' ? undefined : v;
}

export function adresseDeLArgent(params: ParametresDeLaPage): string {
  const tab = premiere(params.tab);
  const onglet: OngletArgent = tab !== undefined && Object.hasOwn(ONGLETS, tab) ? ONGLETS[tab] : 'encaissements';
  const sortie = new URLSearchParams({ tab: onglet });
  if (onglet === 'encaissements') {
    for (const cle of FILTRES_DE_L_HISTORIQUE) {
      const valeur = premiere(params[cle]);
      if (valeur !== undefined && valeurConnue(cle, valeur, params)) sortie.set(cle, valeur);
    }
  }
  return `/app/agency/finances?${sortie.toString()}`;
}
