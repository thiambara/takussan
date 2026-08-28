import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PAGES_STATIQUES_INDEXABLES,
  ROUTES_DYNAMIQUES_PUBLIQUES,
} from '../sitemap';

/**
 * TCK-431 · AC3 et AC4 — **le sitemap et l'arborescence réelle sont confrontés, pas comparés de
 * mémoire.**
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE TEST MARCHE LE SYSTÈME DE FICHIERS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC3 demande qu'*« aucune URL déclarant `robots: { index: false }` n'apparaisse dans le
 * sitemap »*, et que le test *« rougisse si `/favorites` y était ajouté »*. Un test qui listerait
 * `/favorites`, `/compare`, `/bookings` à la main satisferait la lettre et rien d'autre : il
 * resterait vert le jour où quelqu'un ajoute une huitième page publique non indexable, ou une
 * page indexable qu'on oublie de déclarer.
 *
 * La source de vérité est donc l'arborescence de `src/app/[locale]/(public)/`, relue à chaque
 * exécution, et l'équivalence est vérifiée **dans les deux sens** :
 *
 *   · une page statique sans `index: false` DOIT être dans `PAGES_STATIQUES_INDEXABLES` ;
 *   · une page statique avec `index: false` ne peut PAS y être.
 *
 * ⚠ Ce test lit le TEXTE des fichiers de route. C'est un plancher, pas une preuve : il constate
 * qu'une déclaration est écrite, pas que Next la rend. Ce qu'il attrape — une page ajoutée sans
 * décision d'indexation — est précisément le défaut que TCK-431 corrige, et qu'aucun test de rendu
 * n'aurait vu.
 */

const RACINE_PUBLIQUE = join(process.cwd(), 'src/app/[locale]/(public)');

type Indexabilite = 'indexable' | 'noindex' | 'inconnu';

type RoutePublique = {
  /** Chemin SANS langue, tel que le sitemap le manipule : `/`, `/properties/[slug]`. */
  readonly chemin: string;
  readonly fichier: string;
  readonly dynamique: boolean;
  readonly indexabilite: Indexabilite;
  readonly indexable: boolean;
};

/**
 * Retire commentaires de bloc et de ligne.
 *
 * ⚠️ **Sans cela, le classement lit la PROSE.** `playground/page.tsx` cite
 * `robots: { index: true, follow: true }` dans son docblock — pour expliquer ce que la métadonnée
 * du layout déclare — **avant** son propre `robots: { index: false }`. Un classement naïf le
 * lirait indexable, c'est-à-dire l'inverse de ce que la page fait.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Le corps d'un objet littéral, ACCOLADES ÉQUILIBRÉES, à partir de son `{`.
 *
 * ⚠ La version précédente lisait `\{([^}]*)\}`, qui s'arrête à la PREMIÈRE accolade fermante :
 * `robots: { googleBot: { index: false }, index: true }` — une page indexable pour tous les
 * moteurs sauf Google — en sortait classée `noindex`. L'erreur allait dans le sens sûr (la page
 * aurait été refusée au sitemap) mais elle aurait produit une « page indexable absente du
 * sitemap » que rien d'autre ne signale.
 */
function corpsEquilibre(source: string, debut: number): string | null {
  let profondeur = 0;
  for (let i = debut; i < source.length; i += 1) {
    if (source[i] === '{') profondeur += 1;
    else if (source[i] === '}') {
      profondeur -= 1;
      if (profondeur === 0) return source.slice(debut + 1, i);
    }
  }
  return null;
}

/** Le corps privé de ses objets IMBRIQUÉS — pour ne lire que le premier niveau. */
function premierNiveau(corps: string): string {
  let sortie = '';
  let profondeur = 0;
  for (const c of corps) {
    if (c === '{') profondeur += 1;
    else if (c === '}') profondeur -= 1;
    else if (profondeur === 0) sortie += c;
  }
  return sortie;
}

