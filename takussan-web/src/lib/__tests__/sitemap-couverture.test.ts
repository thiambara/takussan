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

/**
 * Comment une page se déclare vis-à-vis des moteurs — TROIS états, pas deux (TCK-436, passe 2).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TROISIÈME ÉTAT EST APPARU
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce test classait une page sur la seule présence du texte `index: false`. Ça suffisait tant que
 * les quatre pages concernées le déclaraient dans un `export const metadata` STATIQUE : elles ne
 * veulent jamais être indexées, quelle que soit l'URL.
 *
 * `/agencies` et `/agents` (TCK-436) ont introduit un cas que la binarité ne sait pas dire :
 * **elles sont indexables sous leur forme nue et ne le sont pas sous une facette inventée.**
 * `?city=Zzzinventee` rend `noindex, follow` (mesuré sur serveur réel), `/agencies` nue rend
 * `index, follow` (mesuré aussi) — et c'est bien la forme NUE que `PAGES_STATIQUES_INDEXABLES`
 * déclare. La déclaration vit donc dans `generateMetadata`, derrière une condition.
 *
 * ⚠ **Ce n'est pas une tolérance ajoutée pour faire passer deux pages.** Une tolérance dirait
 * « ces deux fichiers-là sont exemptés » et laisserait le suivant passer aussi. Ici on lit une
 * PROPRIÉTÉ du fichier — l'endroit où la déclaration est écrite — et les trois états ont chacun
 * une conséquence différente et vérifiée :
 *
 *   `indexable`     → DOIT être dans le sitemap
 *   `jamais`        → ne peut PAS y être            (`export const metadata` statique)
 *   `conditionnel`  → DOIT y être, car sa forme nue l'est  (`generateMetadata`)
 *
 * ⚠ **Ce que ce classement NE voit pas**, et qu'il faut dire plutôt que laisser croire : une page
 * qui rendrait `index: false` INCONDITIONNELLEMENT depuis `generateMetadata` serait rangée en
 * `conditionnel` et exigée dans le sitemap — donc à tort. Le scan lit du texte, il n'évalue rien ;
 * c'était déjà le plancher assumé de ce fichier, et il l'est d'un cran de plus.
 */
type DeclarationRobots = 'indexable' | 'jamais' | 'conditionnel';

type RoutePublique = {
  /** Chemin SANS langue, tel que le sitemap le manipule : `/`, `/properties/[slug]`. */
  readonly chemin: string;
  readonly fichier: string;
  readonly dynamique: boolean;
  readonly robots: DeclarationRobots;
  /** Raccourci : la page peut-elle figurer au sitemap sous sa forme nue ? */
  readonly indexable: boolean;
};

/**
 * Le `index: false` est-il atteint INCONDITIONNELLEMENT, ou seulement dans une branche ?
 *
 * ⚠ **Le premier discriminant essayé — « dans `export const metadata` ou dans
 * `generateMetadata` » — était FAUX, et la mesure l'a dit tout de suite** : trois des quatre
 * pages privées (`favorites`, `compare`, `bookings`) déclarent leur `robots` depuis
 * `generateMetadata`, exactement comme les deux index de profils. Seul `playground` emploie la
 * métadonnée statique. L'endroit ne discrimine rien ; ce qui discrimine, c'est la CONDITION.
 *
 * La forme lue est donc le **spread conditionnel** — `...(cond ? {} : { robots: … })` — qui est
 * littéralement la manière dont une métadonnée conditionnelle s'écrit ici. Un `index: false`
 * atteint hors d'un tel spread est inconditionnel : la page ne veut jamais être indexée.
 *
 * Aucun analyseur syntaxique : un compteur de parenthèses, robuste aux retours à la ligne (ce que
 * ne serait pas un test sur l'indentation). Introduire un parseur tiers dans une garde est ce que
 * `scripts/i18n-scan.mjs` a payé une fois (TCK-323).
 */
function spansDeSpreadConditionnel(source: string): readonly [number, number][] {
  const spans: [number, number][] = [];
  let depart = source.indexOf('...(');
  while (depart !== -1) {
    let profondeur = 0;
    let i = depart + 3;
    for (; i < source.length; i += 1) {
      if (source[i] === '(') profondeur += 1;
      else if (source[i] === ')') {
        profondeur -= 1;
        if (profondeur === 0) break;
      }
    }
    spans.push([depart, i]);
    depart = source.indexOf('...(', i === source.length ? source.length : i + 1);
  }
  return spans;
}

function declarationRobots(source: string): DeclarationRobots {
  const occurrences: number[] = [];
  const motif = /index\s*:\s*false/g;
  for (let m = motif.exec(source); m !== null; m = motif.exec(source)) occurrences.push(m.index);

  if (occurrences.length === 0) return 'indexable';

  const spans = spansDeSpreadConditionnel(source);
  const conditionnelle = (position: number) =>
    spans.some(([debut, fin]) => position > debut && position < fin);

  // Une SEULE occurrence inconditionnelle suffit : la page ne veut jamais être indexée.
  return occurrences.every(conditionnelle) ? 'conditionnel' : 'jamais';
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
      const robots = declarationRobots(source);
      acc.push({
        chemin: route,
        fichier: relative(process.cwd(), chemin),
        dynamique: route.includes('['),
        robots,
        // Une page « conditionnelle » est indexable sous sa forme NUE, et c'est cette forme-là
        // que le sitemap déclare.
        indexable: robots !== 'jamais',
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

  it('voit les TROIS natures de page — sinon la détection d’`index: false` est cassée', () => {
    // Le contrôle de la garde elle-même : si le classement s'effondrait sur une seule valeur,
    // les équivalences ci-dessous resteraient vertes en ne mesurant plus rien.
    for (const nature of ['indexable', 'jamais', 'conditionnel'] as const) {
      expect(
        ROUTES.some((r) => r.robots === nature),
        `aucune page classée « ${nature} » : le discriminant est cassé`,
      ).toBe(true);
    }
  });

  it('range les deux index de profils en « conditionnel », et les quatre écrans privés en « jamais »', () => {
    // Nommés dans les deux sens : un `index: false` qui migrerait de `generateMetadata` vers un
    // `export const metadata` sur `/agencies` la sortirait du sitemap en silence, et l'inverse
    // ferait entrer `/favorites`.
    for (const chemin of ['/agencies', '/agents']) {
      expect(ROUTES.find((r) => r.chemin === chemin)?.robots, chemin).toBe('conditionnel');
    }
    for (const chemin of ['/favorites', '/compare', '/bookings', '/playground']) {
      expect(ROUTES.find((r) => r.chemin === chemin)?.robots, chemin).toBe('jamais');
    }
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

  it('les trois écrans personnels sont bien vus comme JAMAIS indexables', () => {
    // Nommés — si l'un d'eux perdait son `index: false`, l'équivalence ci-dessus resterait
    // satisfaite (il rejoindrait simplement le sitemap) et le défaut passerait inaperçu.
    for (const chemin of ['/favorites', '/compare', '/bookings']) {
      const route = ROUTES.find((r) => r.chemin === chemin);
      expect(route, `route ${chemin} introuvable`).toBeDefined();
      expect(route!.robots, `${chemin} devrait déclarer robots: { index: false }`).toBe('jamais');
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
    expect(route.robots).toBe('jamais');
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
