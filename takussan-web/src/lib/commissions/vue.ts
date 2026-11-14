/**
 * TCK-2662 — l'état de `/app/commissions`, porté par la requête de l'URL (patron de TCK-1732 :
 * lu borné, écrit par `router.replace`, la valeur par défaut absente).
 *
 * | Clé       | Qui        | Valeurs                                                              |
 * |-----------|------------|----------------------------------------------------------------------|
 * | `status`  | tous       | `due`, `paid`, `cancelled`, `toutes` ; absente = « Dues »            |
 * | `page`    | tous       | entier ≥ 1                                                           |
 * | `annee`   | l'agent    | `YYYY` : « Payé cette année », la période du tableau, le relevé      |
 * | `periode` | l'agent    | `tout` : le tableau du bureau sans borne (sinon « Depuis janvier »)  |
 * | `mois`    | l'admin    | `YYYY-MM` : « payé en {mois} », l'export du mois                     |
 * | `vue`     | l'admin    | `lignes` : le registre ligne à ligne (sinon « Par agent »)           |
 * | `agent`   | l'admin    | un bénéficiaire : le registre de ses seules lignes                   |
 * | `solder`  | l'admin    | un bénéficiaire : le solde de ses lignes dues, ouvert                 |
 *
 * La puce par défaut (décision 4 b) : sans `status`, « Dues », à TOUTE largeur ; un `status`
 * explicite l'emporte toujours, `toutes` compris. Le rendu serveur ne connaît pas la largeur : un
 * défaut qui en dépendrait ferait basculer la liste après l'hydratation (une seconde requête, la
 * liste qui saute) ou donnerait deux résultats au même lien sur deux appareils. Le « Toutes » de la
 * maquette du bureau est un écart déclaré. Écrire « Dues » RETIRE la clé ({@link statutAEcrire}).
 */
import { estMois } from '@/lib/finances/mois';
import { pageDeLUrl, valeurBornee } from '@/hooks/useVueDansLUrl';
import type { CommissionEntryStatus } from '@/lib/queries/commissions';

type Lecture = Pick<URLSearchParams, 'get' | 'toString'>;

export const STATUTS_DE_COMMISSION: readonly CommissionEntryStatus[] = ['due', 'paid', 'cancelled'];

function identifiant(params: Lecture, cle: string): number | null {
  const v = params.get(cle);
  return v !== null && /^[1-9]\d{0,9}$/.test(v) ? Number(v) : null;
}

export interface VueDesCommissions {
  /** Le statut demandé par l'URL (`toutes` : aucun filtre), `null` sans `status` (« Dues » s'applique). */
  readonly statut: CommissionEntryStatus | 'toutes' | null;
  readonly page: number;
  readonly annee: string;
  readonly toutesLesDates: boolean;
  readonly mois: string;
  readonly lignes: boolean;
  readonly agent: number | null;
  readonly solder: number | null;
}

/** `aujourdhui` : le jour de Dakar `YYYY-MM-DD` (UTC+0 toute l'année). */
export function vueDesCommissions(params: Lecture, aujourdhui: string): VueDesCommissions {
  const anneeCourante = aujourdhui.slice(0, 4);
  const annee = params.get('annee');
  const mois = params.get('mois');
  const agent = identifiant(params, 'agent');
  return {
    statut: valeurBornee(params, 'status', [...STATUTS_DE_COMMISSION, 'toutes'] as const),
    page: pageDeLUrl(params),
    annee: annee !== null && /^\d{4}$/.test(annee) && annee <= anneeCourante && annee >= '2000' ? annee : anneeCourante,
    toutesLesDates: params.get('periode') === 'tout',
    mois: estMois(mois) && mois <= aujourdhui.slice(0, 7) ? mois : aujourdhui.slice(0, 7),
    lignes: params.get('vue') === 'lignes' || agent !== null,
    agent,
    solder: identifiant(params, 'solder'),
  };
}

/** Le statut que lit l'écran (`null` : « Toutes ») : celui de l'URL, sinon « Dues ». */
export function statutAffiche(vue: Pick<VueDesCommissions, 'statut'>): CommissionEntryStatus | null {
  if (vue.statut === 'toutes') return null;
  return vue.statut ?? 'due';
}

/** La valeur de `status` qui rend `choisi` (`null` : « Toutes ») ; « Dues », le défaut, retire la clé. */
export function statutAEcrire(choisi: CommissionEntryStatus | null): string | null {
  if (choisi === 'due') return null;
  return choisi ?? 'toutes';
}

/** L'année entière, bornes incluses : `2026` → `2026-01-01` … `2026-12-31`. */
export function bornesDeLAnnee(annee: string): { readonly du: string; readonly au: string } {
  return { du: `${annee}-01-01`, au: `${annee}-12-31` };
}

/** Les années proposées à l'agent : la courante et les deux d'avant. */
export function anneesProposees(aujourdhui: string): readonly string[] {
  const a = Number(aujourdhui.slice(0, 4));
  return [String(a), String(a - 1), String(a - 2)];
}

/** Le jour de Dakar, `YYYY-MM-DD`. `maintenant` sert aux tests. */
export function jourDeDakar(maintenant: Date = new Date()): string {
  return maintenant.toISOString().slice(0, 10);
}

/** Le jour de Dakar d'un instant ISO (la naissance d'une ligne, sa borne de paiement). */
export function jourDeLInstant(instant: string | null): string | null {
  if (!instant) return null;
  const d = new Date(instant);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
