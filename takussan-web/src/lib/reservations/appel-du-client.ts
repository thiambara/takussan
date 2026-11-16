/**
 * TCK-2879 (maquette `app-reservations` a, e9 « Client — mes réservations ») — ce qu'on attend du
 * CLIENT sur une réservation, hors composant : l'encart d'appel et son geste, et s'il peut annuler.
 *
 * Un seul geste par carte, par priorité : contre-offre à répondre > acompte dû > pièce manquante >
 * solde dû ; aucun quand rien n'est attendu. Les libellés restent au rendu ; ici, des valeurs.
 *
 * - **Paiements : un séjour seulement.** Le `total_amount` d'une candidature est le loyer du bien, celui
 *   d'une offre le prix proposé (`montantDansLaNature`) : rien que le client règle sur la réservation.
 *   L'acompte et le solde se comptent comme `BookingPaymentService::dueFromCustomer` : sur `amount_paid`
 *   (servi par la liste), l'acompte tant que rien n'est réglé, le reste ensuite. Sans `amount_paid` lu,
 *   aucun geste de paiement (mieux vaut se taire qu'inventer un dû).
 * - **Dossier : une candidature seulement**, comme la section Dossier de la fiche (TCK-2875) : la
 *   première pièce manquante, dans l'ordre de l'API.
 * - **L'échéance de l'acompte** : l'API n'en connaît aucune pour un séjour confirmé (`response_deadline`
 *   ne vaut que pour une demande en attente) ; la carte dit « avant » le jour d'arrivée.
 */
import { jourDeLApi } from '@/lib/jour-de-l-api';
import type { Booking, BookingCounterOffer, DossierPiece } from '@/types/booking';

export type AppelDuClient =
  | { readonly geste: 'contre_offre'; readonly contreOffre: BookingCounterOffer }
  | { readonly geste: 'acompte'; readonly montant: number; readonly avant: string | null }
  | { readonly geste: 'dossier'; readonly recues: number; readonly total: number; readonly manquante: DossierPiece }
  | { readonly geste: 'solde'; readonly montant: number; readonly acomptePaye: boolean }
  | { readonly geste: null; readonly dossierComplet?: { readonly recues: number; readonly total: number } };

const ouverte = (b: Booking) => b.status === 'pending' || b.status === 'confirmed';

/** La contre-offre qui attend la réponse du client (même règle que la fiche, TCK-2876). */
export function contreOffreARepondre(b: Booking): BookingCounterOffer | null {
  const co = b.counter_offer ?? null;
  return b.status === 'pending' && co?.status === 'pending' && b.awaiting === 'customer' ? co : null;
}

export function appelDuClient(b: Booking): AppelDuClient {
  if (!ouverte(b)) return { geste: null };

  const co = contreOffreARepondre(b);
  if (co) return { geste: 'contre_offre', contreOffre: co };

  const sejour = b.kind === 'stay';
  const total = Number(b.total_amount ?? 0);
  const paye = b.amount_paid;
  const reste = paye === undefined ? 0 : Math.max(total - paye, 0);
  const acompte = Number(b.deposit_amount ?? 0);
  const acompteDu = sejour && paye !== undefined && reste > 0 && paye <= 0 && acompte > 0;
  if (acompteDu) return { geste: 'acompte', montant: Math.min(acompte, reste), avant: b.start_date ? b.start_date.slice(0, 10) : null };

  const dossier = b.kind === 'application' && b.dossier && b.dossier.required > 0 ? b.dossier : null;
  const manquante = dossier?.missing[0];
  if (dossier && manquante) return { geste: 'dossier', recues: dossier.received, total: dossier.required, manquante };

  if (sejour && paye !== undefined && reste > 0) return { geste: 'solde', montant: reste, acomptePaye: paye > 0 };

  return dossier ? { geste: null, dossierComplet: { recues: dossier.received, total: dossier.required } } : { geste: null };
}

/**
 * Le client annule-t-il ? Comme la fiche (TCK-1301) : une réservation en attente ou confirmée, sauf un
 * séjour confirmé dont le premier jour est arrivé (`booking.cannot_cancel`), jugé au jour de l'API.
 */
export function clientPeutAnnuler(b: Pick<Booking, 'status' | 'start_date'>, maintenant: Date = new Date()): boolean {
  if (b.status !== 'pending' && b.status !== 'confirmed') return false;
  const commence = b.status === 'confirmed' && !!b.start_date && b.start_date.slice(0, 10) <= jourDeLApi(maintenant);
  return !commence;
}

/**
 * « avant jeudi » ou « avant le 21 nov. » : le nom du jour dans les six jours qui viennent, la date
 * au-delà ; `maintenant` quand le jour est arrivé ou passé.
 */
export type FormeDeLEcheance = 'semaine' | 'date' | 'maintenant';

export function formeDeLEcheance(jour: string, maintenant: Date): FormeDeLEcheance {
  const a = Date.parse(`${jourDeLApi(maintenant)}T00:00:00Z`);
  const b = Date.parse(`${jour.slice(0, 10)}T00:00:00Z`);
  const ecart = Math.round((b - a) / 86_400_000);
  if (ecart <= 0) return 'maintenant';
  return ecart <= 6 ? 'semaine' : 'date';
}

/** Les acomptes dus d'une page, la plus proche échéance d'abord : le sous-titre du bureau. */
export function acomptesDus(reservations: readonly Booking[]): { readonly n: number; readonly premier: string | null } {
  const jours = reservations
    .map(appelDuClient)
    .filter((a): a is Extract<AppelDuClient, { geste: 'acompte' }> => a.geste === 'acompte')
    .map((a) => a.avant);
  const dates = jours.filter((j): j is string => j !== null).sort();
  return { n: jours.length, premier: dates[0] ?? null };
}
