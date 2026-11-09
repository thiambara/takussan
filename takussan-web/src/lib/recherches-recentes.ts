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
    // Revue de TCK-2497 — une entrée sans texte (corrompue, ou d'avant la garde de `retenirRecherche`)
    // se rendait en option VIDE, sans nom accessible.
    (e as RechercheRecente).texte.trim() !== '' &&
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

/**
 * TCK-2497 — QUAND chaque récente a été lancée pour la dernière fois, par chaîne d'URL : l'écran de
 * recherche en déduit « N nouveaux depuis votre dernière visite » (`published_after`, TCK-2496).
 *
 * Une clé À PART, et non un champ de plus dans {@link RechercheRecente} : les récentes retenues avant
 * ce ticket n'ont pas de date, et la forme `{texte, qs}` est celle que lisent déjà la barre et ses
 * tests. Une récente sans date s'affiche sans compte — jamais avec un compte inventé.
 */
export const RECHERCHES_RECENTES_VUES_CLE = 'takussan.recherches-recentes.vues';

/** Les dates (ISO 8601) des récentes encore retenues, par `qs`. */
export function lireVuesDesRecherches(): Readonly<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const brut = window.localStorage.getItem(RECHERCHES_RECENTES_VUES_CLE);
    const lu: unknown = brut ? JSON.parse(brut) : null;
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) return {};
    const vues: Record<string, string> = {};
    for (const [qs, vue] of Object.entries(lu)) {
      if (typeof vue === 'string' && !Number.isNaN(Date.parse(vue))) vues[qs] = vue;
    }
    return vues;
  } catch {
    return {};
  }
}

export function retenirRecherche(recherche: RechercheRecente, maintenant: Date = new Date()): void {
  if (typeof window === 'undefined') return;
  const texte = recherche.texte.trim();
  if (!texte) return;
  const suivantes = [
    { texte, qs: recherche.qs },
    ...lireRecherchesRecentes().filter((r) => r.qs !== recherche.qs),
  ].slice(0, RECHERCHES_RECENTES_MAX);
  // Les dates suivent les récentes : celles qui sortent de la liste perdent la leur.
  const anciennes = lireVuesDesRecherches();
  const vues: Record<string, string> = {};
  for (const r of suivantes) {
    const vue = r.qs === recherche.qs ? maintenant.toISOString() : anciennes[r.qs];
    if (vue) vues[r.qs] = vue;
  }
  try {
    window.localStorage.setItem(RECHERCHES_RECENTES_CLE, JSON.stringify(suivantes));
    window.localStorage.setItem(RECHERCHES_RECENTES_VUES_CLE, JSON.stringify(vues));
  } catch {
    /* quota, navigation privée : la recherche n'est simplement pas retenue */
  }
}

export function effacerRecherchesRecentes(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(RECHERCHES_RECENTES_CLE);
    window.localStorage.removeItem(RECHERCHES_RECENTES_VUES_CLE);
  } catch {
    /* stockage bloqué : rien à effacer qu'on puisse atteindre */
  }
}
