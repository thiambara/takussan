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
 * ainsi, le contrôle était **invérifiable** : `app/loading.tsx` existait alors à la racine, donc
 * ancêtre de TOUT `/app` ; aucune page ne pouvait jamais manquer de repli, et le test serait
 * resté vert quoi qu'on ajoute. Il aurait coché l'AC en ne mesurant rien — exactement la
 * régression que la revue adverse cherche. (TCK-426 a depuis déplacé ce repli dans le groupe
 * `app/(accueil)/` ; la règle étroite ci-dessous reste néanmoins la bonne, pour sa raison
 * propre — la FORME du squelette, pas la portée du fichier.)
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
 * CE QUE CES REPLIS COÛTAIENT, ET CE QUE TCK-426 A RENDU
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ⚠ **Tout ce paragraphe est au passé, et ce n'est pas un effet de style.** Il a été écrit au
 * PRÉSENT par TCK-382, puis laissé tel quel par le commit de TCK-426 qui abolissait ce qu'il
 * décrivait — six affirmations que les règles de CE fichier, deux cents lignes plus bas,
 * réfutaient. *Un docblock qui décrit l'ancien monde au présent est plus nuisible qu'un docblock
 * absent : on ne s'en méfie pas.*
 *
 * LE MÉCANISME (inchangé, et c'est la seule chose ici qui soit encore au présent). Un
 * `loading.tsx` ouvre une frontière de suspension : Next envoie la coque **et le code de
 * réponse** avant que la page n'ait rien décidé. Mesuré sur Next 16.3.1 par sondes jetables
 * (`next dev`, pages nues, ablation du seul repli) :
 *
 *     notFound()  sans repli → 404   | repli même segment → 200 | repli ANCÊTRE → 200
 *     redirect()  sans repli → 307   | repli même segment → 200 | page SYNCHRONE → 200
 *     permanentRedirect() sans repli → 308                      | avec repli    → 200
 *     LAYOUT redirect() + repli DU MÊME SEGMENT ou plus bas     → **307**, repli conservé
 *     LAYOUT redirect() + repli d'un ANCÊTRE                    → 200
 *     generateMetadata() notFound() SEUL, sans repli → 200      | avec repli → 200
 *     corps notFound() SEUL, sans repli → 404                   | avec repli → 200
 *
 * D'où la règle — **nécessaire, PAS suffisante**, et la première rédaction écrivait « si et
 * seulement si », ce que la ligne `generateMetadata` casse à elle seule (dans cette sonde-là il
 * n'existe AUCUNE frontière sur le chemin : la condition est trivialement remplie, et le statut
 * ne survit pas) :
 *
 *   *Un statut ne survit QUE SI il est décidé strictement au-dessus de toute frontière de
 *   suspension de son chemin — et QUE SI il est décidé dans le rendu de la PAGE ou d'un LAYOUT.*
 *
 * ⚠ **Les deux dernières lignes corrigent une croyance, et elles viennent d'ailleurs.** Mesurées
 * par `g9-etats` puis par `v4`, rejouées ici le 2026-08-28 : `generateMetadata` **ne tient pas le
 * statut, ni avec repli ni sans**. C'est pourtant le remède qu'avait retenu TCK-335 pour la fiche
 * de bien publique, dont le docblock explique encore que « `generateMetadata` est attendu AVANT
 * que la coque ne parte ».
 *
 * ⚠⚠ Le premier rejeu portait une sonde avec les DEUX appels — `generateMetadata` ET corps. Elle
 * prouvait l'effet du repli, et RIEN sur qui produit le 404 en son absence : elle a fait écrire
 * ici une ligne créditant `generateMetadata` d'un 404 qui vient du corps, c'est-à-dire la croyance
 * même que ce paragraphe existe pour tuer. Désagrégé depuis, quatre sondes d'UN SEUL appel chacune,
 * forme contrôlée par `md5` avant mesure, contrôle positif sur les quatre : seul le `notFound()`
 * du CORPS, et seulement sans frontière au-dessus, produit un 404. Celui de `generateMetadata`
 * rend un **soft-404** — l'écran introuvable est rendu, le titre retombe sur celui de la racine,
 * et la réponse reste 200.
 *
 * Conséquence pour ce fichier : le seul remède reste STRUCTUREL, et c'est bien ce que gardent les
 * trois règles du bloc « TCK-426 » ci-dessous. *Aucun second appel à `notFound()`, si haut soit-il
 * dans le rendu, ne rattrape une frontière posée au-dessus de lui — et celui des métadonnées n'en
 * rattrape aucune, même sans frontière.*
 *
 * CE QUE ÇA COÛTAIT, JUSQU'À TCK-426. `app/loading.tsx` était posé à la racine, donc ancêtre de
 * tout `/app` : l'échange était TOTAL, jamais segmentaire. Il couvrait 32 `redirect()` littéraux
 * sur 15 pages — plus neuf refus délégués à `assertCanReach*` que ce relevé ne voyait pas, la
 * population réelle étant donc de 41. La grande majorité étaient des refus d'**autorisation**.
 * Un utilisateur sans le droit recevait 200 + `AppShell` + le squelette de la route interdite,
 * puis rebondissait côté client : aucun contenu ne fuyait, mais l'écran mentait une fraction de
 * seconde, et le refus était indiscernable d'un succès pour tout ce qui n'est pas un navigateur.
 * `crm/page.tsx` perdait de même son 308, celui qui existe pour que les liens en favori résolvent
 * encore.
 *
 * CE QUE TCK-426 A RENDU, mesuré sur l'application réelle (API servie, session authentifiée) :
 * **307 sur les dix-huit surfaces agence** pour un `service_provider`, 200 pour les rôles admis,
 * **308** pour `/app/crm`, **307** pour l'aiguilleur `/app/overview`. Aucun squelette perdu :
 * `data-testid="route-skeleton"` est toujours servi sur les routes vérifiées.
 *
 * COMMENT. Vingt-trois refus ont remonté dans le `layout.tsx` de leur segment ; `app/loading.tsx`,
 * `leases/loading.tsx` et `maintenance/loading.tsx` sont descendus dans un groupe de routes avec
 * la page de liste qu'ils servaient ; `overview/loading.tsx` est descendu dans ses sept vues.
 *
 * ⚠ Les renvois de ligne de la rédaction précédente (`owners:36`, `maintenance/providers:34`,
 * `settings/agency/upgrade:34`) ont été RETIRÉS plutôt que corrigés. Ces trois lignes portent
 * aujourd'hui un commentaire disant que le refus a déménagé — mais un numéro de ligne se périme
 * au premier commentaire ajouté au-dessus, et c'est le motif que `PRO_ROUTES` a déjà payé.
 *
 * CE QUI GARDE TOUT CELA, désormais, et ce n'est plus « rien » : les trois règles du bloc
 * « TCK-426 » de ce fichier — aucune page muette sous une frontière, aucune page qui refuse un
 * UTILISATEUR sous une frontière, aucun layout de refus sous le repli d'un ancêtre — plus
 * `scripts/check-pro-routes.mjs`, qui lit maintenant la page ET ses layouts d'ancêtres.
 *
 * ⚠ **CE PARAGRAPHE DISAIT « ce qui reste dû », ET IL NE RESTE PLUS RIEN — TCK-442.** Il écrivait :
 * *« les 9 `notFound()` des pages de détail rendent toujours 200 ; la règle de ce fichier les exclut
 * par une propriété DÉRIVÉE du code (l'appel vit dans un bloc `catch`) »*. L'exclusion est
 * **supprimée**, avec la fonction `estDansUnCatch` qui la calculait et le test qui la délimitait :
 * la requête est montée avec la décision, dans un `layout.tsx` par segment de détail
 * (`src/lib/detail/ressource-de-detail.ts`), et les six `loading.tsx` de segment parent qui les
 * couvraient sont descendus dans un groupe `(liste)`.
 *
 * *Une exception dérivée se referme le jour où le code change — encore faut-il la retirer ce
 * jour-là. Une exclusion qu'on garde « au cas où » redevient une liste.*
 *
 * ⚠ Il n'existe toujours aucune suite e2e dans ce dépôt (`npm run test` = vitest/jsdom). Les
 * relevés HTTP ci-dessus ont été pris à la main, sur sondes jetables et sur l'application réelle ;
 * les règles de ce fichier gardent la FORME de l'arbre qui les produit, jamais les statuts
 * eux-mêmes.
 *
 * ⚠ Sur le catalogue PUBLIC, le même échange est inacceptable et le dépôt l'a déjà payé :
 * TCK-335 a SUPPRIMÉ `properties/[slug]/loading.tsx` pour rendre un vrai 404 à l'indexation, et
 * `[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts` le garde. Ne pas
 * recopier le patron de ce fichier-ci vers `(public)`.
 *
 * ⚠ Et c'est cette SUPPRESSION qui le tient, plus le `notFound()` du CORPS de la page — pas celui
 * de sa `generateMetadata`, qui ne produit aucun statut. La distinction n'est pas académique :
 * elle dit que le test qui interdit la frontière est la garde RÉELLE de ce 404, et qu'aucun appel
 * supplémentaire ne le sauverait si on la levait.
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
 * CE QUI COMPTE COMME UN REFUS FONDÉ SUR L'UTILISATEUR — une seule définition, deux règles.
 *
 * Les deux formes directes (`redirect`, `permanentRedirect`) plus les TROIS terminateurs
 * partagés du dépôt, parce qu'un refus délégué refuse tout autant qu'un refus écrit sur place :
 *
 *  · `assertCanReachAgentArea` / `assertCanReachAgencyStaffArea` (`src/lib/auth/guards.ts`) —
 *    neuf appels que le relevé de TCK-426 ne voyait pas, faute de compter autre chose que des
 *    `redirect()` littéraux. *Un inventaire qui compte une écriture ne compte pas une
 *    population.*
 *  · `ensureStandardAgencyOrRedirect` (`src/lib/access/server-guards.ts`) — ajouté ici par
 *    ANTICIPATION, et il faut le dire : mesuré le 2026-08-27, `grep -rn` sous
 *    `app/(dashboard)/app` ne rend AUCUN appel, il ne garde aujourd'hui que les cinq routes
 *    `/admin/*`. Il refuse pourtant par `redirect('/app')` exactement comme les deux autres, et
 *    la première page de `/app` qui l'appellerait échapperait à ces règles en silence. *Une
 *    liste fermée de terminateurs se complète quand on la lit, pas quand elle rate quelque
 *    chose.*
 *
 * ⚠ La liste reste FERMÉE, et c'est le point : une forme neuve de refus devra s'ajouter ici
 * explicitement. Une expression ouverte (« tout ce qui ressemble à un refus ») rendrait la règle
 * ininterprétable le jour où elle rougit.
 *
 * ⚠⚠ **`notFound` y est entré avec TCK-442, et c'est ce qui rend la règle sans exception.** Il
 * refuse pour une autre raison que les cinq autres — l'absence de la RESSOURCE, pas le droit de
 * l'utilisateur — mais il perd son statut exactement de la même façon : sous un repli, un
 * `notFound()` de page rend **200**, avec l'écran introuvable affiché quand même. La distinction
 * qui justifiait de l'exclure portait sur le COÛT du remède, jamais sur la justesse de la règle ;
 * le remède est payé, la distinction n'a plus lieu d'être.
 *
 * ⚠ `exigerRessource` est le terminateur qui porte ce `notFound()` dans les huit layouts de
 * détail — même motif que les trois terminateurs ci-dessus : *un refus délégué refuse tout autant
 * qu'un refus écrit sur place.*
 */
const REFUS = /\b(permanentRedirect|redirect|notFound)\s*\(|\b(assertCanReach\w*|ensureStandardAgencyOrRedirect|exigerRessource)\s*\(/;

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

  it('aucune page ne REFUSE depuis sous une frontière — utilisateur ou ressource', () => {
    // LA RÈGLE, et elle est désormais à zéro exception — AC3 de TCK-442. Un refus fondé sur
    // l'utilisateur — son rôle, son jeton, son agence — se décide AVANT toute donnée : TCK-426 en
    // a remonté 23 sur 14 segments. Un refus fondé sur la RÉPONSE de l'API — « ce bail n'existe
    // pas » — ne montait pas sans que la REQUÊTE monte avec lui : TCK-442 l'a fait monter, dans
    // huit `[id]/layout.tsx`.
    //
    // ⚠ **Il n'y a plus d'exclusion « dans un bloc `catch` », ni de test qui la délimite.** Elle
    // était dérivée et non listée, ce qui était le bon choix tant qu'elle décrivait un reste à
    // faire ; une fois le reste fait, une exclusion qu'on garde redevient une liste. Ce test
    // porte donc sur TOUS les appels de `REFUS`, où qu'ils soient écrits dans la page.
    const fautifs: string[] = [];
    let examinees = 0;

    for (const page of PAGES) {
      let dossier = page.segment;
      let couverte = false;
      for (;;) {
        if (existsSync(join(dossier, 'loading.tsx'))) { couverte = true; break; }
        if (dossier === APP) break;
        dossier = dirname(dossier);
      }
      if (!couverte) continue;
      examinees += 1;

      const source = sansCommentaires(page.source)
        .split('\n')
        .filter((l) => !/^\s*import\b/.test(l))
        .join('\n');

      for (const trouve of source.matchAll(new RegExp(REFUS, 'g'))) {
        const ligne = source.slice(0, trouve.index).split('\n').length;
        fautifs.push(`${page.rel}:${ligne} → ${trouve[0]}`);
      }
    }

    expect(
      fautifs,
      'ces refus rendent 200 + le squelette de la route interdite au lieu de leur statut ; ' +
        `remonte-les dans le layout.tsx de leur segment : ${fautifs.join(', ')}`,
    ).toEqual([]);

    // Le plancher OBLIGATOIRE, joué après la règle : elle serait verte si `couverte` devenait
    // faux partout — c'est-à-dire au moment précis où elle cesserait d'examiner quoi que ce
    // soit. C'est le mode de défaillance que le test « délimite » couvrait autrement.
    expect(examinees, 'la règle n’a examiné AUCUNE page sous une frontière').toBeGreaterThanOrEqual(20);
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
    const fautifs: string[] = [];

    const parcours = (dir: string) => {
      for (const entree of readdirSync(dir, { withFileTypes: true })) {
        const chemin = join(dir, entree.name);
        if (entree.isDirectory()) {
          if (entree.name !== '__tests__') parcours(chemin);
          continue;
        }
        if (entree.name !== 'layout.tsx') continue;
        if (!new RegExp(REFUS).test(sansCommentaires(readFileSync(chemin, 'utf8')))) continue;

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

describe('TCK-382 / TCK-442 — l’introuvable est branché sur toutes les pages de détail', () => {
  const DETAILS = PAGES.filter((p) => /\[[^\]]+\]\/page\.tsx$/.test(p.rel));

  it('relève les pages de détail (non-vacuité)', () => {
    expect(DETAILS.length).toBeGreaterThanOrEqual(6);
  });

  it('chacune décide son introuvable DANS SON LAYOUT, jamais dans sa page', () => {
    // ⚠ **Cette règle disait l'inverse jusqu'à TCK-442** : elle exigeait que chaque
    // `[id]/page.tsx` appelle `notFound()`. C'était le bon cliquet tant que l'appel vivait là —
    // et c'était aussi la raison pour laquelle il rendait 200. Il a déménagé d'un étage, la
    // règle avec lui.
    //
    // ⚠ Sur la source DÉBARRASSÉE de ses commentaires. La rédaction d'origine lisait la source
    // brute, et l'ablation mesurée l'avait montré vert : le docblock qui *expliquait*
    // `notFound()` le contenait encore. *Une garde qui lit ses propres explications se prouve
    // elle-même.* Le même piège s'applique mot pour mot au layout — les huit en portent un.
    const sansLayout: string[] = [];
    for (const page of DETAILS) {
      const layout = join(page.segment, 'layout.tsx');
      const source = existsSync(layout) ? sansCommentaires(readFileSync(layout, 'utf8')) : '';
      if (!/\bnotFound\s*\(|\bexigerRessource\s*\(/.test(source)) sansLayout.push(page.rel);
    }
    expect(
      sansLayout,
      'ces pages de détail ne refusent l’introuvable nulle part au-dessus de leur repli : leur ' +
        `404 rendrait 200 — ${sansLayout.join(', ')}`,
    ).toEqual([]);
  });

  it('et AUCUNE ne le décide encore dans sa page (le pendant du test ci-dessus)', () => {
    // Sans ce pendant, l'appel pourrait vivre AUX DEUX endroits : le layout cocherait la règle,
    // et celui de la page continuerait de rendre 200 sur les chemins qu'il est seul à couvrir.
    const dansLaPage = DETAILS.filter((p) => /\bnotFound\s*\(/.test(sansCommentaires(p.source)))
      .map((p) => p.rel);
    expect(
      dansLaPage,
      `un notFound() de PAGE rend 200 sous un repli : remonte-le dans le layout du segment — ${dansLaPage.join(', ')}`,
    ).toEqual([]);
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
