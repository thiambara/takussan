import type { TeamPerformanceRow } from '@/lib/queries/agency-reporting';

/**
 * TCK-2629 — l'onglet « Équipe » de Rapports : une ligne par agent (`team-performance`, le mois), jointe au
 * délai de première réponse de l'agent (`contact-leads/response-stats`, TCK-2583) par l'identifiant.
 */
export interface LigneDEquipe extends TeamPerformanceRow {
  /** Médiane du délai de première réponse, en secondes ; `null` : aucune réponse mesurée (ou colonne absente). */
  readonly delai: number | null;
}

export type ColonneDEquipe =
  | 'name'
  | 'properties_managed'
  | 'leads_handled'
  | 'visits_completed'
  | 'leases_signed'
  | 'commissions_earned'
  | 'delai';

export function joindreLesDelais(
  agents: readonly TeamPerformanceRow[],
  delais: readonly { readonly user: { readonly id: number }; readonly median_first_response_seconds: number | null }[] | null,
): LigneDEquipe[] {
  const parAgent = new Map((delais ?? []).map((d) => [d.user.id, d.median_first_response_seconds]));
  return agents.map((a) => ({ ...a, delai: parAgent.get(a.user_id) ?? null }));
}

/**
 * Le tri d'une colonne (`-cle` : décroissant). Une valeur absente (délai non mesuré) va TOUJOURS en fin,
 * quel que soit le sens : un agent sans mesure n'est ni le plus rapide ni le plus lent.
 */
export function trierLEquipe(lignes: readonly LigneDEquipe[], tri: string): LigneDEquipe[] {
  const desc = tri.startsWith('-');
  const cle = (desc ? tri.slice(1) : tri) as ColonneDEquipe;
  return [...lignes].sort((a, b) => {
    if (cle === 'name') {
      const ecart = (a.name ?? '').localeCompare(b.name ?? '');
      return desc ? -ecart : ecart;
    }
    const va = cle === 'delai' ? a.delai : (a[cle] ?? 0);
    const vb = cle === 'delai' ? b.delai : (b[cle] ?? 0);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return desc ? vb - va : va - vb;
  });
}

/** Un délai en secondes, en morceaux à dire : « 45 min », « 1 h 10 », « 26 h ». */
export function morceauxDuDelai(secondes: number): { readonly forme: 'minutes' | 'heuresMinutes' | 'heures'; readonly h: number; readonly m: number } {
  const minutes = Math.max(0, Math.round(secondes / 60));
  if (minutes < 60) return { forme: 'minutes', h: 0, m: minutes };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h >= 24 || m === 0 ? { forme: 'heures', h: m >= 30 && h >= 24 ? h + 1 : h, m: 0 } : { forme: 'heuresMinutes', h, m };
}

/** Au-delà de 24 h, le délai se dit en ton d'alerte (maquette : « 26 h », `lent`). */
export const DELAI_LENT_SECONDES = 24 * 3600;
