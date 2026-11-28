import { isReachable } from '@/components/crm/contact';
import type { LeaseWithRelations } from '@/lib/queries/leases';
import type { LeasePayment, LeaseSignatureRole } from '@/types/lease';

/**
 * TCK-2645 — les gestes de la fiche d'un bail, décidés UNE fois, hors du rendu.
 *
 * Tout suit ce que l'API rend pour le lecteur ; jamais `user.roles` (P2 de l'audit : l'écran du
 * mauvais profil pendant le chargement). Tant que `abilities` n'est pas là, aucun geste.
 *
 * TCK-3011 (ADR-0139) — `abilities` porte la policy ET l'état du bail (`GestesDuBail`) : ces fonctions
 * ne comparent plus `lease.status` pour décider qu'un geste est permis. Elles le lisent pour PRÉSENTER
 * seulement — envoyer ou relancer une signature. Avant, chaque précondition était refaite ici, parfois
 * autrement que l'API : « Réviser » sur une vente sans loyer, « Restituer » une caution jamais encaissée,
 * « Générer l'échéancier » quand seule la caution était saisie.
 *
 * Le repère « le lecteur est le locataire » est `abilities.give_notice` (décision 12) : un geste de
 * partie, lu sur la policy hors de `Gate::before`, faux pour le super-admin.
 */

export type BloquageDeSignature = 'sans-compte' | 'sans-nom';

export type GestePrincipal =
  | { readonly type: 'encaisser'; readonly paiement: number | null }
  | { readonly type: 'envoyer-signature'; readonly bloque: BloquageDeSignature | null }
  | { readonly type: 'signer' }
  | { readonly type: 'relancer-signature'; readonly role: LeaseSignatureRole; readonly telephone: string; readonly prenom: string }
  | { readonly type: 'payer'; readonly paiement: LeasePayment }
  | { readonly type: 'quittance'; readonly paiement: LeasePayment }
  | { readonly type: 'contrat' };

/** Le lecteur est le locataire de CE bail (décision 12). */
export function estLeLocataireDuBail(lease: Pick<LeaseWithRelations, 'abilities'>): boolean {
  return lease.abilities?.give_notice === true;
}

/** Une échéance qui compte : ni annulée, ni restitution de caution. */
function compte(p: LeasePayment): boolean {
  return p.status !== 'cancelled' && p.payment_type !== 'deposit_refund';
}

/** L'échéancier existe : au moins une ligne de loyer ou de charges (la caution seule ne compte pas). */
export function echeancierExiste(paiements: readonly LeasePayment[]): boolean {
  return paiements.some((p) => p.payment_type === 'rent' || p.payment_type === 'charges');
}

/**
 * L'échéance que le locataire réglerait : la plus ancienne qui demande un paiement en ligne
 * (`amount_due`, calculé par l'API, pénalité comprise quand elle est payable en ligne).
 */
export function echeanceAPayer(paiements: readonly LeasePayment[]): LeasePayment | null {
  return [...paiements]
    .filter((p) => compte(p) && p.amount_due > 0)
    .sort((a, b) => (a.due_date ?? a.period_start).localeCompare(b.due_date ?? b.period_start))[0] ?? null;
}

/**
 * L'échéance à encaisser en premier : la plus ancienne en retard, sinon la prochaine due. TCK-3011 —
 * parmi celles que l'API laisse encaisser à ce lecteur (`abilities.record_payment` de la ligne : un
 * reste dû, ni payée ni annulée).
 */
export function echeanceAEncaisser(paiements: readonly LeasePayment[]): LeasePayment | null {
  const dues = [...paiements]
    .filter((p) => compte(p) && p.abilities?.record_payment === true)
    .sort((a, b) => (a.due_date ?? a.period_start).localeCompare(b.due_date ?? b.period_start));
  return dues.find((p) => p.is_overdue) ?? dues[0] ?? null;
}

/** La dernière quittance disponible. */
export function derniereQuittance(paiements: readonly LeasePayment[]): LeasePayment | null {
  return [...paiements]
    .filter((p) => p.receipt_available)
    .sort((a, b) => (b.due_date ?? b.period_start).localeCompare(a.due_date ?? a.period_start))[0] ?? null;
}

/** Les rôles qui ont signé le contrat EN VIGUEUR. */
function rolesSignes(lease: LeaseWithRelations): Set<LeaseSignatureRole> {
  return new Set((lease.signatures ?? []).filter((s) => s.current).map((s) => s.role));
}

interface Contexte {
  /** Les échéances lues ; `undefined` tant qu'elles chargent. */
  readonly paiements: readonly LeasePayment[] | undefined;
  /** Un fournisseur de paiement en ligne sert ce bail (décision 14). */
  readonly paiementEnLigne: boolean;
}

/**
 * Le geste principal : un seul, dans la barre collée du téléphone et en tête de la carte « Actions ».
 *
 *  | Ce que l'API permet (`abilities`) | Geste |
 *  |---|---|
 *  | `sign` | « Signer le bail » |
 *  | `request_signature`, sur un brouillon | « Envoyer à la signature », bloqué avec sa raison |
 *  | `request_signature`, sinon | « Relancer la signature » (WhatsApp, décision 4), si un numéro est servi |
 *  | Locataire, échéance due et paiement en ligne | « Payer » |
 *  | Locataire, sinon | « Télécharger ma quittance », sinon « Télécharger mon contrat » |
 *  | Une échéance à encaisser, ou `add_payment` | « Encaisser » |
 *
 * Le statut ne choisit que la forme de la demande de signature : la première, ou sa relance.
 */
