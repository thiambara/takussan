/**
 * L'INVENTAIRE DES ROUTES RÉELLES, dérivé du système de fichiers — TCK-439 / TCK-437.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EST DÉRIVÉ, ET NON ÉCRIT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le défaut que ce module existe pour attraper est un `href` qui ne mène nulle part. Une liste de
 * routes écrite à la main ne peut pas l'attraper : elle est juste le jour où on l'écrit, et le
 * jour d'après quelqu'un ajoute un lien vers une page qu'il croit livrée. C'est exactement ce qui
 * s'est produit ici — TCK-419 a relevé quatre liens vers des routes inexistantes, et TCK-439 en a
 * relevé deux de plus, écrits `#`.
 *
 * L'inventaire est donc lu dans `src/app`, en marchant les répertoires jusqu'aux `page.tsx`. Une
 * page ajoutée entre dans l'inventaire sans que personne l'y déclare ; une page supprimée en sort
 * de même. C'est la règle « un document dérivé suit encore sa source » du `CLAUDE.md`, appliquée
 * à la seule chose dont un lien a besoin pour ne pas mentir.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL PARTAGE, ET AVEC QUI
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Trois tickets ont besoin du même inventaire et l'AC de chacun interdit d'en recopier un :
 * TCK-439 (le menu mobile), TCK-437 (le pied de page), TCK-436 (les index `/agencies` et
 * `/agents`). **Le jour où TCK-436 livre ses deux pages, `/agencies` et `/agents` entrent ici
 * tout seuls** — aucune ligne de ce fichier n'est à toucher, et les liens du pied de page cessent
 * de rougir au moment exact où ils cessent d'être faux.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA FORME DES CHEMINS ATTENDUE EN ENTRÉE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `routeExiste()` prend le `href` tel qu'il est ÉCRIT dans le code — c'est-à-dire **sans langue**
 * (`/properties?featured=true`), puisque c'est `LienLocalise` qui ajoute le segment de langue
 * (ADR-0026). Le segment `[locale]` est donc effacé de l'inventaire, et un `href` qui porterait
 * déjà une langue est accepté aussi : le proxy sert les deux formes, et refuser la seconde ferait
 * rougir un lien parfaitement valide.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

import { LOCALES } from '@/i18n/config';

const RACINE_APP = join(process.cwd(), 'src', 'app');

/** `page.tsx`, `page.ts`, `page.jsx`, `page.js` — les quatre formes que Next reconnaît. */
const FICHIER_DE_PAGE = /^page\.(tsx|ts|jsx|js)$/;

/**
 * Les segments de répertoire qui N'APPARAISSENT PAS dans l'URL.
 *
 * · `(groupe)` — groupe de routes : purement organisationnel.
 * · `@slot`    — route parallèle : rendue dans un emplacement, jamais adressée seule.
 * · `[locale]` — le segment de langue d'ADR-0026, que `LienLocalise` ajoute au moment du rendu.
 *                Un `href` écrit dans le code ne le porte pas ; l'effacer ici est ce qui permet
 *                de comparer les deux formes.
 */
function segmentInvisible(segment: string): boolean {
  return (
    (segment.startsWith('(') && segment.endsWith(')'))
    || segment.startsWith('@')
    || segment === '[locale]'
  );
}

function estDynamique(segment: string): boolean {
  return segment.startsWith('[') && segment.endsWith(']');
}

function fichiersDePage(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    // `_composants`, `__tests__`, `components` : Next ignore tout répertoire qui commence par `_`,
    // et les autres n'exposent pas de route tant qu'ils ne portent pas de `page.*`. On descend
    // quand même : c'est le `page.*` qui décide, pas le nom du répertoire.
    if (entree.startsWith('_')) continue;
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) fichiersDePage(chemin, acc);
    else if (FICHIER_DE_PAGE.test(entree)) acc.push(chemin);
  }
  return acc;
}

/**
 * Les motifs de route du produit, sans langue : `/`, `/properties`, `/properties/[slug]`,
 * `/publish`, `/app/overview`, … Un segment dynamique reste écrit `[…]` ; c'est
 * {@link routeExiste} qui l'apparie.
 */
export const MOTIFS_DE_ROUTE: readonly string[] = (() => {
  const motifs = new Set<string>();
  for (const fichier of fichiersDePage(RACINE_APP)) {
    const segments = fichier
      .slice(RACINE_APP.length + 1)
      .split(sep)
      .slice(0, -1) // retire `page.tsx`
      .filter((s) => !segmentInvisible(s));
    motifs.add(`/${segments.join('/')}`.replace(/\/+$/, '') || '/');
  }
  return [...motifs].sort();
})();

/** Le chemin nu d'un `href` : sans requête, sans ancre, sans langue, sans slash final. */
export function cheminNu(href: string): string {
  const chemin = href.split(/[?#]/)[0] ?? '';
  const sansLangue = LOCALES.reduce(
    (acc, langue) => (acc === `/${langue}` ? '/' : acc.replace(new RegExp(`^/${langue}(?=/)`), '')),
    chemin,
  );
  return sansLangue.replace(/\/+$/, '') || '/';
}

/**
 * Le `href` mène-t-il à une route que ce dépôt sert réellement ?
 *
 * Rend `false` pour `#`, pour une ancre nue, et pour tout chemin sans page. Rend `true` pour une
 * URL absolue (`https://…`, `mailto:`, `tel:`) — elle sort du dépôt, aucun inventaire local ne
 * peut en juger, et la refuser transformerait la garde en obstacle.
 */
export function routeExiste(href: string): boolean {
  if (href === '' || href.startsWith('#')) return false;
  if (!href.startsWith('/')) return true; // absolue : hors de portée de cet inventaire
  const segments = cheminNu(href).split('/').filter(Boolean);
  return MOTIFS_DE_ROUTE.some((motif) => {
    const attendus = motif.split('/').filter(Boolean);
    if (attendus.length !== segments.length) {
      // Un attrape-tout `[...slug]` couvre un ou plusieurs segments restants.
      const dernier = attendus.at(-1);
      if (!dernier?.startsWith('[...')) return false;
      if (segments.length < attendus.length) return false;
    }
    return attendus.every((attendu, i) => {
      if (attendu.startsWith('[...')) return true;
      return estDynamique(attendu) ? segments[i] !== undefined : attendu === segments[i];
    });
  });
}
