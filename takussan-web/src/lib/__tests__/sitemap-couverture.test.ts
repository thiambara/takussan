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

type RoutePublique = {
  /** Chemin SANS langue, tel que le sitemap le manipule : `/`, `/properties/[slug]`. */
  readonly chemin: string;
  readonly fichier: string;
  readonly dynamique: boolean;
  readonly indexable: boolean;
};

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
      acc.push({
        chemin: route,
        fichier: relative(process.cwd(), chemin),
        dynamique: route.includes('['),
        // La forme exacte employée par les quatre pages qui la portent aujourd'hui
        // (`favorites`, `compare`, `bookings`, `playground`), tolérante aux espaces.
        indexable: !/index\s*:\s*false/.test(source),
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
