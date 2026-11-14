/**
 * TCK-2624 (lot 2) — « Loyers de novembre : 8 reçus sur 14 » du bailleur, lu depuis
 * `metrics.rent_month` de `GET /api/dashboard/me` (TCK-2623, `DashboardOwnerService::loyersDuMois`).
 *
 * L'API sert aujourd'hui `received_count`, `expected_count` et `received_amount`. Les segments
 * « 3 en retard » et « 3 à venir » de la maquette ne sont pas servis POUR LE MOIS (`overdue_*` compte
 * toutes les périodes) : ils ne sont rendus que si l'API les sert un jour (TCK-2774), jamais déduits
 * ici (décision 2 de TCK-2624, validée le 2026-11-13 : « pas de chiffre inventé »).
 */

export interface LoyersDuMois {
  readonly recus: number;
  readonly attendus: number;
  readonly montantRecu: number;
  /** TCK-2774 : `null` tant que l'API ne sert pas le segment. */
  readonly enRetard: { readonly n: number; readonly montant: number | null } | null;
  readonly aVenir: { readonly n: number; readonly montant: number | null } | null;
}

const entier = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const montant = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

function segment(bloc: Record<string, unknown>, prefixe: 'overdue' | 'upcoming') {
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
  // Les deux segments vont ensemble, et leur somme avec les reçus doit faire les attendus (l'invariant
  // de TCK-2774) : sinon la barre mentirait, et ils ne sont pas rendus.
  const coherents = enRetard !== null && aVenir !== null && recus + enRetard.n + aVenir.n === attendus;
  return { recus, attendus, montantRecu, enRetard: coherents ? enRetard : null, aVenir: coherents ? aVenir : null };
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
