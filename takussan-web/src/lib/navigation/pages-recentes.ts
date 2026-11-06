/**
 * TCK-2482 (A8) — les pages de `/app` ouvertes sur CET appareil, que la palette de commandes propose sous
 * « Récents ». Patron : `src/lib/recherches-recentes.ts` (TCK-2475).
 *
 * - Par compte (`takussan.pages-recentes.<id>`) : un autre compte du même appareil ne les lit pas.
 * - Des chemins BRUTS (`/app/leases/42`) : la palette les résout sur le menu du jour
 *   (`optionsDeLaPalette`), si bien qu'un chemin que le menu ne couvre plus disparaît de lui-même.
 * - Rien ne quitte le navigateur. Tout accès au stockage est enveloppé : en navigation privée, sous quota
 *   ou stockage bloqué, `localStorage` lève — la palette fonctionne alors sans récents.
 * - Nommées par la politique de confidentialité (`src/content/legal/privacy.ts`, § 8).
 */
export const PAGES_RECENTES_MAX = 8;

export function clePagesRecentes(compte: number | string): string {
  return `takussan.pages-recentes.${compte}`;
}

function estUnCheminDeLApp(chemin: unknown): chemin is string {
  return typeof chemin === 'string' && (chemin === '/app' || chemin.startsWith('/app/'));
}

export function lirePagesRecentes(compte: number | string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const brut = window.localStorage.getItem(clePagesRecentes(compte));
    if (!brut) return [];
    const lu: unknown = JSON.parse(brut);
    return Array.isArray(lu) ? lu.filter(estUnCheminDeLApp).slice(0, PAGES_RECENTES_MAX) : [];
  } catch {
    return [];
  }
}

export function retenirPage(compte: number | string, chemin: string): void {
  if (typeof window === 'undefined' || !estUnCheminDeLApp(chemin)) return;
  const suivantes = [chemin, ...lirePagesRecentes(compte).filter((c) => c !== chemin)].slice(0, PAGES_RECENTES_MAX);
  try {
    window.localStorage.setItem(clePagesRecentes(compte), JSON.stringify(suivantes));
  } catch {
    /* quota, navigation privée : la page n'est simplement pas retenue */
  }
}
