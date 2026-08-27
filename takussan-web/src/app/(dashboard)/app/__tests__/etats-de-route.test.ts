import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Les trois états de route de `/app`, gardés PAR L'ARBRE et non par des exemples (TCK-382).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI « SEGMENT PROPRE » ET NON « SEGMENT OU PARENT »
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC1 du ticket demandait « un `loading.tsx` dans son segment OU un segment parent ». Écrit
 * ainsi, le contrôle est **invérifiable** : `app/loading.tsx` est un ancêtre de TOUT `/app`, donc
 * dès qu'il existe, aucune page ne peut jamais manquer de repli et le test est vert quoi qu'on
 * ajoute. Il cocherait l'AC en ne mesurant rien — exactement la régression que la revue adverse
 * cherche.
 *
 * La règle tenue ici est donc plus étroite, et elle dit ce que la direction UX demandait
 * vraiment (*« le squelette a la forme de ce qui arrive »*) : un repli posé trois niveaux plus
 * haut ne peut pas avoir la forme de la page qu'il remplace.
 *
 *   Toute page qui `await` une donnée serveur a un `loading.tsx` dans SON segment,
 *   ou dans un segment ancêtre STRICTEMENT SOUS `app/`.
 *
 * ⚠ **Cette phrase décrit la RÈGLE DE CE TEST, pas Next.** Une première rédaction disait
 * « `app/loading.tsx` couvre `app/page.tsx` et rien d'autre », ce qui est faux du framework :
 * mesuré le 2026-08-27 sur Next 16.3.1, un repli ANCÊTRE efface le statut d'une page profonde
 * exactement comme un repli de segment (sonde `ancetre/enfant` → 200 au lieu de 404). C'est le
 * test qui refuse de compter un repli racine, parce qu'un squelette posé trois niveaux plus haut
 * n'a pas la forme de la page — pas Next qui l'ignorerait.
 *
 * TCK-426 a supprimé la question : `app/loading.tsx` a été DÉPLACÉ dans le groupe
 * `app/(accueil)/`. Il n'existe plus de repli à la racine de `/app`, donc plus d'ancêtre
 * universel. Une page ajoutée demain sous `app/<neuf>/` sans repli rougit ici.
 *
 * Vérifié par ablation le 2026-08-27 : `mv app/bookings/loading.tsx` → 1 page en échec ;
 * `mv app/overview/loading.tsx` → 7 pages en échec. ⚠ La seconde n'est plus reproductible telle
 * quelle : TCK-426 a supprimé `overview/loading.tsx` et l'a descendu dans les SEPT vues, pour
 * sortir l'aiguilleur `overview/page.tsx` de sa portée. Retirer l'un des sept replis rend
 * aujourd'hui 1 page en échec, pas 7.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CES REPLIS COÛTENT — mesuré, assumé, et écrit ici pour ne pas être redécouvert
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un `loading.tsx` ouvre une frontière de suspension : Next envoie la coque **et le code de
 * réponse** avant que la page n'ait rien décidé. Tout ce que la page ferait ensuite au niveau
 * HTTP est donc perdu. Deux effets, tous deux mesurés le 2026-08-27 sur Next 16.3.1 par sondes
 * jetables (`next dev`, pages nues, ablation du seul `loading.tsx`) :
 *
 *     notFound()  sans repli → 404      avec un repli (même segment OU ancêtre) → 200
 *     redirect()  sans repli → 307      avec un repli → 200 + la coque, redirection côté client
 *
 * Dans les DEUX cas l'écran final reste juste : la sonde `notFound` rend bien la page 404, et le
 * navigateur suit bien la redirection portée par le flux RSC. Seul le statut change — et `curl`,
 * lui, s'arrête sur le squelette.
 *
 * **C'est un échange, pas un oubli** — et il est plus large que le seul introuvable, ce qu'une
 * première rédaction de ce docblock passait sous silence. `app/loading.tsx` étant l'ancêtre de
 * tout `/app`, l'échange est TOTAL, jamais segmentaire : il couvre les **32 appels de
 * `redirect()`/`permanentRedirect()` répartis sur 15 pages** de `/app` (relevé sur la source
 * débarrassée de ses commentaires), dont la grande majorité sont des refus d'**autorisation** —
 * `owners`, `maintenance/providers`, `settings/agency/upgrade`, `overview/*`, `properties/[id]`,
 * `customers/[id]` — et non d'authentification. Trois pages y font même une redirection
 * d'authentification EN PAGE (`owners:36`, `maintenance/providers:34`,
 * `settings/agency/upgrade:34`).
 *
 * Ce qui change alors dépasse le statut : un utilisateur sans le droit reçoit 200 + `AppShell` +
 * **le squelette de la route interdite**, puis rebondit côté client. Là où il y avait un renvoi
 * serveur immédiat, il y a un bref aperçu de la page qu'il n'a pas le droit de voir. Aucun
 * contenu ne fuit — le squelette ne porte aucune donnée — mais l'écran ment une fraction de
 * seconde. `crm/page.tsx` perd de même son 308, celui dont le commentaire dit qu'il existe pour
 * que les liens en favori résolvent encore.
 *
 * L'échange reste assumé, pour trois raisons qui tiennent ensemble : `(dashboard)/layout.tsx`
 * pose `robots: { index: false }` sur tout `/app` (aucun indexeur ne lit ces statuts), l'espace
 * est derrière l'authentification (aucun client sans JS ne l'atteint), et la garde
 * d'authentification DU GROUPE est **au-dessus** de toute frontière posée ici — vérifié : `GET
 * /app` non authentifié rend 307 avec `app/loading.tsx` en place, parce que ce `redirect()` vit
 * dans le layout. Une visite en favori depuis un navigateur déconnecté fonctionne donc encore.
 *
 * ⚠ Aucune suite e2e n'existe dans ce dépôt (`npm run test` = vitest/jsdom) : rien ne garde ces
 * statuts, ni avant ni après. C'est l'objet de TCK-426, qui nomme l'autorisation.
 *
 * ⚠ Sur le catalogue PUBLIC, le même échange est inacceptable et le dépôt l'a déjà payé :
 * TCK-335 a SUPPRIMÉ `properties/[slug]/loading.tsx` pour rendre un vrai 404 à l'indexation, et
 * `(public)/properties/[slug]/__tests__/pas-de-frontiere-de-suspension.test.ts` le garde. Ne pas
 * recopier le patron de ce fichier-ci vers `(public)`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE PROUVE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il lit des fichiers, il ne rend rien. Il ne peut donc pas voir qu'un squelette est *permanent*
 * (c'est impossible par construction : Next démonte le repli dès que l'enfant résout) ni qu'il
 * ressemble à sa page. La ressemblance est portée par le typage — `RouteSkeleton` n'accepte que
 * cinq variantes — et par la relecture, pas par ce test.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Appels `await` qui ne sont PAS un aller-retour réseau : ils ne justifient aucun repli. */
const AWAITS_SANS_RESEAU = /^(params|searchParams|props|getTranslations|getLocale|getFormatter|cookies|headers)$/;

interface Page {
  /** Chemin absolu du `page.tsx`. */
  readonly fichier: string;
  /** Chemin relatif à `app/`, pour les messages d'échec. */
  readonly rel: string;
  /** Répertoire du segment. */
  readonly segment: string;
  readonly source: string;
  /** Corps de l'export par défaut, ou `null` quand il n'a pas pu être localisé. */
  readonly corps: string | null;
}

/**
 * Les trois formes d'export par défaut que ce fichier sait lire.
 *
 * ⚠ Une quatrième forme rendait cette garde AVEUGLE, et non bruyante : la version d'origine
 * faisait `corps = source.slice(search(...))`, or `search` rend `-1` quand il ne trouve rien, et
 * `slice(-1)` rend le dernier caractère — un corps non vide et sans aucun `await`. Une page
 * écrite `const Page = async () => {…}; export default Page;` passait donc pour « n'attend
 * aucune donnée » et n'avait besoin d'aucun repli. Mesuré : deux formes légales passaient au
 * vert sans `loading.tsx`. Le dépôt en utilise déjà une variante ailleurs
 * (`admin/properties/page.tsx` réexporte `export { default } from …`).
 *
 * Un corps illisible est désormais `null`, et le premier test de ce fichier échoue dessus. *Une
 * garde qui ne sait pas lire un fichier doit le DIRE, jamais le compter comme conforme.*
 */
const FORMES_EXPORT_DEFAUT: readonly RegExp[] = [
  /export default (async )?function/,          // export default async function Page() {}
  /export default (async )?\(/,                // export default async (props) => {}
  /export default [A-Za-z_$][\w$]*\s*;/,       // const Page = …; export default Page;
  /export \{[^}]*\bdefault\b[^}]*\}/,         // export { default } from '…'
];

function pagesDeApp(): Page[] {
  const sortie: Page[] = [];
  const parcours = (dir: string) => {
    for (const entree of readdirSync(dir, { withFileTypes: true })) {
      const chemin = join(dir, entree.name);
      if (entree.isDirectory()) {
        if (entree.name === '__tests__') continue;
        parcours(chemin);
      } else if (entree.name === 'page.tsx') {
        const source = readFileSync(chemin, 'utf8');
        // Une déclaration `export default function` ouvre le corps à sa position ; les trois
        // autres formes désignent un symbole défini plus haut, et le corps utile est alors le
        // fichier entier moins ses imports.
        const declaration = source.search(FORMES_EXPORT_DEFAUT[0]);
        const reconnue = FORMES_EXPORT_DEFAUT.some((forme) => forme.test(source));
        sortie.push({
          fichier: chemin,
          rel: relative(APP, chemin),
          segment: dir,
          source,
          corps: declaration >= 0
            ? source.slice(declaration)
            : reconnue
              ? source.split('\n').filter((l) => !/^import\s/.test(l)).join('\n')
              : null,
        });
      }
    }
  };
  parcours(APP);
  return sortie.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Le code seul : ni `//`, ni `/* … *\/`. Une garde ne doit jamais lire ses propres motifs. */