/**
 * L'indexabilité déclarée par un fichier de route — **et `'inconnu'` est une VALEUR, pas un repli.**
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * LE DÉFAUT QUE CETTE FONCTION CORRIGE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Ce test décidait par la seule expression `/index\s*:\s*false/`. Next accepte **deux** formes,
 * toutes deux documentées dans son typage (`metadata-interface.d.ts`, `robots?: null | string |
 * Robots`) et résolues par `resolve-basics.js` :
 *
 *     robots: { index: false, follow: false }     ← objet
 *     robots: 'noindex, nofollow'                 ← chaîne
 *
 * Une page écrite sous la seconde était classée **indexable**, donc RÉCLAMÉE dans
 * `PAGES_STATIQUES_INDEXABLES` — et une fois ajoutée, les tests passaient avec trois `<loc>`
 * `noindex` dans le sitemap.
 *
 * ⚠️ **Le défaut n'était pas la forme manquante, c'était le REPLI SUR « indexable ».** Il avait
 * d'ailleurs SURVÉCU à la première correction, d'un cran plus bas : la fonction rendait
 * `'indexable'` dès que le jeton `robots:` était absent du fichier — donc une page dont la
 * métadonnée est IMPORTÉE (`export { META as metadata } from './meta'`) passait pour indexable
 * alors qu'elle sert `noindex`. C'est le cas que le docblock prétendait couvrir.
 *
 * La règle est désormais **positive** : on ne classe que ce qu'on peut LIRE SUR PLACE.
 *
 * · aucune déclaration littérale de `metadata` / `generateMetadata` dans le fichier → `'inconnu'` ;
 * · une métadonnée réexportée ou affectée depuis un identifiant importé → `'inconnu'` ;
 * · une déclaration lisible SANS `robots` → `'indexable'` (elle hérite du layout du groupe, qui
 *   déclare `robots: { index: true, follow: true }`) ;
 * · une déclaration lisible AVEC `robots` sous une forme reconnue → cette forme ;
 * · toute autre forme de `robots` → `'inconnu'`.
 *
 * Mesuré le 2026-08-28 : les NEUF pages publiques déclarent leur métadonnée sur place, donc
 * exiger la déclaration ne coûte aucun faux positif aujourd'hui.
 */
