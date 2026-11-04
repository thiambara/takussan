/**
 * TCK-2475 — les dernières recherches faites sur CET appareil, proposées au focus d'un champ vide.
 *
 * Elles ne quittent jamais le navigateur : le journal des recherches est tenu par le serveur, sur
 * la seule recherche validée et sans rien par personne (ADR-0088) ; celles-ci n'en sont qu'un
 * raccourci local. Tout accès au stockage est enveloppé : en navigation privée, sous quota ou
 * stockage bloqué, `localStorage` lève — la barre fonctionne alors sans récentes.
 */
export const RECHERCHES_RECENTES_CLE = 'takussan.recherches-recentes';
export const RECHERCHES_RECENTES_MAX = 6;

export type RechercheRecente = {
  /** Ce que le visiteur a vu : sa saisie, ou le libellé de la suggestion choisie. */
  readonly texte: string;
  /** La chaîne d'URL de la liste, sans la langue : la recherche se rejoue dans la langue courante. */
  readonly qs: string;
};

function estRecente(e: unknown): e is RechercheRecente {
  return (
    e !== null &&
    typeof e === 'object' &&
    typeof (e as RechercheRecente).texte === 'string' &&
    typeof (e as RechercheRecente).qs === 'string'
  );
}

export function lireRecherchesRecentes(): RechercheRecente[] {
  if (typeof window === 'undefined') return [];
  try {
    const brut = window.localStorage.getItem(RECHERCHES_RECENTES_CLE);
    if (!brut) return [];
    const lu: unknown = JSON.parse(brut);
    return Array.isArray(lu) ? lu.filter(estRecente).slice(0, RECHERCHES_RECENTES_MAX) : [];
  } catch {
    return [];
  }
}

export function retenirRecherche(recherche: RechercheRecente): void {
  if (typeof window === 'undefined') return;
  const texte = recherche.texte.trim();
  if (!texte) return;
  const suivantes = [
    { texte, qs: recherche.qs },
    ...lireRecherchesRecentes().filter((r) => r.qs !== recherche.qs),
  ].slice(0, RECHERCHES_RECENTES_MAX);
  try {
    window.localStorage.setItem(RECHERCHES_RECENTES_CLE, JSON.stringify(suivantes));
  } catch {
    /* quota, navigation privée : la recherche n'est simplement pas retenue */
  }
}

export function effacerRecherchesRecentes(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECHERCHES_RECENTES_CLE);
  } catch {
    /* stockage bloqué : rien à effacer qu'on puisse atteindre */
  }
}