function sansCommentaires(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

/** Une page qui ne rend jamais de JSX ne produit aucun document : ni onglet, ni attente. */
function estUneRedirectionSeule(page: Page): boolean {
  if (page.corps === null) return false;
  const redirige = /\b(permanentRedirect|redirect)\(/.test(page.corps);
  const rendDuJsx = /return\s*\(|return\s*</.test(page.corps);
  return redirige && !rendDuJsx;
}

function attendUneDonneeServeur(page: Page): boolean {
  if (page.corps === null) return false; // signalé par le test « toute page est analysable »
  if (/^\s*['"]use client['"]/m.test(page.source.split('\n').slice(0, 3).join('\n'))) return false;
  const appels = [...page.corps.matchAll(/await\s+([A-Za-z0-9_.$]+)\s*\(/g)].map((m) => m[1]);
  return appels.some((nom) => !AWAITS_SANS_RESEAU.test(nom));
}

const PAGES = pagesDeApp();

describe('TCK-382 — inventaire', () => {
  it('trouve les pages de /app (non-vacuité de tout ce fichier)', () => {
    // Si ce relevé tombait à zéro — un glob cassé, un renommage de répertoire — chacune des
    // assertions ci-dessous passerait au vert en ayant mesuré l'ensemble vide.
    expect(PAGES.length).toBeGreaterThanOrEqual(40);
  });

  it('toute page est analysable — sinon la garde se tait au lieu de rougir', () => {
    const illisibles = PAGES.filter((p) => p.corps === null).map((p) => p.rel);
    expect(
      illisibles,
      `export par défaut non localisé : ${illisibles.join(', ')} — ajouter la forme à ` +
        'FORMES_EXPORT_DEFAUT, sans quoi ces pages échappent à TOUTES les règles de ce fichier',
    ).toEqual([]);
  });

  it('deux pages seulement ne rendent aucun document, et ce sont des redirections nues', () => {
    // Ratchet : l'exemption des règles « titre » ci-dessous est DÉRIVÉE (aucun JSX rendu), pas
    // écrite. Ce test fige sa taille pour qu'une page muette de plus soit un acte conscient.
    const muettes = PAGES.filter(estUneRedirectionSeule).map((p) => p.rel);
    expect(muettes.sort()).toEqual(['crm/page.tsx', 'overview/page.tsx']);
  });
});

/**
 * TCK-426 — LE STATUT HTTP, et la seule règle du sujet qui n'admette AUCUNE exception.
 *
 * Le mécanisme, mesuré le 2026-08-27 sur Next 16.3.1 par sondes jetables sous `next dev`
 * (port 3999, huit formes, `curl -w '%{http_code}'`) :
 *
 *   | ce qui décide          | repli en scope        | statut |
 *   |------------------------|-----------------------|--------|
 *   | page `notFound()`      | aucun                 | 404    |
 *   | page `notFound()`      | même segment          | 200    |
 *   | page `notFound()`      | segment ANCÊTRE       | 200    |
 *   | page `redirect()`      | aucun                 | 307    |
 *   | page `redirect()`      | même segment          | 200    |
 *   | page `redirect()` SYNCHRONE (non `async`) | même segment | 200 |
 *   | page `permanentRedirect()` | aucun / avec repli | 308 / 200 |
 *   | **layout** `redirect()` | repli DU MÊME SEGMENT | **307**, et le repli couvre la page |
 *   | **layout** `redirect()` | repli ANCÊTRE         | 200    |
 *
 * D'où la règle : *un statut survit si et seulement si il est décidé STRICTEMENT AU-DESSUS de
 * toute frontière de suspension de son chemin.* Un `layout.tsx` est au-dessus du `loading.tsx`
 * de SON segment, et en dessous de celui de tous ses ancêtres.
 *
 * Ce test ne garde qu'un cas, mais il le garde sans exception : **une page qui ne rend aucun
 * document ne doit vivre sous aucune frontière.** L'échange « statut contre squelette » est
 * défendable quand il y a un squelette à montrer ; ici il n'y en a pas — la page ne rend rien,
 * jamais. Elle payait son statut pour rien.
 *
 * Ce que ce test NE garde PAS, et qui reste dû : les 24 `redirect()` et 9 `notFound()` des pages
 * qui, elles, rendent un document. Le remède est mesuré (ligne « layout » du tableau) mais il
 * demande de remonter la décision dans un `layout.tsx` par segment. Chiffré et priorisé dans
 * TCK-426 — *ce fichier dit ce qu'il garde, pas ce qu'on aimerait qu'il garde.*
 */
/**
 * L'indice `i` tombe-t-il DANS un bloc `catch (…) { … }` ?
 *
 * On compte les accolades : à chaque `catch (…) {` rencontré on empile la profondeur d'ouverture,
 * et on dépile quand on repasse en dessous. Rustique, et suffisant sur du code TS formaté — mais
 * la limite est réelle et vaut d'être dite : une accolade dans une chaîne ou une expression
 * régulière fausserait le compte. Le test « délimite bien ce qui reste dû » est là pour ça : il
 * rougit si cette fonction se met à rendre `true` trop souvent.
 */
function estDansUnCatch(source: string, i: number): boolean {
  const debuts: number[] = [];
  let profondeur = 0;
  let attendAccolade = false;
  for (let k = 0; k < i; k += 1) {
    if (source.startsWith('catch', k) && /catch\s*(\([^)]*\))?\s*\{/.test(source.slice(k, k + 60))) {
      attendAccolade = true;
    }
    if (source[k] === '{') {
      profondeur += 1;
      if (attendAccolade) { debuts.push(profondeur); attendAccolade = false; }
    } else if (source[k] === '}') {
      while (debuts.length && debuts[debuts.length - 1] > profondeur - 1) debuts.pop();
      profondeur -= 1;
    }
  }
  return debuts.length > 0;
}

describe('TCK-426 — aucune page muette sous une frontière de suspension', () => {
  it('aucune redirection nue de /app ne vit sous un loading.tsx', () => {
    const sous: string[] = [];
    for (const page of PAGES.filter(estUneRedirectionSeule)) {
      let dossier = page.segment;
      for (;;) {
        if (existsSync(join(dossier, 'loading.tsx'))) {
          const ou = relative(APP, dossier);
          sous.push(`${page.rel} ← ${ou ? `${ou}/loading.tsx` : 'app/loading.tsx (RACINE)'}`);
          break;
        }
        if (dossier === APP) break;
        dossier = dirname(dossier);
      }
    }
    expect(
      sous,
      'ces pages ne rendent rien et perdent pourtant leur statut HTTP : ' + sous.join(', '),
    ).toEqual([]);
  });

  it('aucune page ne refuse un UTILISATEUR depuis sous une frontière', () => {
    // LA RÈGLE, et elle est à zéro exception. Un refus fondé sur l'utilisateur — son rôle, son
    // jeton, son agence — se décide AVANT toute donnée, donc il peut toujours vivre dans un
    // `layout.tsx`, au-dessus du repli. TCK-426 y a remonté 23 refus répartis sur 14 segments.
    //
    // La frontière avec ce qui RESTE est dérivée, pas listée : un refus écrit dans un bloc
    // `catch` réagit à la RÉPONSE de l'API (« ce dossier-ci n'est pas le vôtre »), pas à
    // l'utilisateur. Le remonter demande de remonter la REQUÊTE, ce qui change la forme des
    // pages de détail — c'est le périmètre de TCK-442, et c'est pour ça que ce test l'exclut au
    // lieu de le tolérer. *Une exception dérivée d'une propriété du code se referme toute seule
    // le jour où le code change ; une exception écrite dans une liste, jamais.*
    const REFUS = /\b(permanentRedirect|redirect)\s*\(|\bassertCanReach\w*\s*\(/g;
    const fautifs: string[] = [];

    for (const page of PAGES) {
      let dossier = page.segment;
      let couverte = false;
      for (;;) {
        if (existsSync(join(dossier, 'loading.tsx'))) { couverte = true; break; }
        if (dossier === APP) break;
        dossier = dirname(dossier);
      }
      if (!couverte) continue;

      const source = sansCommentaires(page.source)
        .split('\n')
        .filter((l) => !/^\s*import\b/.test(l))
        .join('\n');

      for (const trouve of source.matchAll(REFUS)) {
        if (!estDansUnCatch(source, trouve.index ?? 0)) {
          const ligne = source.slice(0, trouve.index).split('\n').length;
          fautifs.push(`${page.rel}:${ligne} → ${trouve[0]}`);
        }
      }
    }

    expect(
      fautifs,
      'ces refus rendent 200 + le squelette de la route interdite au lieu de leur statut ; ' +
        `remonte-les dans le layout.tsx de leur segment : ${fautifs.join(', ')}`,
    ).toEqual([]);
  });

  it('délimite bien ce qui reste dû à TCK-442 (non-vacuité de la règle ci-dessus)', () => {
    // Le pendant obligatoire : si `estDansUnCatch` se mettait à rendre `true` partout — une
    // accolade mal comptée suffit — la règle ci-dessus passerait au vert en n'examinant rien.
    // On fige donc ce que l'exclusion couvre RÉELLEMENT. Une entrée de plus est un acte
    // conscient, une entrée de moins est un progrès à retirer d'ici.
    const dansCatch: string[] = [];
    for (const page of PAGES) {
      const source = sansCommentaires(page.source);
      for (const trouve of source.matchAll(/\b(permanentRedirect|redirect)\s*\(/g)) {
        if (estDansUnCatch(source, trouve.index ?? 0)) dansCatch.push(page.rel);
      }
    }
    expect([...new Set(dansCatch)].sort()).toEqual(['properties/[id]/page.tsx']);
  });

  it("aucun layout qui refuse ne vit SOUS le repli d'un ancêtre", () => {
    // LA RÈGLE QUE LA RELECTURE N'AURAIT PAS TROUVÉE, et qui a coûté deux routes.
    //
    // Remonter une garde dans le `layout.tsx` de son segment ne suffit pas : il faut encore
    // qu'aucun `loading.tsx` ne soit posé PLUS HAUT. Un repli d'ancêtre efface le statut d'un
    // layout descendant aussi sûrement que celui d'une page — mesuré par sonde
    // (layout qui redirige sous un repli d'ancêtre → 200), puis constaté sur l'application
    // réelle : `maintenance/loading.tsx` couvrait `maintenance/providers/layout.tsx`, et un
    // prestataire recevait 200 là où les seize autres surfaces agence lui rendaient 307.
    // `leases/loading.tsx` faisait de même au-dessus de `leases/onboarding-pending`.
    //
    // Les deux replis sont descendus dans un groupe `(liste)` avec la page de liste qu'ils
    // servaient. *Quatorze layouts justes, deux au mauvais étage : c'est la mesure de bout en
    // bout qui l'a dit, pas la relecture — d'où cette règle, pour que la prochaine fois ce soit
    // la CI.*
    const REFUS = /\b(permanentRedirect|redirect)\s*\(|\bassertCanReach\w*\s*\(/;
    const fautifs: string[] = [];

    const parcours = (dir: string) => {
      for (const entree of readdirSync(dir, { withFileTypes: true })) {
        const chemin = join(dir, entree.name);
        if (entree.isDirectory()) {
          if (entree.name !== '__tests__') parcours(chemin);
          continue;
        }
        if (entree.name !== 'layout.tsx') continue;
        if (!REFUS.test(sansCommentaires(readFileSync(chemin, 'utf8')))) continue;

        // Un repli STRICTEMENT au-dessus du segment de ce layout.
        let ancetre = dirname(dir);
        for (;;) {
          if (existsSync(join(ancetre, 'loading.tsx'))) {
            const ou = relative(APP, ancetre);
            fautifs.push(`${relative(APP, chemin)} ← ${ou ? `${ou}/loading.tsx` : 'app/loading.tsx (RACINE)'}`);
            break;
          }
          if (ancetre === APP || !ancetre.startsWith(APP)) break;
          ancetre = dirname(ancetre);
        }
      }
    };
    parcours(APP);

    expect(
      fautifs,
      "ces layouts refusent depuis SOUS un repli d'ancêtre : leur redirection rend 200. " +
        `Descends le repli de l'ancêtre dans un groupe de routes : ${fautifs.join(', ')}`,
    ).toEqual([]);
  });

  it("il n'existe plus de repli à la RACINE de /app", () => {
    // Le cas le plus coûteux et le plus invisible : posé là, un repli est l'ancêtre de TOUT
    // `/app` et efface le statut de chaque page du sous-arbre qui n'en a pas de plus proche.
    // Il vit désormais dans le groupe `(accueil)`, qui ne consomme aucun segment d'URL.
    expect(existsSync(join(APP, 'loading.tsx'))).toBe(false);
    expect(existsSync(join(APP, '(accueil)', 'loading.tsx'))).toBe(true);
    expect(existsSync(join(APP, '(accueil)', 'page.tsx'))).toBe(true);
  });
});

describe('TCK-382 / AC1 — l’attente', () => {
  it('chaque page qui attend une donnée serveur a son propre repli', () => {
    const manquantes: string[] = [];
    for (const page of PAGES) {
      if (!attendUneDonneeServeur(page)) continue;
      // TCK-426 — une page qui ne rend AUCUN document n'a rien à montrer pendant qu'elle
      // attend : un repli au-dessus d'elle ne lui apporte rien et lui coûte son statut HTTP.
      // L'exemption est DÉRIVÉE (`estUneRedirectionSeule`), pas listée, et la règle qui suit
      // ce bloc l'oblige dans l'autre sens : ces pages ne doivent PAS être couvertes.
      if (estUneRedirectionSeule(page)) continue;
      let dossier = page.segment;
      let couverte = false;
      // `app/loading.tsx` ne couvre que `app/page.tsx` : la boucle s'arrête AVANT de remonter
      // au-dessus du segment de la page quand ce segment est déjà `app/`.
      for (;;) {
        if (existsSync(join(dossier, 'loading.tsx'))) { couverte = true; break; }
        if (dossier === APP) break;
        dossier = dirname(dossier);
        if (dossier === APP) break; // un repli à la racine ne compte pas pour une page profonde
      }
      if (!couverte) manquantes.push(page.rel);
    }
    expect(manquantes, `pages sans loading.tsx dans leur segment : ${manquantes.join(', ')}`).toEqual([]);
  });

  it('un loading.tsx ne fait ni requête ni lecture de session', () => {
    // Contrainte métier du ticket. Un repli qui `await` se suspend lui-même : Next n'affiche
    // alors RIEN pendant qu'il attend — le contraire exact de sa raison d'être.
    const fautifs: string[] = [];
    const parcours = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') parcours(p); continue; }
        if (e.name !== 'loading.tsx') continue;
        const s = readFileSync(p, 'utf8');
        if (/\bawait\b|getToken|getMeAction|apiRequest|apiFetch|cookies\(/.test(s)) {
          fautifs.push(relative(APP, p));
        }
      }
    };
    parcours(APP);
    expect(fautifs).toEqual([]);
  });
});

describe('TCK-382 — l’introuvable est branché sur toutes les pages de détail', () => {
  const DETAILS = PAGES.filter((p) => /\[[^\]]+\]\/page\.tsx$/.test(p.rel));

  it('relève les pages de détail (non-vacuité)', () => {
    expect(DETAILS.length).toBeGreaterThanOrEqual(6);
  });

  it('chacune appelle notFound() sur un identifiant illisible', () => {
    // Trois d'entre elles ont un test de comportement dédié (`customers`, `leases`,
    // `properties`). Pour les cinq autres, l'appel n'est tenu que par ce cliquet : sans lui,
    // retirer leur `notFound()` serait SILENCIEUX.
    //
    // ⚠ Ce que ce cliquet NE dit PAS : que la page traduit un 404 de l'API en introuvable.
    // Seules `properties/[id]` et `customers/[id]` le font — les cinq autres délèguent la
    // requête à un composant client, où `notFound()` n'existe pas. `/app/bookings/999999`
    // (identifiant bien formé, réservation inexistante) ne rend donc PAS l'introuvable.
    // C'est une limite connue, pas un oubli : elle demande de remonter la requête côté
    // serveur, ce que le ticket met hors périmètre (« le contenu des pages »).
    // ⚠ Sur la source DÉBARRASSÉE de ses commentaires. Première version : le cliquet lisait
    // `page.source` brut, et les docblocks de ces pages *expliquent* le passage à `notFound()`.
    // Ablation mesurée : retirer l'appel de `bookings/[id]` laissait le test VERT, parce que le
    // commentaire qui le justifiait le contenait encore. *Une garde qui lit ses propres
    // explications se prouve elle-même.*
    const sans = DETAILS.filter((p) => !/\bnotFound\(\)/.test(sansCommentaires(p.source)))
      .map((p) => p.rel);
    expect(sans, `pages de détail sans notFound() : ${sans.join(', ')}`).toEqual([]);
  });
});

describe('TCK-382 / AC4 & AC6 — le titre d’onglet', () => {
  it('aucune page rendant un document n’est dépourvue de generateMetadata', () => {
    const sans: string[] = [];
    for (const page of PAGES) {
      if (estUneRedirectionSeule(page)) continue;
      if (/generateMetadata/.test(page.source)) continue;
      sans.push(page.rel);
    }
    // ⚠ AUCUN repli vers un `layout.tsx` de segment ici, et c'est délibéré. Une version
    // antérieure de ce test en offrait un, en citant un `payments/return/layout.tsx` qui
    // n'existe pas : la scission page serveur / composant client lui a été PRÉFÉRÉE, parce
    // qu'un `layout.tsx` ouvre une frontière de dictionnaire de 38 espaces de noms
    // (`scripts/check-i18n-namespaces.mjs`). Une branche morte adossée à une justification
    // fausse est pire qu'une règle stricte : elle décrit un mécanisme que personne ne peut
    // relire.
    expect(sans, `pages sans titre d'onglet : ${sans.join(', ')}`).toEqual([]);
  });

  it('generateMetadata est déclarée APRÈS le dernier import', () => {
    const malPlacees: string[] = [];
    for (const page of PAGES) {
      const lignes = page.source.split('\n');
      const dernierImport = lignes.reduce((acc, l, i) => (/^import\s/.test(l) ? i : acc), -1);
      const declaration = lignes.findIndex((l) =>
        /export\s+(async\s+)?(function|const)\s+generateMetadata/.test(l));
      if (declaration >= 0 && declaration < dernierImport) {
        malPlacees.push(`${page.rel} (l. ${declaration + 1} < import l. ${dernierImport + 1})`);
      }
    }
    expect(malPlacees).toEqual([]);
  });

  it('aucun titre d’onglet n’est écrit en dur', () => {
    // `visits/[id]` rendait `export const metadata = { title: 'Visite' }` et `customers`
    // `{ title: 'Clients (CRM)' }` — deux libellés français dans le code, qu'aucune garde n'a
    // vus : le contrôle B de check-i18n.mjs ne lit ni les propriétés d'objet ni les gabarits
    // interpolés, et il le dit lui-même dans sa sortie.
    //
    // ⚠ Cette règle porte sur la VALEUR de `title`, pas sur une seule de ses écritures. Une
    // première version ne cherchait que `title:` suivi d'un guillemet ; deux échappées
    // mesurées la traversaient — `title: UNE_CONSTANTE` définie plus haut, et surtout
    // `title: t('x') + ' — suffixe français'`, la forme réaliste. La règle est donc : ce que
    // `title:` reçoit doit être un appel de traduction, ou un identifiant qui n'est lié à
    // aucun littéral du fichier — et aucune concaténation avec un littéral.
    const fautifs: string[] = [];
    for (const page of PAGES) {
      const lignes = page.source.split('\n');
      // Les identifiants du fichier liés à un littéral de chaîne : `const X = 'texte'`.
      const constantesLitterales = new Set(
        [...page.source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]/g)]
          .map((m) => m[1]),
      );
      for (const [i, ligne] of lignes.entries()) {
        if (/^\s*\*/.test(ligne) || /^\s*\/\//.test(ligne)) continue; // commentaires
        const brut = ligne.match(/\btitle:\s*(.+?)$/)?.[1];
        if (brut === undefined) continue;
        // La valeur, débarrassée de la ponctuation de fin de ligne : `X };`, `X,`, `X)` …
        const valeur = brut.replace(/[\s,;)}\]]+$/, '');
        const litteralDirect = /^['"`]/.test(valeur);
        const concatenation = /[+`].*['"`]/.test(valeur) && /['"`][^'"`]*[A-Za-zÀ-ÿ]/.test(valeur);
        const constante = constantesLitterales.has(valeur);
        if (litteralDirect || concatenation || constante) fautifs.push(`${page.rel}:${i + 1}`);
      }
    }
    expect(fautifs, `titres codés en dur : ${fautifs.join(', ')}`).toEqual([]);
  });
});