function indexabiliteDe(source: string): Indexabilite {
  const propre = sansCommentaires(source);

  // ── Ce qui n'est pas lisible sur place n'est pas classé ────────────────────────────────────
  if (/export\s*\{[^}]*\bmetadata\b[^}]*\}\s*from/.test(propre)) return 'inconnu';
  if (/export\s+const\s+metadata\s*(?::[^=]*)?=\s*[A-Za-z_$][\w$]*\s*;/.test(propre)) return 'inconnu';
  if (!/export\s+(?:async\s+)?function\s+generateMetadata|export\s+const\s+metadata\s*[:=]/.test(propre)) {
    return 'inconnu';
  }

  if (!/\brobots\s*:/.test(propre)) return 'indexable';

  const chaine = propre.match(/\brobots\s*:\s*(['"`])([^'"`]*)\1/);
  if (chaine) return /\bnoindex\b/i.test(chaine[2]!) ? 'noindex' : 'indexable';

  const ouverture = propre.search(/\brobots\s*:\s*\{/);
  if (ouverture !== -1) {
    const corps = corpsEquilibre(propre, propre.indexOf('{', ouverture));
    if (corps !== null) {
      // ⚠ PREMIER NIVEAU seulement : un `googleBot: { index: false }` imbriqué ne décide pas de
      // l'indexabilité générale de la page.
      const plat = premierNiveau(corps);
      if (/\bindex\s*:\s*false\b/.test(plat)) return 'noindex';
      if (/\bindex\s*:\s*true\b/.test(plat)) return 'indexable';
    }
  }

  return 'inconnu';
}

/** Les segments entre parenthèses sont des GROUPES : ils ne paraissent pas dans l'URL. */
function cheminDeRoute(dossier: string): string {
  const segments = relative(RACINE_PUBLIQUE, dossier)
    .split('/')
    .filter((s) => s !== '' && !(s.startsWith('(') && s.endsWith(')')));
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function collecter(dossier: string, acc: RoutePublique[] = []): RoutePublique[] {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === '__tests__' || entree.name === 'components') continue;
      collecter(chemin, acc);
    } else if (entree.name === 'page.tsx') {
      const source = readFileSync(chemin, 'utf8');
      const route = cheminDeRoute(dossier);
      const indexabilite = indexabiliteDe(source);
      acc.push({
        chemin: route,
        fichier: relative(process.cwd(), chemin),
        dynamique: route.includes('['),
        indexabilite,
        // ⚠ `'inconnu'` n'est PAS traité comme indexable : il fait rougir un test dédié. Le
        // compter ici d'un côté ou de l'autre reproduirait le repli qu'on vient de retirer.
        indexable: indexabilite === 'indexable',
      });
    }
  }
  return acc;
}

const ROUTES = collecter(RACINE_PUBLIQUE);

describe('l’arborescence publique est bien celle qu’on croit', () => {
  it('trouve un nombre plausible de pages', () => {
    // Le contrôle qui garde le test : un `(public)` déplacé, un glob cassé, et l'équivalence
    // ci-dessous deviendrait « ∅ = ∅ », c'est-à-dire verte en ne mesurant rien.
    expect(ROUTES.length).toBeGreaterThanOrEqual(7);
  });

  it('classe CHAQUE route, sans laisser une seule forme non reconnue', () => {
    // Le cœur du correctif : une forme de `robots` que la fonction ne sait pas lire ne se range
    // plus du côté « indexable ». Elle nomme le fichier et fait rougir.
    const opaques = ROUTES.filter((r) => r.indexabilite === 'inconnu');
    expect(
      opaques.map((r) => `${r.chemin} (${r.fichier})`),
      'forme de `robots` non reconnue — la classer par défaut ouvrirait l’indexation',
    ).toEqual([]);
  });

  it('reconnaît les DEUX formes valides de `robots`, et le déclare sur des sources écrites ici', () => {
    // Éprouvé sur des sources littérales plutôt que sur les fichiers du dépôt : aucune page ne
    // porte aujourd'hui la forme chaîne, donc l'arborescence seule ne pourrait pas le montrer.
    expect(indexabiliteDe("export const metadata = { robots: { index: false, follow: false } };"))
      .toBe('noindex');
    expect(indexabiliteDe("export const metadata = { robots: 'noindex, nofollow' };")).toBe(
      'noindex',
    );
    expect(indexabiliteDe('export const metadata = { robots: "noindex" };')).toBe('noindex');
    expect(indexabiliteDe("export const metadata = { robots: { index: true } };")).toBe('indexable');
    expect(indexabiliteDe("export const metadata = { robots: 'index, follow' };")).toBe('indexable');
    expect(indexabiliteDe('export const metadata = { title: "x" };')).toBe('indexable');
    // La troisième forme, celle qui n'existe pas encore.
    expect(indexabiliteDe('export const metadata = { robots: robotsDeLaPage() };')).toBe('inconnu');
    expect(indexabiliteDe('export const metadata = { robots: REGLES };')).toBe('inconnu');
  });

  it('une métadonnée qu’on ne peut pas LIRE SUR PLACE rend « inconnu »', () => {
    /*
     * ⚠ Le repli sur « indexable » avait SURVÉCU à la première correction, d'un cran plus bas :
     * la fonction rendait `'indexable'` dès que le jeton `robots:` était absent du fichier. Une
     * page dont la métadonnée est IMPORTÉE n'en porte aucun — elle passait donc pour indexable,
     * était réclamée dans le sitemap, et 60 tests passaient avec elle dedans alors qu'elle sert
     * `noindex`. C'est le cas que le docblock prétendait déjà couvrir.
     */
    expect(indexabiliteDe("export { META as metadata } from './meta';")).toBe('inconnu');
    expect(indexabiliteDe("import { META } from './meta';\nexport const metadata = META;")).toBe(
      'inconnu',
    );
    expect(indexabiliteDe('export default function Page() { return null; }')).toBe('inconnu');
  });

  it('lit l’objet `robots` AU-DELÀ de la première accolade fermante', () => {
    // `robots: { googleBot: { index: false }, index: true }` est une page indexable pour tous les
    // moteurs SAUF Google. L'ancienne lecture `\{([^}]*)\}` s'arrêtait à l'accolade de
    // `googleBot` et la classait `noindex` : l'erreur allait dans le sens sûr, mais elle
    // produisait une « page indexable absente du sitemap » que rien d'autre ne signale.
    expect(
      indexabiliteDe(
        'export const metadata = { robots: { googleBot: { index: false }, index: true } };',
      ),
    ).toBe('indexable');
    expect(
      indexabiliteDe(
        'export const metadata = { robots: { googleBot: { index: true }, index: false } };',
      ),
    ).toBe('noindex');
  });

  it('les NEUF pages publiques déclarent leur métadonnée sur place', () => {
    // Le contrôle qui rend la règle positive tenable : si une page cessait de le faire, elle
    // deviendrait `'inconnu'` et le test de classement complet la nommerait. On le fige ici pour
    // que la raison soit lisible plutôt que déduite d'un rouge ailleurs.
    expect(ROUTES.length).toBe(9);
    for (const route of ROUTES) {
      expect(route.indexabilite, `${route.chemin} (${route.fichier})`).not.toBe('inconnu');
    }
  });

  it('ne se laisse pas tromper par un `robots:` cité dans un COMMENTAIRE', () => {
    // Cas réel : `playground/page.tsx` cite `robots: { index: true, follow: true }` dans son
    // docblock, AVANT son propre `robots: { index: false }`.
    const source = readFileSync(join(RACINE_PUBLIQUE, 'playground/page.tsx'), 'utf8');
    expect(source).toContain('index: true');
    expect(indexabiliteDe(source)).toBe('noindex');
  });

  it('voit les deux natures de page — sinon la détection d’`index: false` est cassée', () => {
    expect(ROUTES.some((r) => r.indexable)).toBe(true);
    expect(ROUTES.some((r) => !r.indexable)).toBe(true);
  });
});

describe('TCK-431 · AC3 — le sitemap ⇔ les pages indexables', () => {
  const statiques = ROUTES.filter((r) => !r.dynamique);
  const declarees = new Set(PAGES_STATIQUES_INDEXABLES.map((p) => p.chemin));

  it('toute page statique indexable est dans le sitemap', () => {
    const oubliees = statiques.filter((r) => r.indexable && !declarees.has(r.chemin));
    expect(
      oubliees.map((r) => `${r.chemin} (${r.fichier})`),
      'page publique indexable absente de PAGES_STATIQUES_INDEXABLES',
    ).toEqual([]);
  });

  it('aucune page déclarant `index: false` n’est dans le sitemap', () => {
    // C'est l'assertion que l'AC met à l'épreuve : ajouter `/favorites` à
    // `PAGES_STATIQUES_INDEXABLES` la fait rougir, parce que `/favorites/page.tsx` déclare
    // `robots: { index: false, follow: false }`.
    const intruses = statiques.filter((r) => !r.indexable && declarees.has(r.chemin));
    expect(
      intruses.map((r) => `${r.chemin} (${r.fichier})`),
      'page non indexable présente dans le sitemap',
    ).toEqual([]);
  });

  it('les trois écrans personnels sont bien vus comme non indexables', () => {
    // Nommés — si l'un d'eux perdait son `index: false`, l'équivalence ci-dessus resterait
    // satisfaite (il rejoindrait simplement le sitemap) et le défaut passerait inaperçu.
    for (const chemin of ['/favorites', '/compare', '/bookings']) {
      const route = ROUTES.find((r) => r.chemin === chemin);
      expect(route, `route ${chemin} introuvable`).toBeDefined();
      expect(route!.indexable, `${chemin} devrait déclarer robots: { index: false }`).toBe(false);
    }
  });

  it('le sitemap ne déclare aucun chemin qui ne corresponde à une route', () => {
    for (const page of PAGES_STATIQUES_INDEXABLES) {
      expect(
        ROUTES.some((r) => r.chemin === page.chemin),
        `PAGES_STATIQUES_INDEXABLES déclare « ${page.chemin} », qu'aucune page ne sert`,
      ).toBe(true);
    }
  });
});

describe('TCK-431 · AC4 — /playground n’est plus servi indexable', () => {
  it('la route existe encore — le POC est un outil de dev, il n’est pas supprimé', () => {
    expect(ROUTES.some((r) => r.chemin === '/playground')).toBe(true);
  });

  it('sa métadonnée déclare `index: false`', () => {
    const route = ROUTES.find((r) => r.chemin === '/playground')!;
    expect(route.indexable).toBe(false);
  });

  it('la déclaration est bien une MÉTADONNÉE, pas un commentaire', () => {
    // Le ticket l'exige en toutes lettres : « un test le constate depuis la métadonnée […] pas
    // depuis un commentaire ». On importe le module et on lit l'objet exporté.
    const source = readFileSync(
      join(RACINE_PUBLIQUE, 'playground/page.tsx'),
      'utf8',
    );
    expect(source).toMatch(/export const metadata\s*:\s*Metadata\s*=/);
    expect(source).not.toMatch(/^\s*'use client'/m);
  });

  it('n’est pas non plus dans le sitemap', () => {
    expect(PAGES_STATIQUES_INDEXABLES.map((p) => p.chemin)).not.toContain('/playground');
  });
});

describe('TCK-431 — le point d’extension des routes dynamiques (TCK-436)', () => {
  const dynamiques = ROUTES.filter((r) => r.dynamique);

  it('trouve les trois routes dynamiques publiques', () => {
    expect(dynamiques.map((r) => r.chemin).sort()).toEqual([
      '/agencies/[slug]',
      '/agents/[slug]',
      '/properties/[slug]',
    ]);
  });

  it('chacune est TRANCHÉE dans ROUTES_DYNAMIQUES_PUBLIQUES', () => {
    // Une fiche publique neuve ne peut pas rejoindre le catalogue sans que quelqu'un ait décidé
    // si elle entre au sitemap. C'est le « point d'extension nommé » plutôt qu'un TODO.
    const nonTranchees = dynamiques.filter((r) => !(r.chemin in ROUTES_DYNAMIQUES_PUBLIQUES));
    expect(nonTranchees.map((r) => r.chemin), 'route dynamique publique non tranchée').toEqual([]);
  });

  it('celles qui ne sont pas alimentées nomment le ticket qui le fera', () => {
    for (const [chemin, decision] of Object.entries(ROUTES_DYNAMIQUES_PUBLIQUES)) {
      if (decision.source === null) {
        expect(decision.ticket, `« ${chemin} » sans source ET sans ticket`).toMatch(/^TCK-\d+$/);
      }
    }
  });

  it('la table ne nomme aucune route disparue', () => {
    for (const chemin of Object.keys(ROUTES_DYNAMIQUES_PUBLIQUES)) {
      expect(
        dynamiques.some((r) => r.chemin === chemin),
        `ROUTES_DYNAMIQUES_PUBLIQUES nomme « ${chemin} », qu'aucune page ne sert`,
      ).toBe(true);
    }
  });
});
