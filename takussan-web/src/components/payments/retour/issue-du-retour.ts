/**
 * TCK-2650 (P1 de l'audit, famille 4) — ce que la page de retour de passerelle peut dire, décidé par
 * le SERVEUR.
 *
 * Avant : `bucketFor` lisait `status=success` dans l'URL quand le serveur répondait `pending` ou rien,
 * et écrivait « Paiement confirmé » sur la foi d'une adresse que n'importe qui peut taper.
 *
 *  · « confirmé » n'existe que sur un statut serveur `paid` (les trois tables, `PaymentStatus` et
 *    `InvoiceStatus`, n'ont pas d'autre statut payé) ;
 *  · `pending`, `partially_paid`, `late`, un statut inconnu ou absent : « en cours », et l'interrogation
 *    continue ;
 *  · l'indice d'URL (`status=`) ne choisit que le texte d'attente : `failed` (l'adresse d'annulation
 *    que le sélecteur envoie à Wave et à Orange Money, TCK-1291) affiche « non abouti » pendant que
 *    l'interrogation continue — un `paid` serveur l'emporte encore —, et `success` ne change rien ;
 *  · un lien sans type connu ou sans identifiant entier, un paiement introuvable (404) ou celui d'un
 *    autre (403) : « lien invalide », sans requête dans le premier cas, sans relance dans les deux autres ;
 *  · une erreur serveur ou réseau n'est ni « invalide » ni « confirmé » : on attend, et on réessaie.
 */
export const TYPES_DE_PAIEMENT = ['booking-payments', 'lease-payments', 'invoices'] as const;
export type TypeDePaiement = (typeof TYPES_DE_PAIEMENT)[number];

export type IssueDuRetour = 'attente' | 'confirme' | 'echec' | 'rembourse' | 'invalide';

export interface LienDeRetour {
  readonly type: TypeDePaiement;
  readonly id: number;
}

/** Le paiement que désigne l'adresse de retour, ou `null` : rien d'autre n'entre dans un chemin d'API. */
export function lireLeLien(params: { get(nom: string): string | null }): LienDeRetour | null {
  const type = params.get('payment_type');
  const id = params.get('payment_id');
  if (!type || !(TYPES_DE_PAIEMENT as readonly string[]).includes(type)) return null;
  if (!id || !/^\d{1,18}$/.test(id)) return null;
  const nombre = Number(id);
  if (!Number.isSafeInteger(nombre) || nombre <= 0) return null;
  return { type: type as TypeDePaiement, id: nombre };
}

export interface EntreeDuRetour {
  readonly lien: LienDeRetour | null;
  /** La réponse de `verify`, quand il y en a une. */
  readonly serveur: { readonly status: string | null; readonly refund_pending?: boolean } | null;
  /** Le statut HTTP de la dernière erreur de `verify`, ou `null` (une erreur réseau n'en a pas : `0`). */
  readonly erreur: number | null;
  /** `status=` de l'adresse de retour : un indice du fournisseur, jamais une preuve. */
  readonly indice: string | null;
}

export interface DecisionDuRetour {
  readonly issue: IssueDuRetour;
  /** L'issue est définitive : l'interrogation s'arrête. */
  readonly terminale: boolean;
}

const INDICES_D_ECHEC = new Set(['failed', 'cancelled', 'canceled', 'error']);

export function issueDuRetour({ lien, serveur, erreur, indice }: EntreeDuRetour): DecisionDuRetour {
  if (lien === null) return { issue: 'invalide', terminale: true };
  if (serveur === null && (erreur === 404 || erreur === 403)) return { issue: 'invalide', terminale: true };

  const statut = (serveur?.status ?? '').toLowerCase();
  // TCK-596 — débité sur une échéance annulée ou déjà réglée : ni un échec, qui inviterait à payer une
  // seconde fois, ni un succès. L'agence rembourse.
  if (serveur?.refund_pending === true || statut === 'refunded') return { issue: 'rembourse', terminale: true };
  if (statut === 'paid') return { issue: 'confirme', terminale: true };
  if (statut === 'failed' || statut === 'cancelled') return { issue: 'echec', terminale: true };

  const indiceDEchec = INDICES_D_ECHEC.has((indice ?? '').toLowerCase());
  return { issue: indiceDEchec ? 'echec' : 'attente', terminale: false };
}
