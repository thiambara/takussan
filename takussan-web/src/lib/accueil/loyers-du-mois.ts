/**
 * TCK-2624 (lot 2) — « Loyers de novembre : 8 reçus sur 14 » du bailleur, lu depuis
 * `metrics.rent_month` de `GET /api/dashboard/me` (TCK-2623, `DashboardOwnerService::loyersDuMois`).
 *
 * L'API sert `received_count`, `expected_count` et `received_amount`, et depuis TCK-2774 les segments
 * du MÊME mois « 3 en retard » (`overdue_count`, `overdue_amount`) et « 3 à venir » (`upcoming_count`,
 * `upcoming_amount`), dont la somme avec les reçus fait les attendus. Ils ne sont jamais déduits ici,
 * ni des `overdue_*` du tableau, qui comptent toutes les périodes (décision 2 de TCK-2624, validée le
 * 2026-11-13 : « pas de chiffre inventé ») : absents (API ancienne) ou incohérents, ils ne sont pas rendus.
 *
 * TCK-2820 — un loyer échu puis remboursé n'est pas « en retard » : l'API le sert à part
 * (`refunded_count`, `refunded_amount`, le montant rendu), et l'invariant devient reçus + en retard +
 * à venir + remboursés = attendus. Absentes (API d'avant), les deux clés valent 0.
 */

export interface LoyersDuMois {
  readonly recus: number;
  readonly attendus: number;
  readonly montantRecu: number;
  /** TCK-2774 : `null` si l'API ne sert pas le segment, ou s'il ne boucle pas sur les attendus. */
  readonly enRetard: { readonly n: number; readonly montant: number | null } | null;
  readonly aVenir: { readonly n: number; readonly montant: number | null } | null;
  /** TCK-2820 : « 1 reçu puis remboursé » ; `null` si aucun, ou si les segments ne sont pas rendus. */
  readonly rembourses: { readonly n: number; readonly montant: number | null } | null;
}

const entier = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const montant = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function segment(bloc: Record<string, unknown>, prefixe: 'overdue' | 'upcoming' | 'refunded') {
  const n = entier(bloc[`${prefixe}_count`]);
  return n === null ? null : { n, montant: montant(bloc[`${prefixe}_amount`]) };
}

/**
 * `rent_month` validé, ou `null` : bloc absent (persona sans loyers, API ancienne), illisible, ou un
 * mois sans aucun loyer attendu (le bloc n'a rien à dire). Un compte de reçus supérieur aux attendus
 * est une incohérence de l'API : rien n'est rendu plutôt qu'une barre fausse.
 */
export function lireLoyersDuMois(metrics: Record<string, unknown> | null | undefined): LoyersDuMois | null {
  const bloc = metrics?.rent_month;
  if (!bloc || typeof bloc !== 'object' || Array.isArray(bloc)) return null;
  const b = bloc as Record<string, unknown>;
  const recus = entier(b.received_count);
  const attendus = entier(b.expected_count);
  const montantRecu = montant(b.received_amount);
  if (recus === null || attendus === null || montantRecu === null || attendus === 0 || recus > attendus) return null;
  const enRetard = segment(b, 'overdue');
  const aVenir = segment(b, 'upcoming');
  // TCK-2820 — absente, la clé vaut 0 (API d'avant) ; présente mais illisible, rien ne boucle.
  const rembourses = b.refunded_count === undefined ? { n: 0, montant: 0 } : segment(b, 'refunded');
  // Les segments vont ensemble, et leur somme avec les reçus doit faire les attendus (l'invariant
  // de TCK-2774, remboursés compris depuis TCK-2820) : sinon la barre mentirait, et ils ne sont pas rendus.
  const coherents =
    enRetard !== null && aVenir !== null && rembourses !== null && recus + enRetard.n + aVenir.n + rembourses.n === attendus;
  return {
    recus,
    attendus,
    montantRecu,
    enRetard: coherents ? enRetard : null,
    aVenir: coherents ? aVenir : null,
    rembourses: coherents && rembourses.n > 0 ? rembourses : null,
  };
}

/** Les largeurs de la barre, en pour cent (arrondies au dixième) : reçus, puis en retard s'il est servi. */
export function largeursDeLaBarre(l: LoyersDuMois): { readonly recus: number; readonly enRetard: number } {
  const part = (n: number) => Math.round((n / l.attendus) * 1000) / 10;
  return { recus: part(l.recus), enRetard: l.enRetard ? part(l.enRetard.n) : 0 };
}

/**
 * Les bornes du mois de `jour` (`AAAA-MM-JJ`, jour de Dakar) : le lien « Voir les loyers » ouvre
 * l'historique des paiements sur ce mois (AC4).
 */
export function bornesDuMois(jour: string): { readonly du: string; readonly au: string; readonly mois: number } {
  const [a, m] = jour.split('-').map(Number) as [number, number];
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { du: `${a}-${mm}-01`, au: `${a}-${mm}-${String(dernier).padStart(2, '0')}`, mois: m };
}
