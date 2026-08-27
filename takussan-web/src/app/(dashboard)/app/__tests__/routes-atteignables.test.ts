import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * TCK-379 — AC1 : aucune route de `/app` ne doit être injoignable.
 *
 * Ce test existe parce que deux écrans FINIS — `/app/account/privacy` (portabilité RGPD) et
 * `/app/crm/pipeline` (kanban de prospects, 201 lignes et deux fichiers de tests) — n'avaient
 * AUCUN lien entrant dans tout le front. Les deux étaient verts en CI et invisibles en
 * production : *un écran qu'on peut construire sans jamais avoir à l'atteindre reste vert.*
 *
 * ⚠ Ce que ce test mesure, et ce qu'il ne mesure PAS. Il vérifie qu'un producteur de lien cite
 * la route ; il ne monte aucun composant et ne prouve donc pas que ce lien est effectivement
 * RENDU pour un rôle donné. Les gardes de rôle sont l'objet des autres tests de ce lot
 * (`AppSidebar.test.tsx` pour la table des `href` par rôle). Le plancher est délibéré : c'est
 * l'absence totale de chemin qu'on veut rendre impossible, pas la justesse de chaque garde.
 */

const RACINE = path.resolve(__dirname, '../../../..'); // → src/
const APP = path.join(RACINE, 'app/(dashboard)/app');

/**
 * Exceptions NOMMÉES et JUSTIFIÉES. Toute nouvelle entrée doit porter sa raison — une liste
 * d'exceptions sans motif redevient, en trois tickets, la liste de tout ce qui est cassé.
 */
const EXCEPTIONS: ReadonlyMap<string, string> = new Map([
  [
    '/app/crm',
    "redirection permanente vers /app/customers : elle n'existe que pour les signets déjà pris (TCK-042), la citer dans un menu serait le défaut inverse",
  ],
  [
    '/app/payments/return',
    "URL de retour de la passerelle de paiement : c'est le prestataire externe qui y renvoie le navigateur, aucun écran du produit ne peut ni ne doit y mener",
  ],
]);

function listeFichiers(dir: string): string[] {
  const sortie: string[] = [];
  for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
    const complet = path.join(dir, entree.name);
    if (entree.isDirectory()) {
      if (entree.name === '__tests__' || entree.name === 'node_modules') continue;
      sortie.push(...listeFichiers(complet));
    } else if (/\.(ts|tsx)$/.test(entree.name) && !/\.(test|spec)\.tsx?$/.test(entree.name)) {
      sortie.push(complet);
    }
  }
  return sortie;
}

/** Routes statiques servies par un `page.tsx` sous `/app`. Les segments dynamiques sont exclus. */
function routesStatiques(): { route: string; dossier: string }[] {
  const sortie: { route: string; dossier: string }[] = [];
  const parcours = (dir: string) => {
    for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
      const complet = path.join(dir, entree.name);
      if (entree.isDirectory()) {
        if (entree.name === '__tests__') continue;
        parcours(complet);
      } else if (entree.name === 'page.tsx') {
        const relatif = path.relative(APP, dir).split(path.sep).filter(Boolean);
        if (relatif.some((s) => s.startsWith('['))) continue; // routes dynamiques
        sortie.push({ route: ['/app', ...relatif].join('/'), dossier: dir });
      }
    }
  };
  parcours(APP);
  return sortie;
}

const FICHIERS = listeFichiers(RACINE).map((f) => ({ chemin: f, contenu: fs.readFileSync(f, 'utf8') }));

/**
 * Une citation ne compte que si elle s'arrête à la bonne frontière : sans la sentinelle
 * ci-dessous, `/app/overview` serait « cité » par le moindre `href="/app/overview/agent"`, et le
 * test rendrait vert un menu qui n'expose que les sous-pages.
 */
function citations(route: string, dossierPropre: string): string[] {
  const motif = new RegExp(
    route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w/-])',
  );
  return FICHIERS
    // Le `page.tsx`/`layout.tsx` de la route elle-même ne la dessert pas : un écran qui se cite
    // lui-même reste injoignable. Ses SOUS-dossiers, eux, comptent (un détail qui renvoie vers
    // sa liste est un vrai chemin de retour).
    .filter(({ chemin }) => path.dirname(chemin) !== dossierPropre)
    // ⚠ Une mention en COMMENTAIRE ne dessert rien. Sans ce filtre, le commentaire que ce lot a
    // lui-même écrit au-dessus de chaque nouveau lien suffirait à rendre le test vert si le lien
    // était retiré ensuite — le correctif se prouverait par sa propre documentation. Mesuré à la
    // livraison : aucune route du dépôt n'est citée par un seul commentaire, le filtre ne masque
    // donc rien aujourd'hui ; il ferme la porte pour la suite.
    .filter(({ contenu }) =>
      contenu.split('\n').some((ligne) => motif.test(ligne) && !/^\s*(\*|\/\/|\/\*)/.test(ligne)),
    )
    .map(({ chemin }) => path.relative(RACINE, chemin));
}

describe('inventaire des écrans /app', () => {
  it('expose au moins un chemin entrant vers chaque route statique', () => {
    const orphelines = routesStatiques()
      .filter(({ route }) => !EXCEPTIONS.has(route))
      .filter(({ route, dossier }) => citations(route, dossier).length === 0)
      .map(({ route }) => route);

    expect(orphelines).toEqual([]);
  });

  it('ne garde aucune exception devenue inutile', () => {
    // Un garde-fou sur le garde-fou : si un chemin apparaît un jour vers une route exceptée,
    // l'exception doit disparaître plutôt que de couvrir silencieusement la suivante.
    const routes = new Map(routesStatiques().map((r) => [r.route, r.dossier]));
    for (const [route] of EXCEPTIONS) {
      expect(routes.has(route), `exception sur une route inexistante : ${route}`).toBe(true);
    }
  });

  it('couvre bien les deux écrans que ce ticket rebranche', () => {
    // Ablation lisible : si ces deux-là redevenaient orphelins, le premier test rougirait —
    // celui-ci nomme la raison pour laquelle il existe.
    for (const route of ['/app/account/privacy', '/app/crm/pipeline']) {
      const dossier = routesStatiques().find((r) => r.route === route)?.dossier;
      expect(dossier, `${route} a disparu`).toBeDefined();
      expect(citations(route, dossier as string).length).toBeGreaterThan(0);
    }
  });
});
