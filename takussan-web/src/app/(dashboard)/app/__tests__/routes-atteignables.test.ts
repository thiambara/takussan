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
        // TCK-426 — un GROUPE de routes `(nom)` ne consomme aucun segment d'URL. Sans cette
        // ligne, `app/(accueil)/page.tsx` était relevée comme la route `/app/(accueil)`, que
        // rien ne peut citer : le test rougissait sur une route qui n'existe pas.
        const segments = relatif.filter((s) => !/^\(.*\)$/.test(s));
        sortie.push({ route: ['/app', ...segments].join('/'), dossier: dir });
      }
    }
  };
  parcours(APP);
  return sortie;
}

/**
 * Blanchit les commentaires, ligne par ligne, EN SUIVANT L'ÉTAT OUVERT/FERMÉ des blocs `/* … *\/`.
 *
 * ⚠ La version précédente de ce fichier écartait les commentaires par un test de PRÉFIXE de ligne
 * (`/^\s*(\*|\/\/|\/\*)/`). Elle ne reconnaissait donc qu'une ligne qui OUVRE un commentaire, ou
 * qui continue un docblock JSDoc — jamais le corps d'un commentaire de bloc JSX `{/* … *\/}`, dont
 * les lignes de continuation commencent par du texte nu. **Et ce sont exactement ces commentaires
 * que TCK-379 a posés au-dessus de ses deux nouveaux liens.** Mesuré : le `<Link>` retiré et le
 * commentaire laissé, les trois tests de ce fichier restaient VERTS sur les deux routes pour
 * lesquelles ils ont été écrits. *Le correctif se prouvait par sa propre documentation.*
 *
 * On blanchit au lieu de supprimer la ligne : les numéros de ligne restent alignés sur le fichier
 * source, ce qui garde les diagnostics lisibles.
 */
function sansCommentaires(contenu: string): string[] {
  const sortie: string[] = [];
  let dansBloc = false;
  for (const ligne of contenu.split('\n')) {
    let reste = '';
    let i = 0;
    while (i < ligne.length) {
      if (dansBloc) {
        const fin = ligne.indexOf('*/', i);
        if (fin === -1) i = ligne.length;
        else {
          dansBloc = false;
          i = fin + 2;
        }
      } else {
        const bloc = ligne.indexOf('/*', i);
        const jusquauBout = ligne.indexOf('//', i);
        if (jusquauBout !== -1 && (bloc === -1 || jusquauBout < bloc)) {
          reste += ligne.slice(i, jusquauBout);
          i = ligne.length;
        } else if (bloc !== -1) {
          reste += ligne.slice(i, bloc);
          dansBloc = true;
          i = bloc + 2;
        } else {
          reste += ligne.slice(i);
          i = ligne.length;
        }
      }
    }
    sortie.push(reste);
  }
  return sortie;
}

/**
 * Ce qui, dans du code, PRODUIT un chemin cliquable ou une navigation. Une ligne qui mentionne une
 * route sans porter l'un de ces marqueurs n'ouvre rien : c'est une chaîne dans un log, un cas de
 * test recopié, un libellé.
 *
 * ⚠ La liste est délibérément COURTE et fermée. Elle a été prise par mesure sur les 38 routes
 * statiques de `/app` : chacune — sauf les deux exceptées ci-dessus — est desservie par au moins
 * une ligne qui la porte. Une forme neuve de navigation devra donc s'ajouter ici explicitement,
 * et c'est le but : *une liste ouverte redeviendrait « toute mention compte ».*
 *
 * - `href` (insensible à la casse) couvre `href="…"`, `href: '…'` et les constantes `…_HREF`.
 * - `router.push` / `router.replace` couvrent la navigation impérative client.
 * - `redirect(` / `permanentRedirect(` couvrent la navigation serveur de Next.
 */