export function gestePrincipal(lease: LeaseWithRelations, { paiements, paiementEnLigne }: Contexte): GestePrincipal | null {
  const a = lease.abilities;
  if (!a) return null;

  if (a.sign === true) return { type: 'signer' };

  if (a.request_signature === true) {
    // Présentation : un brouillon s'envoie, un bail qui attend ses signatures se relance.
    if (lease.status === 'draft') {
      const locataire = lease.tenant ?? null;
      const bloque: BloquageDeSignature | null =
        locataire?.user_id == null ? 'sans-compte' : !(locataire.first_name || locataire.last_name) ? 'sans-nom' : null;
      return { type: 'envoyer-signature', bloque };
    }
    const signes = rolesSignes(lease);
    // La partie qui n'a pas signé, et son numéro tel que l'API le sert (décision 5 : aucun numéro neuf).
    const role: LeaseSignatureRole | null = !signes.has('tenant') ? 'tenant' : !signes.has('landlord') ? 'landlord' : null;
    if (role === null) return null;
    const partie = role === 'tenant' ? lease.tenant : lease.landlord;
    const telephone = partie?.phone ?? null;
    if (!isReachable(telephone)) return null;
    return { type: 'relancer-signature', role, telephone, prenom: partie?.first_name ?? '' };
  }

  if (estLeLocataireDuBail(lease)) {
    if (paiements === undefined) return null;
    const aPayer = echeanceAPayer(paiements);
    if (aPayer && paiementEnLigne) return { type: 'payer', paiement: aPayer };
    // Décision 14 : sans paiement en ligne, la carte Loyer dit « À régler auprès de votre agence » et
    // la barre porte le contrat.
    if (!aPayer) {
      const quittance = derniereQuittance(paiements);
      if (quittance) return { type: 'quittance', paiement: quittance };
    }
    return a.download_contract === true ? { type: 'contrat' } : null;
  }

  // Une échéance que l'API laisse encaisser (sa ligne le dit), ou une ligne à poser sur un bail qui court.
  const aEncaisser = paiements ? echeanceAEncaisser(paiements) : null;
  if (aEncaisser || a.add_payment === true) return { type: 'encaisser', paiement: aEncaisser?.id ?? null };
  return null;
}

export type GesteSecondaire =
  | 'reviser'
  | 'renouveler'
  | 'document'
  | 'restituer'
  | 'generer'
  | 'preavis'
  | 'resilier'
  | 'abandonner';

/** Ce qui empêche l'abandon d'un brouillon : une échéance saisie, ou un état des lieux. */
export type RaisonDAbandonEmpeche = 'echeance' | 'etatDesLieux';

/**
 * TCK-2764 — pourquoi l'API refuserait l'abandon d'un brouillon, que l'écran ne l'offre pas et dise
 * pourquoi. TCK-3011 — l'API le dit (`abilities.abandon` faux) ; `has_inventory`, servi à qui peut
 * abandonner un brouillon, dit que la question se pose ; il ne reste ici qu'à NOMMER la raison :
 * - `echeance` : une échéance non annulée, de tout type (une caution saisie avant l'activation, P46.04),
 *   422 `lease.abandon_has_payments` ;
 * - `etatDesLieux` : un état des lieux engagé — sorti du brouillon ou signé (réserve r1 de la
 *   vérification d'ace044c18, puis décision 4a : un brouillon d'état des lieux part avec le bail),
 *   `has_inventory`, 422 `lease.abandon_has_inventory`.
 *
 * `null` quand l'abandon est offert, à qui ne peut pas abandonner, et tant que les échéances chargent.
 */
export function raisonDAbandonEmpeche(
  lease: LeaseWithRelations,
  paiements: readonly LeasePayment[] | undefined,
): RaisonDAbandonEmpeche | null {
  if (!lease.abilities || lease.abilities.abandon === true || lease.has_inventory === undefined || paiements === undefined) return null;
  if (paiements.some((p) => p.status !== 'cancelled')) return 'echeance';
  if (lease.has_inventory) return 'etatDesLieux';
  return null;
}

/** L'abandon est empêché, pour l'une des raisons de {@link raisonDAbandonEmpeche}. */
export function abandonEmpeche(lease: LeaseWithRelations, paiements: readonly LeasePayment[] | undefined): boolean {
  return raisonDAbandonEmpeche(lease, paiements) !== null;
}

/**
 * Les gestes de « ⋯ » (téléphone) et de la carte « Actions » (bureau), dans l'ordre du ticket :
 * Réviser, Renouveler, Ajouter un document, Restituer la caution, Générer l'échéancier, puis le préavis
 * ou la résiliation, dernier et séparé — sur un brouillon, l'abandon (TCK-2764) tient cette place.
 *
 * TCK-3011 — chacun sur sa clé, que l'API juge avec l'état du bail : la fonction ne choisit que l'ordre,
 * et « préavis » ou « résiliation » selon que le lecteur est le locataire.
 */
export function gestesSecondaires(lease: LeaseWithRelations): GesteSecondaire[] {
  const a = lease.abilities;
  if (!a) return [];
  const gestes: GesteSecondaire[] = [];
  if (a.review_rent) gestes.push('reviser');
  if (a.renew) gestes.push('renouveler');
  if (a.add_document) gestes.push('document');
  if (a.refund_deposit) gestes.push('restituer');
  if (a.generate_schedule) gestes.push('generer');
  if (a.request_early_termination) gestes.push(estLeLocataireDuBail(lease) ? 'preavis' : 'resilier');
  if (a.abandon) gestes.push('abandonner');
  return gestes;
}
