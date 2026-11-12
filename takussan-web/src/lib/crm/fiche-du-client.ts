/**
 * TCK-2589 — ce que la fiche client (`/app/customers/[id]`) lit de sa ressource, sans formulation :
 * pur, sans directive, testable sans rendu. Les composants de `components/customer-dashboard/fiche/`
 * le formulent.
 */
import type { Task } from '@/types/pipeline';
import type { CustomerDetail, CustomerUpcomingVisit } from '@/types/customer';

/**
 * Le lecteur est-il du personnel de l'agence de la fiche ? Jugé sur ce que l'API a RENDU, jamais sur
 * des rôles : `visits_count` n'est servi qu'à lui (TCK-2588), et un membre du personnel d'une autre
 * agence peut être ici le bailleur auteur de la fiche.
 */
export function lecteurDuPersonnel(customer: Pick<CustomerDetail, 'visits_count'>): boolean {
  return typeof customer.visits_count === 'number';
}

/** « Khady Diallo » → « Khady D. » ; un seul mot reste entier. */
export function nomCourt(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return mots[0] ?? '';
  return `${mots[0]} ${mots[mots.length - 1].charAt(0).toLocaleUpperCase()}.`;
}

/** Les statuts d'une tâche encore à faire (`Task::OPEN_STATUSES` de l'API). */
const TACHE_OUVERTE: ReadonlySet<string> = new Set(['open', 'in_progress']);

export interface ProchaineVisite {
  readonly id: number;
  readonly at: string;
  readonly bien: string | null;
  /** `scheduled` : demandée, à confirmer. */
  readonly aConfirmer: boolean;
  /** Le lecteur la gère (confirmer, fixer l'heure) : `upcoming_visits[].manage` de l'API. */
  readonly gere: boolean;
  /** Une tranche demandée : l'heure se fixe sur la page de la visite. */
  readonly aTranche: boolean;
}

/**
 * La prochaine action quand c'est une visite, complétée par `upcoming_visits` (son statut) ; `null`
 * si la prochaine action n'est pas une visite ou n'est pas lisible.
 */
export function prochaineVisite(customer: Pick<CustomerDetail, 'next_action' | 'upcoming_visits'>): ProchaineVisite | null {
  const a = customer.next_action;
  if (!a || a.type !== 'visit') return null;
  const v: CustomerUpcomingVisit | undefined = customer.upcoming_visits?.find((x) => x.id === a.id);
  return {
    id: a.id,
    at: a.at,
    bien: a.label,
    aConfirmer: v?.status === 'scheduled',
    gere: v?.manage === true,
    aTranche: Boolean(v?.preferred_window),
  };
}

/**
 * La tâche à montrer SOUS la prochaine action : la première tâche ouverte, par échéance, qui n'est pas
 * elle-même la prochaine action. `null` tant que les tâches ne sont pas lues (rien ne se réserve).
 */
export function tacheSuivante(customer: Pick<CustomerDetail, 'next_action'>, taches: readonly Task[] | undefined): Task | null {
  if (!taches) return null;
  const a = customer.next_action;
  const ouvertes = taches
    .filter((t) => TACHE_OUVERTE.has(t.status) && t.due_at !== null)
    .filter((t) => !(a?.type === 'task' && a.id === t.id))
    .toSorted((x, y) => (x.due_at ?? '').localeCompare(y.due_at ?? '') || x.id - y.id);
  return ouvertes[0] ?? null;
}

/** Le nombre de biens correspondants, lu sur `meta.total` ; `null` s'il n'est pas connu. */
export function nombreDeCorrespondances(reponse: { readonly meta?: { readonly total?: number | null } } | undefined): number | null {
  const total = reponse?.meta?.total;
  return typeof total === 'number' && Number.isFinite(total) ? total : null;
}

/** Le nombre de tâches encore à faire ; `null` tant qu'elles ne sont pas lues. */
export function nombreDeTachesOuvertes(taches: readonly Task[] | undefined): number | null {
  return taches ? taches.filter((t) => TACHE_OUVERTE.has(t.status)).length : null;
}

/** La fiche porte-t-elle une recherche (de quoi rapprocher des biens) ? */
export function aUneRecherche(
  customer: Pick<CustomerDetail, 'seeking_contract_type' | 'seeking_property_types' | 'seeking_cities' | 'seeking_neighborhoods' | 'budget_max'>,
): boolean {
  return Boolean(
    customer.seeking_contract_type
      || customer.seeking_property_types?.length
      || customer.seeking_cities?.length
      || customer.seeking_neighborhoods?.length
      || (customer.budget_max !== null && customer.budget_max !== undefined && customer.budget_max !== ''),
  );
}

/**
 * TCK-2589 (lot D) — le DOSSIER de la fiche : les anciens onglets, devenus des lignes repliées en fin
 * de fiche (maquette `app-clients-fiche` a, « Dossier »). Une seule ligne ouverte à la fois, dans
 * l'URL (`?section=`), pour qu'elle se retrouve au retour.
 */
export const PARAMETRE_DE_SECTION = 'section';
export const SECTIONS_DU_DOSSIER = ['biens', 'taches', 'documents', 'relations', 'reservations', 'baux', 'piece', 'compte'] as const;
export type SectionDuDossier = (typeof SECTIONS_DU_DOSSIER)[number];
/** L'ancre d'une ligne du dossier (`id` du DOM) ; celle des biens est visée par la rangée de CHERCHE. */
export const ancreDeLaSection = (s: SectionDuDossier) => `dossier-${s}`;
export const ANCRE_DES_BIENS = ancreDeLaSection('biens');

/**
 * Les lignes du dossier, dans l'ordre, présentes seulement si elles ont quelque chose à montrer
 * (AC5 — le ticket l'emporte sur les « 0 » de la maquette) :
 *  · Biens correspondants, dès qu'il y a une recherche ; Tâches, toujours (on y en ajoute) ;
 *  · Documents, Relations : non vides ; Réservations, Baux : comptés et non nuls — leurs comptes ne
 *    sont servis qu'au personnel de l'agence de la fiche (TCK-2589, `readsVisits`) ;
 *  · Pièce d'identité : quand la fiche en porte une ; Compte client : fiche sans compte, et un
 *    lecteur qui peut inviter.
 */
export function lignesDuDossier(
  customer: Pick<
    CustomerDetail,
    'seeking_contract_type' | 'seeking_property_types' | 'seeking_cities' | 'seeking_neighborhoods' | 'budget_max' | 'documents' | 'bookings_count' | 'leases_count' | 'id_number_masked' | 'user_id'
  >,
  contexte: { readonly relations: number; readonly peutInviter: boolean },
): SectionDuDossier[] {
  const presentes: Record<SectionDuDossier, boolean> = {
    biens: aUneRecherche(customer),
    taches: true,
    documents: (customer.documents?.length ?? 0) > 0,
    relations: contexte.relations > 0,
    reservations: (customer.bookings_count ?? 0) > 0,
    baux: (customer.leases_count ?? 0) > 0,
    piece: Boolean(customer.id_number_masked),
    compte: contexte.peutInviter && customer.user_id === null,
  };
  return SECTIONS_DU_DOSSIER.filter((s) => presentes[s]);
}