const PRODUCTEUR_DE_LIEN = /href|router\s*\.\s*(push|replace)|\b(permanent)?[Rr]edirect\s*\(/i;

const FICHIERS = listeFichiers(RACINE).map((f) => ({
  chemin: f,
  lignes: sansCommentaires(fs.readFileSync(f, 'utf8')),
}));

/**
 * Une citation ne compte que si elle s'arrête à la bonne frontière : sans la sentinelle
 * ci-dessous, `/app/overview` serait « cité » par le moindre `href="/app/overview/agent"`, et le
 * test rendrait vert un menu qui n'expose que les sous-pages.
 *
 * Et elle ne compte que si elle est un LIEN, pas une MENTION : la route et un producteur de lien
 * doivent tenir sur la MÊME ligne de code, commentaires blanchis. *Un test qui compte les mentions
 * textuelles d'une route accepte une phrase de docblock aussi bien qu'un `<Link>` cliquable.*
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
    .filter(({ lignes }) =>
      lignes.some((ligne) => motif.test(ligne) && PRODUCTEUR_DE_LIEN.test(ligne)),
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

/**
 * TCK-419 — LE SENS INVERSE : tout chemin `/app/…` écrit dans le front doit avoir une route.
 *
 * TCK-379 avait délibérément laissé cette garde de côté : elle serait née rouge. La re-mesure du
 * 2026-08-27 (script jetable confrontant les littéraux de `src/` à l'inventaire des `page.tsx`,
 * segments dynamiques appariés) en a rendu **cinq** — un de plus que les quatre du ticket :
 *
 *   /app/payments/new              components/tenant/TenantOnboardingChecklistWidget.tsx:140
 *   /app/profile/customer/onboarding · /app/profile/owner/kyc · /app/profile/agent/kyc
 *                                  lib/wizard-drafts.ts:96,102,108
 *   /app/maintenance/requests/{id} components/onboarding/ServiceProviderOnboardingWizard.tsx:161
 *
 * Le cinquième est le dernier geste du parcours « un prestataire s'inscrit depuis une demande ».
 * Il n'était dans aucun ticket : il est sorti de la mesure, pas de la lecture.
 *
 * ⚠ Zéro exception, et c'est la condition pour que la garde tienne : *une garde livrée avec sa
 * liste d'exceptions ne garde plus que la liste.* Les commentaires sont blanchis par
 * `sansCommentaires` — sans quoi le `/app/...` du docblock de `admin/finances/page.tsx` la ferait
 * rougir sur du texte.
 *
 * ⚠⚠ **« ZÉRO EXCEPTION » EST VRAI DE LA LISTE, PAS DE LA PORTÉE.** La distinction a été relevée
 * en revue, et elle compte : une garde qu'on croit exhaustive n'est plus relue. Trois choses
 * échappent à ce test, par construction, et aucune ne cache de lien mort AUJOURD'HUI — vérifié le
 * 2026-08-27, chacune par sa propre commande :
 *
 *  1. **Les chemins CONSTRUITS.** Le motif ne reconnaît qu'un littéral commençant par `/app` ;
 *     `` `${BASE}/leases` `` lui est invisible. Mesuré — `grep -rn "const.*= '/app'" src/` : le
 *     dépôt n'a aucune constante de base de ce genre, tous les chemins sont écrits en entier.
 *     C'est vrai jusqu'à la première qu'on écrira.
 *  2. **Les fichiers de TEST**, écartés par `listeFichiers` avec les `__tests__`. 27 fichiers de
 *     test citent un `/app/…`. Délibéré : un test qui nomme une route morte pour en éprouver le
 *     traitement est légitime, et le compter ferait rougir la garde sur des cas de test justes.
 *  3. **Tout ce qui n'est ni `.ts` ni `.tsx`.** Mesuré —
 *     `grep -rln "/app/" --include='*.json' src/` : aucun résultat. Aucun `.json` du dépôt ne
 *     porte de route ; si l'on en ajoutait un (table de navigation sérialisée, jeu de données de
 *     démonstration), il faudrait élargir `listeFichiers`.
 *
 * *Nommer ce qu'une garde ne voit pas est ce qui empêche de croire qu'elle voit tout.*
 */

/** Toutes les routes de `/app`, segments dynamiques compris, rendues comme motifs. */
function motifsDeRoutes(): RegExp[] {
  const chemins: string[] = [];
  const parcours = (dir: string, prefixe: string) => {
    for (const entree of fs.readdirSync(dir, { withFileTypes: true })) {
      const complet = path.join(dir, entree.name);
      if (entree.isDirectory()) {
        if (entree.name === '__tests__') continue;
        // Un groupe de routes `(nom)` ne consomme aucun segment d'URL.
        parcours(complet, /^\(.*\)$/.test(entree.name) ? prefixe : `${prefixe}/${entree.name}`);
      } else if (entree.name === 'page.tsx') {
        chemins.push(prefixe);
      }
    }
  };
  parcours(APP, '/app');
  return [...new Set(chemins)].map(
    (route) =>
      new RegExp(
        '^' +
          route
            .split('/')
            .map((seg) =>
              seg.startsWith('[') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            )
            .join('/') +
          '$',
      ),
  );
}

/**
 * Les littéraux de chemin `/app/…` d'un fichier, hors commentaires. On s'arrête aux caractères
 * qui ne peuvent pas appartenir à un segment de route : une chaîne de requête (`?…`), une ancre
 * (`#…`) ou une concaténation ferment le chemin.
 */
const LITTERAL = /['"`](\/app(?:\/[A-Za-z0-9_$\-.[\]{}]+)*)/g;

describe('chemins /app écrits dans le front', () => {
  it('ne cite aucune route inexistante', () => {
    const motifs = motifsDeRoutes();
    const morts: string[] = [];

    for (const { chemin, lignes } of FICHIERS) {
      lignes.forEach((ligne, index) => {
        for (const trouve of ligne.matchAll(LITTERAL)) {
          // `${expr}` occupe exactement un segment dynamique ; un `/` final ne compte pas.
          const candidat = trouve[1].replace(/\$\{[^}]*\}/g, 'X').replace(/\/$/, '');
          if (!motifs.some((motif) => motif.test(candidat))) {
            morts.push(`${path.relative(RACINE, chemin)}:${index + 1} → ${trouve[1]}`);
          }
        }
      });
    }

    expect(morts).toEqual([]);
  });
});
