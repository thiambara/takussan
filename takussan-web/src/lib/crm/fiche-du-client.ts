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
}

/**
 * La prochaine action quand c'est une visite, complétée par `upcoming_visits` (son statut) ; `null`
 * si la prochaine action n'est pas une visite ou n'est pas lisible.
 */
export function prochaineVisite(customer: Pick<CustomerDetail, 'next_action' | 'upcoming_visits'>): ProchaineVisite | null {
  const a = customer.next_action;
  if (!a || a.type !== 'visit') return null;
  const v: CustomerUpcomingVisit | undefined = customer.upcoming_visits?.find((x) => x.id === a.id);
  return { id: a.id, at: a.at, bien: a.label, aConfirmer: v?.status === 'scheduled' };
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
