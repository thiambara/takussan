import { isReachable } from '@/components/crm/contact';
import type { LeaseWithRelations } from '@/lib/queries/leases';
import type { LeasePayment, LeaseSignatureRole } from '@/types/lease';

/**
 * TCK-2645 — les gestes de la fiche d'un bail, décidés UNE fois, hors du rendu.
 *
 * Tout suit ce que l'API rend pour le lecteur (`abilities`, `can_sign_as`, `can_request_signature`) et
 * l'état du bail ; jamais `user.roles` (P2 de l'audit : l'écran du mauvais profil pendant le
 * chargement). Tant que `abilities` n'est pas là, aucun geste.
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

/** L'échéance à encaisser en premier : la plus ancienne en retard, sinon la prochaine due. */
export function echeanceAEncaisser(paiements: readonly LeasePayment[]): LeasePayment | null {
  const dues = [...paiements]
    .filter((p) => compte(p) && (p.status === 'pending' || p.status === 'late' || p.status === 'partially_paid'))
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
 *  | Qui, dans quel état | Geste |
 *  |---|---|
 *  | Gestion, bail en cours | « Encaisser » (`record_payment`) |
 *  | Brouillon | « Envoyer à la signature » (`can_request_signature`), bloqué avec sa raison |
 *  | En attente de signature, le lecteur peut signer | « Signer le bail » |
 *  | En attente de signature, la gestion | « Relancer la signature » (WhatsApp, décision 4), si un numéro est servi |
 *  | Locataire, échéance due et paiement en ligne | « Payer » |
 *  | Locataire, sinon | « Télécharger ma quittance », sinon « Télécharger mon contrat » |
 */
export function gestePrincipal(lease: LeaseWithRelations, { paiements, paiementEnLigne }: Contexte): GestePrincipal | null {
  const a = lease.abilities;
  if (!a) return null;

  if (lease.status === 'draft') {
    if (lease.can_request_signature !== true) return null;
    const locataire = lease.tenant ?? null;
    const bloque: BloquageDeSignature | null =
      locataire?.user_id == null ? 'sans-compte' : !(locataire.first_name || locataire.last_name) ? 'sans-nom' : null;
    return { type: 'envoyer-signature', bloque };
  }

  if (lease.status === 'pending_signature') {
    const signes = rolesSignes(lease);
    if ((lease.can_sign_as ?? []).some((r) => !signes.has(r))) return { type: 'signer' };
    if (lease.can_request_signature !== true) return null;
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

  if (a.record_payment && (lease.status === 'active' || lease.status === 'terminating' || lease.status === 'expired')) {
    return { type: 'encaisser', paiement: paiements ? (echeanceAEncaisser(paiements)?.id ?? null) : null };
  }
  return null;
}

export type GesteSecondaire =
  | 'reviser'
  | 'renouveler'
  | 'document'
  | 'restituer'
  | 'generer'
  | 'preavis'
  | 'resilier';

/**
 * Les gestes de « ⋯ » (téléphone) et de la carte « Actions » (bureau), dans l'ordre du ticket :
 * Réviser, Renouveler, Ajouter un document, Restituer la caution, Générer l'échéancier (seulement
 * quand il n'existe pas, et jamais pendant que les échéances chargent), puis le préavis ou la
 * résiliation, dernier et séparé.
 */
export function gestesSecondaires(lease: LeaseWithRelations, paiements: readonly LeasePayment[] | undefined): GesteSecondaire[] {
  const a = lease.abilities;
  if (!a) return [];
  const gestes: GesteSecondaire[] = [];
  const enCours = lease.status === 'active';
  if (a.review_rent && enCours && lease.type !== 'sale') gestes.push('reviser');
  if (a.renew && (enCours || lease.status === 'expired')) gestes.push('renouveler');
  if (a.add_document) gestes.push('document');
  if (
    a.refund_deposit &&
    (lease.status === 'terminated' || lease.status === 'expired') &&
    (lease.deposit_amount ?? 0) > (lease.deposit_refunded_amount ?? 0)
  ) {
    gestes.push('restituer');
  }
  if (a.record_payment && enCours && paiements !== undefined && !echeancierExiste(paiements)) gestes.push('generer');
  if (a.request_early_termination && (enCours || lease.status === 'expired')) {
    gestes.push(estLeLocataireDuBail(lease) ? 'preavis' : 'resilier');
  }
  return gestes;
}
