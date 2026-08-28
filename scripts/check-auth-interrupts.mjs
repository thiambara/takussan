#!/usr/bin/env node
/**
 * Garde des INTERRUPTIONS D'AUTORISATION de Next : `forbidden()` et `unauthorized()` sont
 * interdits sous `takussan-web/src` TANT QUE `experimental.authInterrupts` est absent de
 * `next.config.ts` — et le drapeau est interdit sans ses fichiers de frontière.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * LE MOTIF — un `done` mesuré une fois, faux pendant quatre mois
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * TCK-167 (2026-05-05) a retiré `forbidden()` de six pages et créé `assertCanReachAgentArea`,
 * en posant en AC3 que `experimental.authInterrupts` ne serait PAS activé. Les trois points
 * tenaient encore le 2026-08-27. Ce qui n'a pas tenu, c'est que **rien ne rejouait l'AC** : le
 * quatrième point de son delta — un parcours e2e des six routes — n'a jamais été fait, ses
 * propres notes le disent (« pas de setup Playwright dans le repo »).
 *
 * Trois pages écrites APRÈS ont donc réintroduit l'appel, chacune de bonne foi :
 *
 *     src/app/(dashboard)/app/customers/new/page.tsx            TCK-042   l. 24
 *     src/app/(dashboard)/app/crm/pipeline/page.tsx             TCK-083   l. 20
 *     src/app/(dashboard)/app/leases/onboarding-pending/page.tsx TCK-266  l. 31
 *
 * Et la troisième portait un docblock affirmant « Les autres tombent en 403 via `forbidden()` ».
 * C'est le genre de faux qui coûte : le prochain lecteur croit la garde bonne.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI SE PASSE VRAIMENT — mesuré le 2026-08-27, PAR EXÉCUTION du module installé
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *     $ node -e "const {forbidden}=require('next/dist/client/components/forbidden');
 *                try{forbidden()}catch(e){console.log(e.__NEXT_ERROR_CODE, e.message)}"
 *       E488  `forbidden()` is experimental and only allowed to be enabled when
 *             `experimental.authInterrupts` is enabled.
 *
 *     … la même chose avec process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS='1' :
 *       E1019  digest = NEXT_HTTP_ERROR_FALLBACK;403
 *
 * Le drapeau se transmet par `define-env.js:169`
 * (`'process.env.__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS': !!config.experimental.authInterrupts`).
 * Absent, `forbidden()` ne rend donc PAS un 403 : il LÈVE. La frontière `(dashboard)/error.tsx`
 * l'attrape et affiche son message générique — délibérément générique, son docblock explique
 * pourquoi. L'utilisateur non autorisé reçoit « une erreur est survenue » et un bouton
 * « réessayer » qui relèvera la même erreur. *Un refus n'est pas une panne.*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE GARDE VÉRIFIE — quatre contrôles, trois exacts et un cliquet
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   A. **Liaison.** Aucun `import` / `require` / `import()` ne lie `forbidden` ou
 *      `unauthorized`, sous quelque alias que ce soit, depuis quelque module que ce soit.
 *      Depuis QUELQUE MODULE que ce soit, délibérément : un module local qui réexporte
 *      `forbidden` serait l'évasion la plus courte, et il n'y a aucun usage légitime de ces
 *      deux noms dans ce dépôt.
 *   B. **Appel.** Aucun appel — ni d'une liaison trouvée en A (donc alias compris), ni
 *      qualifié (`nav.forbidden()`, `nav['forbidden']()`), ni nu.
 *   C. **Cohérence du drapeau.** Si `experimental.authInterrupts` APPARAÎT dans
 *      `next.config.ts`, A et B se lèvent — mais les fichiers de frontière `forbidden.tsx` /
 *      `unauthorized.tsx` deviennent obligatoires, faute de quoi l'interruption retombe sur la
 *      frontière d'erreur, c'est-à-dire exactement le défaut qu'on corrige. La garde le dit
 *      alors aussi : la décision de ce dépôt (AC3 de TCK-167, reconduite par TCK-378) est de
 *      NE PAS activer ce drapeau.
 *   D. **Cliquet du refus artisanal.** C'est le seul contrôle qui ne peut pas exiger zéro, et
 *      c'est la population d'où venaient les trois régressions : les écrans de `(dashboard)`
 *      qui décident d'un refus sur le rôle SANS passer par `src/lib/auth/guards.ts`. Chacun
 *      réinvente le terminateur, et un jour l'un d'eux réinvente `forbidden()`. Le cliquet
 *      n'est pas un NOMBRE mais un INVENTAIRE NOMMÉ (cf. `REFUS_ARTISANAL` plus bas) : un
 *      fichier de plus est rouge, un fichier qui sort de l'inventaire est rouge aussi — il faut
 *      alors retirer sa ligne, et le cliquet descend d'un cran pour de bon.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * COMMENT CETTE GARDE SE MÉFIE D'ELLE-MÊME
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * *Le mode d'échec d'une garde n'est pas de rougir à tort, c'est de CESSER DE MATCHER.* Trois
 * gardes de ce dépôt ont été défaites, l'une par un `<title>` SVG, l'autre par `title = {` avec
 * des espaces, la troisième par une multiplication écrite avant l'appel. Aucune n'a rougi ; les
 * trois sont restées vertes.
 *
 * Cette garde s'auto-éprouve donc **à chaque invocation**, sur huit plans. Les comptes ci-dessous
 * sont ceux du 2026-08-27 ; le script imprime les siens à chaque exécution, et c'est cette
 * sortie-là qui fait foi.
 *
 *   1. `EPREUVES` — 34 fragments de source, chacun avec les **genres de constat** attendus,
 *      passés dans la MÊME fonction `analyser()` que les vrais fichiers. Import multiligne,
 *      alias, guillemets doubles, `import * as`, `require`, `await import`, réexport, accès par
 *      crochets, espace avant la parenthèse, appel dans un commentaire, nom dans une chaîne :
 *      chacun a son cas. Un fragment qui cesserait d'être attrapé fait échouer la garde AVANT
 *      toute lecture du dépôt.
 *
 *      ⚠ Les genres, et pas « au moins un constat » : avec un simple `length > 0`, l'épreuve
 *      « alias » restait verte grâce au constat d'IMPORT pendant que la détection de l'APPEL
 *      aliasé était morte. *Une épreuve qui ne dit pas par quel chemin elle a réussi ne garde
 *      pas ce chemin.*
 *   2. `EPREUVES_DECISION` — 10 verdicts joués sur des entrées synthétiques, parce qu'une
 *      condition écrite au fil du script se neutralise en un `if (false)` que rien ne voit.
 *      Les quatre décisions sont donc des fonctions PURES.
 *   3. `SENTINELLES` — quatre chemins qui DOIVENT figurer dans l'ensemble parcouru. Déplacer
 *      une de ces pages sans le dire fait parler la garde au lieu de la rendre muette. *Un grep
 *      qui ne trouve plus rien et un grep qui ne cherche plus rien rendent la même sortie.*
 *
 *      ⚠ Elles ne suffisent PAS, et la revue de TCK-378 l'a mesuré : les quatre vivent dans les
 *      deux mêmes répertoires, donc exclure un répertoire QUI N'EN CONTIENT AUCUNE était
 *      silencieux — `entree === 'components'` faisait tomber le périmètre de 1110 à 517 fichiers
 *      (53 % du dépôt), avec un `forbidden()` réel planté dedans, et la garde sortait en 0. D'où
 *      le point 3 bis.
 *   3 bis. **Le périmètre est RECOUPÉ par `git ls-files`** — une énumération qui n'emprunte
 *      aucun code de ce script. Tout fichier suivi, présent et de bonne extension doit se
 *      retrouver dans le parcours ; une exclusion de répertoire, à n'importe quelle profondeur,
 *      est alors rouge et NOMMÉE. *Le périmètre d'une garde n'est pas une liste de répertoires,
 *      c'est ce qu'elle monte réellement — et ça ne se vérifie qu'en le recoupant.*
 *   4. `PLANCHERS` — une taille minimale pour chacune des listes ci-dessus. Vider `SENTINELLES`
 *      la rendait muette **sans la rendre rouge** : le filtre des absentes d'une liste vide est
 *      vide. Une liste d'épreuves qu'on peut vider n'est pas une épreuve.
 *   5. `PLAFOND_MESURE` — le compte de `REFUS_ARTISANAL`, redit à part. Allonger l'inventaire
 *      d'une ligne remontait le plafond sans un mot ; il faut désormais deux lignes et un
 *      argument.
 *   6. **Aucune exemption, et c'est marqué EN FIN DE CORPS.** `analysees` est un ENSEMBLE, et
 *      `analysees.add(rel)` est la dernière instruction de la boucle. Un `if (…) continue;`
 *      glissé n'importe où au-dessus saute le marquage et fait rougir la garde. ⚠ Ce point ne
 *      valait qu'à moitié jusqu'à la revue de TCK-378 : le compteur était en TÊTE de boucle, et
 *      la même exemption posée UNE LIGNE PLUS BAS sortait en 0.
 *   7. `EPREUVES_CONFIG` — le LECTEUR de `next.config.ts`, joué sur des fragments synthétiques
 *      ET sur la config réelle. Il ne l'était pas, et deux mutations d'un seul mot éteignaient
 *      le contrôle C entier en silence, drapeau réellement actif compris. *L'auto-épreuve d'une
 *      garde doit couvrir sa CONFIGURATION, pas seulement ses expressions régulières.*
 *   8. `EPREUVES_ROLE` — le détecteur du cliquet D, joué sur les prédicats réellement lus dans
 *      `src/lib/roles.ts`. Il ne comptait que les écrans qui IMPORTENT `@/lib/roles` : celui qui
 *      décide en ligne (`user.roles.includes('agency_admin')`) lui était invisible, et il en
 *      existait déjà un dans le dépôt.
 *
 * Les points ci-dessus n'ont pas été imaginés : ils sont les trous trouvés en MUTANT cette
 * garde. 21 mutations à l'écriture du ticket, toutes attrapées — puis 7 échappées sur 12 à la
 * revue adverse, dont trois éteignaient un contrôle entier. *Un « 21/21 » est un compte honnête
 * des formes qu'on a choisies, jamais une preuve d'étanchéité.* Les sept sont fermées ici, et
 * rejouées à chaque invocation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE NE PEUT PAS — les limites, écrites parce qu'un vert doit se lire juste
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *   · **Un nom CALCULÉ lui échappe.** `nav['for' + 'bidden']()` n'est pas décidable par lecture
 *     de texte. Personne n'écrit cela par accident — et quiconque l'écrirait exprès n'a pas
 *     besoin de cette garde pour savoir ce qu'il fait.
 *   · **Elle produit un FAUX POSITIF sur `objet.forbidden`**, quel que soit l'objet, dès que
 *     l'accès n'est pas dans une chaîne. Assumé, et éprouvé comme tel (l'épreuve « membre
 *     homonyme »). Mesuré le 2026-08-27 : les quatre `.forbidden` / `.unauthorized` de `src` sont
 *     tous dans un `t('errors.forbidden')`, donc dans une chaîne, donc neutralisés. Le jour où
 *     un champ d'API s'appellera `forbidden`, ce commentaire sera la première chose à relire.
 *   · **Elle ne juge pas si une page GARDE bien son accès** — seulement qu'aucune ne le refuse
 *     par une interruption désarmée. Le cliquet D borne la population où le défaut renaît ; il
 *     ne la corrige pas. C'est le hors-périmètre explicite de TCK-378.
 *   · **Elle ne peut pas se prémunir de sa propre amputation.** Supprimer une ligne
 *     `echecs.push(...evaluerX(…))` du flot principal ne fait rougir personne. Tout le reste —
 *     regex affaiblie, condition inversée, liste vidée, exemption glissée, plafond remonté — a
 *     été mis à l'épreuve.
 *   · **Un répertoire exclu DANS un fichier non suivi par git** lui échappe encore : le
 *     recoupement n'exige que les fichiers suivis. C'est assumé — un fichier non suivi ne part
 *     ni en CI ni en production.
 *
 * Usage :
 *   node scripts/check-auth-interrupts.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-auth-interrupts.mjs --report   # + le détail de chaque contrôle
 *
 * @see docs/backlog/tickets/TCK-378-forbidden-trois-pages-et-la-garde-manquante.md
 * @see docs/backlog/tickets/TCK-167-fix-forbidden-server-pages-customer.md (l'AC rejouée)
 * @see takussan-web/src/lib/auth/guards.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const WEB = join(ROOT, 'takussan-web');
const SRC = join(WEB, 'src');
const CONFIG = join(WEB, 'next.config.ts');

/** Les deux interruptions d'autorisation de Next. Il n'y en a pas d'autre à ce jour. */
const INTERRUPTIONS = ['forbidden', 'unauthorized'];

/**
 * Les chemins qui doivent se trouver dans l'ensemble parcouru.
 *
 * Ce ne sont pas des exemples : ce sont les trois pages qui portaient l'appel, plus le module
 * qui porte le remplacement. Si l'une disparaît du périmètre — répertoire exclu, fichier
 * déplacé, extension oubliée — la garde le dit, au lieu de passer au vert sur un ensemble vide
 * de ce qu'elle surveille.
 */
const SENTINELLES = [
  'src/app/(dashboard)/app/customers/new/page.tsx',
  'src/app/(dashboard)/app/crm/pipeline/page.tsx',
  'src/app/(dashboard)/app/leases/onboarding-pending/page.tsx',
  'src/lib/auth/guards.ts',
];

/**
 * Le cliquet D — l'inventaire des écrans de `(dashboard)` qui décident d'un refus sur le rôle
 * sans passer par `src/lib/auth/guards.ts`.
 *
 * Relevé du 2026-08-27, après TCK-378 : 24 fichiers avant, 21 après (les trois pages du ticket
 * sont passées par le helper) — puis **22** le même jour, la revue ayant trouvé que le détecteur
 * était aveugle à la décision de rôle écrite EN LIGNE. Le vingt-deuxième n'a pas été ajouté au
 * dépôt : il y était, et le cliquet ne le voyait pas.
 *
 * ⚠ Cette liste n'est PAS une liste d'exceptions tolérées : c'est un plafond. Ces écrans
 * écrivent chacun leur propre `redirect('/app…')` à la main, ce qui est correct aujourd'hui et
 * fragile demain — c'est de cette population qu'est sorti chacun des trois `forbidden()`.
 * TCK-378 ne les convertit pas (hors périmètre), il en interdit le vingt-deuxième.
 *
 * Si vous ajoutez une ligne ici, vous remontez un plafond : dites pourquoi dans le message de
 * commit. Si la garde vous dit qu'une ligne est PÉRIMÉE, ce n'est pas une régression — c'est un
 * progrès que l'inventaire doit enregistrer : retirez la ligne, le cliquet descend.
 */
/**
 * TCK-426 — NEUF ENTRÉES ONT CHANGÉ DE FICHIER, AUCUNE N'A CHANGÉ DE NATURE.
 *
 * Les refus de rôle de `owners`, `maintenance/providers`, `settings/agency/upgrade` et des six
 * vues d'`overview` ont quitté leur `page.tsx` pour le `layout.tsx` de leur segment. Ce n'est
 * pas un rangement : chacune de ces routes porte un `loading.tsx`, donc une frontière de
 * suspension, et Next envoie la coque ET le code de réponse avant que la page n'ait rien décidé.
 * Un `redirect()` de page y rendait **200** + le squelette de la route interdite ; le même dans
 * le layout rend **307** — mesuré par sonde, puis CONFIRMÉ sur l'application réelle (un
 * prestataire authentifié : 307 sur les 18 surfaces agence, contre 200 avant).
 *
 * `PLAFOND_MESURE` ne bouge donc PAS : la population est la même, à la même taille, au même
 * degré d'artisanat. Seul son étage a changé. *Un inventaire indexé sur des chemins doit suivre
 * un déménagement, sans quoi il compte deux fois — une population périmée et une population
 * neuve — et ni l'une ni l'autre n'existe.*
 */
const REFUS_ARTISANAL = [
  'src/app/(dashboard)/admin/agency/billing/page.tsx',
  'src/app/(dashboard)/admin/agency/kyc/page.tsx',
  'src/app/(dashboard)/admin/agency/page.tsx',
  'src/app/(dashboard)/admin/audit/page.tsx',
  'src/app/(dashboard)/admin/finances/page.tsx',
  'src/app/(dashboard)/admin/layout.tsx',
  'src/app/(dashboard)/admin/moderation/page.tsx',
  'src/app/(dashboard)/admin/moderation/properties/page.tsx',
  'src/app/(dashboard)/admin/roles/page.tsx',
  'src/app/(dashboard)/admin/settings/integrations/page.tsx',
  'src/app/(dashboard)/admin/settings/page.tsx',
  'src/app/(dashboard)/admin/team/page.tsx',
  'src/app/(dashboard)/app/maintenance/providers/layout.tsx',
  'src/app/(dashboard)/app/overview/agency/layout.tsx',
  'src/app/(dashboard)/app/overview/agent/layout.tsx',
  'src/app/(dashboard)/app/overview/alerts/layout.tsx',
  'src/app/(dashboard)/app/overview/exports/layout.tsx',
  'src/app/(dashboard)/app/overview/kpis/layout.tsx',
  'src/app/(dashboard)/app/overview/owner/layout.tsx',
  'src/app/(dashboard)/app/overview/page.tsx',
  'src/app/(dashboard)/app/owners/layout.tsx',
  // Le VINGT-DEUXIÈME, trouvé par la revue de TCK-378 en mutant cette garde : il décide du rôle
  // EN LIGNE (`user.roles.includes('agency_admin') || user.roles.includes('super_admin')`, l. 35)
  // sans importer `@/lib/roles`, et l'ancien détecteur ne comptait que les IMPORTS. Il n'est pas
  // neuf : il était là, et l'inventaire disait 21 pour une population de 22. Le plafond monte
  // donc d'un cran — non pas parce qu'un écart a été ACCEPTÉ, mais parce qu'un écart qui existait
  // devient enfin VISIBLE. *Un inventaire qui ne voit qu'une écriture ne compte pas une
  // population, il compte ses propres regex.*
  'src/app/(dashboard)/app/settings/agency/upgrade/layout.tsx',
];

/**
 * Le plafond MESURÉ le 2026-08-27, écrit à part de la liste.
 *
 * Trouvé en mutant cette garde : allonger `REFUS_ARTISANAL` d'une ligne remontait le plafond
 * sans un mot. Le chiffre est donc redit ici, et l'écart entre les deux fait échouer la garde :
 * *remonter un plafond doit coûter deux lignes et un argument, pas une.*
 */
const PLAFOND_MESURE = 22;

const EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs)$/;

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Neutralisation — commentaires et chaînes
 *
 * Les deux sont remplacés par des ESPACES de même longueur, jamais supprimés : les décalages
 * sont conservés, donc les numéros de ligne restent justes. C'est ce qui permet à la garde de
 * pointer une ligne exacte plutôt que « quelque part dans ce fichier ».
 *
 * Pourquoi neutraliser :
 *   · les commentaires, parce que l'AC1 de TCK-378 autorise explicitement le MOT `forbidden`
 *     dans un docblock (celui de `guards.ts` raconte précisément pourquoi il est banni) ;
 *   · les chaînes, parce que `t('errors.forbidden')` existe dans trois composants et dans les
 *     trois dictionnaires. Un détecteur qui les compterait serait rouge au repos, donc désarmé
 *     le lendemain.
 *
 * Ce que ça ne couvre PAS, et qui est assumé : un littéral d'expression régulière contenant
 * `//` ou une apostrophe peut désynchroniser l'automate. Aucun n'existe dans `src` ; et le pire
 * cas est un FAUX POSITIF bruyant, pas un silence.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
function neutraliser(src, { chaines }) {
  const out = src.split('');
  const blanchir = (a, b) => {
    for (let k = a; k < b && k < out.length; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = i + 2;
      while (j < src.length && src[j] !== '\n') j += 1;
      blanchir(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = i + 2;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
      blanchir(i, Math.min(j + 2, src.length));
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === c) break;
        if (c !== '`' && src[j] === '\n') break; // chaîne non terminée : on ne mange pas le reste
        j += 1;
      }
      if (chaines) blanchir(i + 1, j);
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

const ligneDe = (src, index) => src.slice(0, index).split('\n').length;

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * L'analyse — la SEULE fonction qui décide, pour un fichier réel comme pour une épreuve
 *
 * C'est délibéré : une auto-épreuve qui n'emprunte pas exactement le chemin de production ne
 * prouve rien de la production.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
function analyser(source) {
  const sansCommentaires = neutraliser(source, { chaines: false });
  const sansRien = neutraliser(source, { chaines: true });

  /** @type {{genre: string, nom: string, ligne: number, extrait: string}[]} */
  const constats = [];
  const liaisons = new Set(INTERRUPTIONS);   // les noms nus comptent toujours
  const espaces = new Set();                 // liaisons de namespace : `import * as nav`

  const ajouter = (genre, nom, index, extrait) => {
    constats.push({ genre, nom, ligne: ligneDe(source, index), extrait: extrait.trim().replace(/\s+/g, ' ') });
  };

  // ── A1 · `import … from '…'`, clause complète, MULTILIGNE COMPRISE.
  //
  // Le `[\s\S]*?` est le point qui compte : une garde ligne à ligne rate
  //   import {
  //     forbidden,
  //   } from 'next/navigation';
  // et c'est exactement la forme que Prettier produit dès que la clause dépasse la largeur.
  const IMPORT = /\bimport\s+(?!type\s*[({])([\s\S]*?)\s+from\s*(['"])([^'"]*)\2/g;
  for (const m of sansCommentaires.matchAll(IMPORT)) {
    const clause = m[1];
    const module = m[3];
    const nommes = clause.match(/\{([\s\S]*?)\}/);
    if (nommes) {
      for (const brut of nommes[1].split(',')) {
        const p = brut.trim().replace(/^type\s+/, '');
        if (!p) continue;
        const [origine, alias] = p.split(/\s+as\s+/).map((s) => s.trim());
        if (!INTERRUPTIONS.includes(origine)) continue;
        liaisons.add(alias || origine);
        ajouter('liaison', origine, m.index, `import { ${p} } from '${module}'`);
      }
    }
    const ns = clause.match(/\*\s*as\s+([A-Za-z_$][\w$]*)/);
    if (ns) espaces.add(ns[1]);
  }

  // ── A4 · RÉEXPORT : `export { forbidden } from 'next/navigation'`.
  //
  // Trouvé en mutant cette garde : sans ce détecteur, un module d'une ligne suffisait à blanchir
  // l'import. Le détecteur A1 aurait attrapé la PAGE qui importe ce module, mais pas le module
  // lui-même — et une garde qui ne voit un défaut qu'à son deuxième maillon dépend de la
  // longueur de la chaîne. Ce dépôt réexporte de cette façon dans 5 barils (`components/*/index.ts`).
  const REEXPORT = /\bexport\s*\{([\s\S]*?)\}\s*from\s*(['"])([^'"]*)\2/g;
  for (const m of sansCommentaires.matchAll(REEXPORT)) {
    for (const brut of m[1].split(',')) {
      const p = brut.trim().replace(/^type\s+/, '');
      if (!p) continue;
      const [origine, alias] = p.split(/\s+as\s+/).map((s) => s.trim());
      if (!INTERRUPTIONS.includes(origine)) continue;
      liaisons.add(alias || origine);
      ajouter('réexport', origine, m.index, `export { ${p} } from '${m[3]}'`);
    }
  }

  // ── A2 · destructuration d'un `require()` ou d'un `import()` dynamique.
  const DESTRUCTURE = /(?:const|let|var)\s*\{([\s\S]*?)\}\s*=\s*(?:await\s+)?(?:require|import)\s*\(\s*(['"])([^'"]*)\2/g;
  for (const m of sansCommentaires.matchAll(DESTRUCTURE)) {
    for (const brut of m[1].split(',')) {
      const p = brut.trim();
      if (!p) continue;
      const [origine, alias] = p.split(/\s*:\s*/).map((s) => s.trim());
      if (!INTERRUPTIONS.includes(origine)) continue;
      liaisons.add(alias || origine);
      ajouter('liaison', origine, m.index, `const { ${p} } = …('${m[3]}')`);
    }
  }

  // ── A3 · liaison d'espace de noms par affectation : `const nav = await import('…')`.
  const ESPACE = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:require|import)\s*\(/g;
  for (const m of sansCommentaires.matchAll(ESPACE)) espaces.add(m[1]);

  // ── A5 · liaison par AFFECTATION depuis un membre : `const deny = nav.forbidden;`.
  //
  // Trouvé en mutant cette garde. B3 voyait bien la référence, mais l'APPEL `deny()` restait
  // invisible — le rapport nommait la ligne de l'affectation, pas celle du refus. Enregistrer le
  // nom d'affectation ici (donc AVANT B1) rend les deux lignes.
  const AFFECTATION = new RegExp(
    `(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*[\\w$.?[\\]'"\`]*[.?]\\s*(?:${INTERRUPTIONS.join('|')})\\b`,
    'g',
  );
  for (const m of sansRien.matchAll(AFFECTATION)) liaisons.add(m[1]);

  // ── B1 · appel d'une liaison connue (alias compris), avec ou sans espace avant la parenthèse.
  //
  // `\s*\(` et non `\(` : une garde de ce dépôt a déjà été défaite par une écriture espacée.
  // La négation à gauche écarte `obj.forbidden(` (traité en B2) et `maForbidden(`.
  for (const nom of liaisons) {
    const APPEL = new RegExp(`(?<![.\\w$?])${nom.replace(/[$]/g, '\\$&')}\\s*\\(`, 'g');
    for (const m of sansRien.matchAll(APPEL)) {
      // `function forbidden(` / `const forbidden = (` sont des DÉCLARATIONS : les compter comme
      // appel serait faux, mais les laisser passer laisserait fabriquer un homonyme local. On
      // les classe donc à part, et elles restent une violation.
      const avant = sansRien.slice(Math.max(0, m.index - 20), m.index);
      const genre = /\b(function|class)\s*$/.test(avant) ? 'declaration' : 'appel';
      ajouter(genre, nom, m.index, sansRien.slice(m.index, m.index + 40).split('\n')[0]);
    }
  }

  // ── B2 · appel qualifié : `nav.forbidden()`, `nav?.forbidden()`, `nav['forbidden']()`.
  //
  // Sur N'IMPORTE quel objet, pas seulement sur un `espaces` connu : un `m.forbidden()` dans le
  // `.then()` d'un `import()` n'a pas de liaison nommée, et c'est le contournement le plus court.
  const QUALIFIE = new RegExp(`[.?]\\s*(${INTERRUPTIONS.join('|')})\\s*\\(`, 'g');
  for (const m of sansRien.matchAll(QUALIFIE)) {
    ajouter('appel-qualifié', m[1], m.index, sansRien.slice(Math.max(0, m.index - 24), m.index + 24).split('\n').pop());
  }
  // ── B3 · RÉFÉRENCE qualifiée sans appel : `const deny = nav.forbidden;`.
  //
  // Trouvé en mutant cette garde : B2 exige une parenthèse, donc `const deny = nav.forbidden`
  // puis `deny()` passait entre les deux détecteurs. *Une garde à expressions régulières ne voit
  // qu'une écriture ; il faut donc en écrire une par écriture.* Zéro faux positif mesuré le
  // 2026-08-27 : les quatre `.forbidden` / `.unauthorized` de `src` sont tous DANS une chaîne
  // (`t('errors.forbidden')`), et les chaînes sont blanchies dans `sansRien`.
  const REFERENCE = new RegExp(`[.?]\\s*(${INTERRUPTIONS.join('|')})\\b(?!\\s*\\()`, 'g');
  for (const m of sansRien.matchAll(REFERENCE)) {
    ajouter('référence-qualifiée', m[1], m.index, sansRien.slice(Math.max(0, m.index - 24), m.index + 20).split('\n').pop());
  }

  const CROCHETS = new RegExp(`\\[\\s*['"\`](${INTERRUPTIONS.join('|')})['"\`]\\s*\\]\\s*\\(`, 'g');
  // Les chaînes sont blanchies dans `sansRien` : cette forme se lit sur `sansCommentaires`.
  for (const m of sansCommentaires.matchAll(CROCHETS)) {
    ajouter('appel-crochets', m[1], m.index, m[0]);
  }

  // Un même endroit peut être vu par deux détecteurs (une liaison ET son appel) : c'est voulu,
  // le rapport le dit. Mais deux détecteurs sur le MÊME offset seraient du bruit.
  const vus = new Set();
  return {
    constats: constats.filter((c) => {
      const cle = `${c.genre}:${c.ligne}:${c.nom}`;
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    }),
    espaces: [...espaces],
  };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Les épreuves — jouées à CHAQUE invocation, avant de lire quoi que ce soit du dépôt
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
const EPREUVES = [
  // ── source ──────────────────────────────── genres attendus ──── ce que la forme éprouve ────
  ["import { forbidden } from 'next/navigation';\nforbidden();", ['appel', 'liaison'], 'forme canonique'],
  ['import {forbidden} from "next/navigation";\nforbidden()', ['appel', 'liaison'], 'sans espaces, guillemets doubles'],
  ["import {\n  redirect,\n  forbidden,\n} from 'next/navigation';\nforbidden();", ['appel', 'liaison'], 'clause MULTILIGNE — ce qu’une garde ligne à ligne rate'],
  ["import { forbidden as refuser } from 'next/navigation';\nrefuser();", ['appel', 'liaison'], 'ALIAS — l’appel porte un autre nom'],
  ["import { unauthorized } from 'next/navigation';\nunauthorized();", ['appel', 'liaison'], '`unauthorized`, la jumelle'],
  ["import { forbidden }   from   'next/navigation';\nforbidden ();", ['appel', 'liaison'], 'espace AVANT la parenthèse'],
  ["import * as nav from 'next/navigation';\nnav.forbidden();", ['appel-qualifié'], 'espace de noms'],
  ["import * as nav from 'next/navigation';\nnav.forbidden ();", ['appel-qualifié'], 'espace de noms + espace avant la parenthèse — isole B2'],
  ["import * as nav from 'next/navigation';\nnav?.forbidden();", ['appel-qualifié'], 'espace de noms, chaînage optionnel'],
  ["import * as nav from 'next/navigation';\nnav['forbidden']();", ['appel-crochets'], 'accès par crochets'],
  ["const { forbidden } = require('next/navigation');\nforbidden();", ['appel', 'liaison'], 'require()'],
  ["const { forbidden } = await import('next/navigation');\nforbidden();", ['appel', 'liaison'], 'import() dynamique'],
  ["const { forbidden: refuser } = await import('next/navigation');\nrefuser();", ['appel', 'liaison'], 'import() dynamique + renommage'],
  ["import('next/navigation').then((m) => m.forbidden());", ['appel-qualifié'], 'import() sans liaison nommée'],
  ['forbidden();', ['appel'], 'appel nu, sans import (helper global ou local)'],
  ['if (!ok) forbidden ();', ['appel'], 'appel NU avec espace — isole B1 de A1'],
  ['function forbidden() { return 1; }', ['declaration'], 'homonyme local — il masquerait la garde'],
  ["import { forbidden } from './mes-helpers';", ['liaison'], 'import depuis un module LOCAL — le blanchiment le plus court'],
  ["export { forbidden } from 'next/navigation';", ['réexport'], 'RÉEXPORT — un module d’une ligne qui blanchit l’import'],
  ["export { forbidden as deny } from 'next/navigation';", ['réexport'], 'réexport renommé'],
  ["import * as nav from 'next/navigation';\nconst deny = nav.forbidden;\ndeny();", ['appel', 'référence-qualifiée'], 'RÉFÉRENCE sans appel, puis appel de l’alias'],
  ["import {\n  forbidden as deny,\n  redirect,\n} from 'next/navigation';\nif (!ok) deny();", ['appel', 'liaison'], 'multiligne + alias + appel conditionnel, cumulés'],
  ["import type { Metadata } from 'next';\nimport { forbidden } from 'next/navigation';", ['liaison'], 'précédé d’un import de type'],
  ['\tforbidden(\n  );', ['appel'], 'tabulation et parenthèse à la ligne'],
  ['const e = { forbidden: 403 };\nconsole.log(e.forbidden);', ['référence-qualifiée'], 'membre homonyme — FAUX POSITIF ASSUMÉ, cf. § PORTÉE'],

  // ── doivent ne produire AUCUN constat ───────────────────────────────────────────────────────
  ["// on n'appelle plus forbidden() ici, cf. TCK-378", [], 'appel dans un commentaire de ligne'],
  ['/**\n * Les autres tombent en 403 via `forbidden()`.\n */', [], 'appel dans un docblock — l’AC1 de TCK-378 l’autorise'],
  ["t('errors.forbidden');", [], 'clé de traduction — 4 occurrences réelles dans `src`'],
  ['const msg = "forbidden()";', [], 'le texte dans une chaîne'],
  ['for (const forbidden of liste) expect(x).not.toContain(forbidden);', [], 'variable homonyme, jamais appelée'],
  ["it('%s', (forbidden) => { expect(h).not.toContain(forbidden); });", [], 'paramètre homonyme'],
  ["import { redirect } from 'next/navigation';\nredirect('/app');", [], 'la forme DÉCIDÉE par TCK-167'],
  ['const forbiddenRoutes = [];\nforbiddenRoutes.forEach(() => {});', [], 'préfixe — `forbiddenRoutes` n’est pas `forbidden`'],
  ["export { PropertyCard } from './PropertyCard';", [], 'baril de réexport ordinaire — 5 dans ce dépôt'],
];

/**
 * Les PLANCHERS des listes d'auto-épreuve.
 *
 * Trouvés en MUTANT cette garde : vider `SENTINELLES` la rendait muette **sans la rendre
 * rouge** — le filtre des sentinelles absentes d'une liste vide est vide, et tout passait. Une
 * liste d'épreuves qu'on peut vider n'est pas une épreuve, c'est une décoration.
 *
 * Rétrécir l'une de ces listes est donc un acte délibéré : il faut baisser le plancher dans le
 * même diff, et dire pourquoi.
 */
const PLANCHERS = { EPREUVES: 34, SENTINELLES: 4, GENRES: 7, EPREUVES_CONFIG: 9, EPREUVES_ROLE: 10, EPREUVES_TERMINATEUR: 7, EPREUVES_PERIMETRE: 5 };

/**
 * Les genres de constat que `analyser()` sait produire — un par détecteur.
 *
 * Chacun doit être exercé par au moins une épreuve, sans quoi le détecteur correspondant peut
 * mourir en silence. C'est vérifié à chaque invocation.
 */
const GENRES = ['liaison', 'réexport', 'appel', 'declaration', 'appel-qualifié', 'appel-crochets', 'référence-qualifiée'];

function jouerLesEpreuves() {
  const ratees = [];

  // Les planchers d'abord : une liste rétrécie ne se voit pas dans le résultat des épreuves.
  for (const [nom, minimum, liste] of [
    ['EPREUVES', PLANCHERS.EPREUVES, EPREUVES],
    ['SENTINELLES', PLANCHERS.SENTINELLES, SENTINELLES],
    ['GENRES', PLANCHERS.GENRES, GENRES],
    ['EPREUVES_CONFIG', PLANCHERS.EPREUVES_CONFIG, EPREUVES_CONFIG],
    ['EPREUVES_ROLE', PLANCHERS.EPREUVES_ROLE, EPREUVES_ROLE],
    ['EPREUVES_TERMINATEUR', PLANCHERS.EPREUVES_TERMINATEUR, EPREUVES_TERMINATEUR],
    ['EPREUVES_PERIMETRE', PLANCHERS.EPREUVES_PERIMETRE, EPREUVES_PERIMETRE],
  ]) {
    if (liste.length < minimum) {
      ratees.push({
        nom: `plancher ${nom}`,
        attendu: `≥ ${minimum} entrées`,
        obtenu: `${liste.length}`,
        source: '(liste rétrécie — cf. § PLANCHERS)',
      });
    }
  }

  if (REFUS_ARTISANAL.length !== PLAFOND_MESURE) {
    ratees.push({
      nom: 'plafond REFUS_ARTISANAL',
      attendu: `${PLAFOND_MESURE} entrées (relevé du 2026-08-27)`,
      obtenu: `${REFUS_ARTISANAL.length}`,
      source: '(l’inventaire a bougé sans que `PLAFOND_MESURE` bouge)',
    });
  }

  // Puis les formes — et l'égalité porte sur les GENRES, pas sur « au moins un constat ».
  //
  // Trouvé en mutant cette garde : avec un simple `constats.length > 0`, remplacer
  // `liaisons.add(alias || origine)` par `liaisons.add(origine)` passait INAPERÇU — l'épreuve
  // « alias » restait verte grâce au constat de LIAISON, pendant que la détection de l'APPEL
  // aliasé était morte. *Une épreuve qui ne dit pas par quel chemin elle a réussi ne garde pas
  // ce chemin.*
  for (const [source, attendu, nom] of EPREUVES) {
    const genres = [...new Set(analyser(source).constats.map((c) => c.genre))].sort();
    const vise = [...attendu].sort();
    if (genres.join('|') !== vise.join('|')) {
      ratees.push({
        nom,
        attendu: vise.length ? vise.join(' + ') : '(rien)',
        obtenu: genres.length ? genres.join(' + ') : '(rien)',
        source,
      });
    }
  }

  // Enfin : chaque genre déclaré doit être exercé par au moins une épreuve. Un détecteur qu'aucune
  // épreuve n'atteint est un détecteur qu'on peut casser en silence.
  const exerces = new Set(EPREUVES.flatMap(([, attendu]) => attendu));
  for (const genre of GENRES) {
    if (!exerces.has(genre)) {
      ratees.push({
        nom: `genre « ${genre} » non exercé`,
        attendu: 'au moins une épreuve',
        obtenu: 'aucune',
        source: '(couverture des détecteurs)',
      });
    }
  }

  // Le LECTEUR DE CONFIGURATION — sur des fragments synthétiques, plus la config réelle.
  //
  // ⚠ D'abord : la source lue doit VRAIMENT être le fichier. Mutation de mon cru, échappée au
  // premier essai : `lireConfig()` renvoyant `''` passait toutes les épreuves ci-dessous — elles
  // n'attendent qu'un `present: false`, et le rond-trip fonctionne aussi bien sur une chaîne
  // vide. Le contrôle C devenait aveugle à un drapeau réellement activé. La taille est donc
  // recoupée par `statSync`, qui n'emprunte pas le même chemin que `readFileSync`.
  const configReelle = lireConfig();
  if (configReelle !== null) {
    const octets = Buffer.byteLength(configReelle, 'utf8');
    const taille = statSync(CONFIG).size;
    if (octets !== taille) {
      ratees.push({
        nom: 'lecteur de config — la source lue n’est pas le fichier',
        attendu: `${taille} octets (statSync)`,
        obtenu: `${octets} octets`,
        source: '(next.config.ts)',
      });
    }
  }
  for (const [nom, fragment, attendu] of EPREUVES_CONFIG) {
    const besoinDuReel = fragment === null || typeof fragment === 'function';
    if (besoinDuReel && configReelle === null) continue; // l'absence est dite ailleurs, bruyamment
    const source = typeof fragment === 'function' ? fragment(configReelle) : (fragment ?? configReelle);
    const obtenu = drapeauActif(source);
    const dit = (o) => `present=${o.present}${o.valeur === undefined ? '' : ` valeur=${o.valeur}`}`;
    if (dit(obtenu) !== dit(attendu)) {
      ratees.push({ nom: `config — ${nom}`, attendu: dit(attendu), obtenu: dit(obtenu), source: typeof fragment === 'string' ? fragment : '(next.config.ts)' });
    }
  }

  // Le détecteur de DÉCISION SUR LE RÔLE — sur les prédicats réellement lus dans `roles.ts`.
  const predicats = predicatsDeRole();
  if (predicats.length < PLANCHER_PREDICATS) {
    ratees.push({
      nom: 'plancher PREDICATS',
      attendu: `≥ ${PLANCHER_PREDICATS} prédicats \`is*\` exportés par src/lib/roles.ts`,
      obtenu: `${predicats.length}`,
      source: '(fichier déplacé, renommé, ou réécrit — le cliquet D compterait zéro décision)',
    });
  }
  for (const [nom, source, attendu] of EPREUVES_ROLE) {
    const obtenu = decideDuRole(source, predicats);
    if (obtenu !== attendu) {
      ratees.push({ nom: `rôle — ${nom}`, attendu: `${attendu}`, obtenu: `${obtenu}`, source });
    }
  }
  for (const [nom, executer, attendu] of EPREUVES_PERIMETRE) {
    const obtenu = executer();
    if (obtenu.join('|') !== attendu.join('|')) {
      ratees.push({ nom: `périmètre — ${nom}`, attendu: `[${attendu}]`, obtenu: `[${obtenu}]`, source: '(entrées synthétiques)' });
    }
  }
  for (const [nom, source, attendu] of EPREUVES_TERMINATEUR) {
    const obtenu = termineLeRefus(source);
    if (obtenu !== attendu) {
      ratees.push({ nom: `terminateur — ${nom}`, attendu: `${attendu}`, obtenu: `${obtenu}`, source });
    }
  }

  // Et les DÉCISIONS, sur des entrées synthétiques : c'est ce qui empêche un `if (false)` de
  // passer inaperçu.
  for (const [nom, executer, attendu] of EPREUVES_DECISION) {
    const obtenu = executer().length;
    if (obtenu !== attendu) {
      ratees.push({ nom: `décision — ${nom}`, attendu: `${attendu} message(s)`, obtenu: `${obtenu}`, source: '(entrées synthétiques)' });
    }
  }

  return ratees;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * LE PÉRIMÈTRE — et pourquoi il est recoupé par une SECONDE énumération
 *
 * Les `SENTINELLES` gardent quatre chemins, tous dans `src/app/(dashboard)/app/…` et
 * `src/lib/auth/`. Retirer du parcours un répertoire QUI N'EN CONTIENT AUCUNE était donc
 * silencieux. Mesuré (revue de TCK-378) : `if (entree === 'node_modules' || entree ===
 * 'components') continue;` fait tomber le périmètre de 1110 à 517 fichiers — 53 % du dépôt
 * disparaît — et la garde sort en 0. Avec un `forbidden()` RÉELLEMENT planté dans
 * `src/components/pipeline/`, elle sort toujours en 0.
 *
 * *Un périmètre ne se garde pas par une liste de répertoires : il se garde en le recoupant.*
 * `git ls-files` fournit une énumération qui n'emprunte AUCUN code de ce script — pas la même
 * boucle, pas le même filtre, pas le même `continue`. Tout fichier suivi, présent sur le
 * disque et de bonne extension doit se retrouver dans l'ensemble parcouru. Une exclusion de
 * répertoire, à N'IMPORTE quelle profondeur, devient alors rouge et NOMMÉE.
 *
 * Les non-suivis (fichier neuf pas encore ajouté) ne sont pas dans la référence : ils sont
 * analysés sans être exigés. Le contrôle ne peut donc pas rougir à tort sur un arbre en cours
 * d'édition — il ne sait que dire « il en manque », jamais « il y en a trop ».
 * ──────────────────────────────────────────────────────────────────────────────────────────── */
const PLANCHER_SUIVIS = 900;

/**
 * La comparaison du recoupement, extraite en fonction PURE pour la même raison que les quatre
 * décisions : mutation de mon cru, échappée au premier essai — réécrite en
 * `[...ensemble].filter((f) => !ensemble.has(f))`, elle rendait toujours `[]`, et l'exclusion
 * de `components` repassait au vert. Écrite ici, elle est jouable sur des entrées synthétiques.
 *
 * ⚠ Ce qui reste hors de portée, comme pour les autres : SUPPRIMER l'appel du flot principal.
 * Aucun script ne se prémunit de sa propre amputation, et c'est la revue qui garde ça.
 */
function manquantsDuPerimetre(suivis, ensemble) {
  return suivis.filter((f) => !ensemble.has(f));
}

const EPREUVES_PERIMETRE = [
  ['un fichier suivi hors du parcours → nommé', () => manquantsDuPerimetre(['a', 'b'], new Set(['a'])), ['b']],
  ['tout est parcouru → rien', () => manquantsDuPerimetre(['a', 'b'], new Set(['a', 'b'])), []],
  ['un fichier parcouru mais non suivi → rien (arbre en cours d’édition)', () => manquantsDuPerimetre(['a'], new Set(['a', 'neuf'])), []],
  ['référence vide → rien à exiger', () => manquantsDuPerimetre([], new Set(['a'])), []],
  ['tout manque → tout est nommé', () => manquantsDuPerimetre(['a', 'b'], new Set()), ['a', 'b']],
];

function fichiersSuivis() {
  const sous = relative(ROOT, SRC).split(sep).join('/');
  let sortie;
  try {
    sortie = execFileSync('git', ['ls-files', '-z', '--', sous], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null; // pas un dépôt git, ou git absent : le contrôle le dira lui-même
  }
  return sortie
    .split('\0')
    .filter(Boolean)
    .filter((rel) => EXTENSIONS.test(rel) && !rel.includes('/node_modules/'))
    .map((rel) => join(ROOT, rel))
    .filter((abs) => existsSync(abs));
}

function fichiers(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules') continue;
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) { fichiers(chemin, acc); continue; }
    // Aucune exclusion de répertoire, ni de `__tests__`. Le périmètre est l'écran, pas le dossier.
    if (EXTENSIONS.test(entree)) acc.push(chemin);
  }
  return acc;
}

const relWeb = (p) => relative(WEB, p).split(sep).join('/');

/**
 * C — la LECTURE du drapeau, séparée en deux : une fonction PURE qui décide, et un accès au
 * disque qui n'a pas le droit d'être muet.
 *
 * Trouvé en mutant cette garde (revue de TCK-378) : `drapeauActif()` lisait `next.config.ts`
 * lui-même, et RIEN ne l'éprouvait — les 34 `EPREUVES` ne passent que par `analyser()`, les
 * `EPREUVES_DECISION` par `evaluerDrapeau()` sur des entrées déjà décidées. Deux mutations d'un
 * seul mot éteignaient donc le contrôle C entier en silence :
 *
 *   · `\bauthInterrupts` → `\bauthInterruptsZZZ`  → exit 0, drapeau réellement actif ignoré
 *   · `CONFIG` → `next.config.mjs`                → exit 0, `{present:false}` muet
 *
 * La première est fermée par `EPREUVES_CONFIG`, jouée à chaque invocation sur des fragments
 * synthétiques ; la seconde par l'échec bruyant ci-dessous. *Une garde qui ne trouve pas le
 * fichier qu'elle surveille n'a pas le droit de conclure.*
 */
function drapeauActif(source) {
  const src = neutraliser(source, { chaines: false });
  const m = src.match(/\bauthInterrupts\s*:\s*([A-Za-z0-9_.]+)/);
  if (!m) return { present: false };
  return { present: m[1] !== 'false', valeur: m[1] };
}

function lireConfig() {
  if (!existsSync(CONFIG)) return null;
  return readFileSync(CONFIG, 'utf8');
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * LES DÉCISIONS — quatre fonctions PURES, chacune éprouvée par `EPREUVES_DECISION`
 *
 * Elles sont extraites du flot principal pour une raison précise, trouvée en mutant cette garde :
 * tant que le verdict s'écrivait en `if (…) { echecs.push(…) }` au fil du script, remplacer la
 * condition par `if (false)` **ne faisait rougir personne**. Une condition écrite dans une
 * fonction pure, elle, est jouable sur des entrées synthétiques à chaque invocation.
 *
 * ⚠ Ce qui reste hors de portée, et qu'il faut savoir : SUPPRIMER l'appel
 * `echecs.push(...evaluerX(…))` du flot principal. Aucun script ne peut se prémunir de sa propre
 * amputation ; c'est une ligne entière qui disparaît d'un diff, pas un caractère de regex qui
 * change. C'est la revue qui garde ça, et c'est le partage assumé du travail.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** A+B — les usages d'interruption, jugés à la lumière du drapeau. */
function evaluerInterruptions(violations, drapeau) {
  if (drapeau.present || violations.length === 0) return [];
  return [
    `INTERRUPTIONS — ${violations.length} usage(s) de forbidden()/unauthorized() alors que `
    + '`experimental.authInterrupts` est absent de `next.config.ts` :\n'
    + violations.map((v) => `    · ${v.fichier}:${v.ligne} [${v.genre}] ${v.extrait}`).join('\n')
    + '\n'
    + '\n    Sans le drapeau, `forbidden()` ne rend pas un 403 : il LÈVE `E488`, la frontière'
    + '\n    `(dashboard)/error.tsx` l’attrape, et l’utilisateur non autorisé voit un écran de'
    + '\n    panne générique avec un bouton « réessayer » qui relèvera la même erreur.'
    + '\n'
    + '\n    → Écrivez le refus comme TCK-167 l’a décidé : une REDIRECTION serveur, via'
    + '\n      `assertCanReachAgentArea` / `assertCanReachAgencyStaffArea` de'
    + '\n      `takussan-web/src/lib/auth/guards.ts`. Activer le drapeau n’est pas l’issue :'
    + '\n      c’est l’AC3 de TCK-167, reconduite par TCK-378.',
  ];
}

/** C — le drapeau lui-même, et ses frontières manquantes. */
function evaluerDrapeau(drapeau, chemins) {
  if (!drapeau.present) return [];
  const messages = [
    `DRAPEAU — \`experimental.authInterrupts: ${drapeau.valeur}\` est présent dans next.config.ts.\n`
    + '    La décision de ce dépôt est de NE PAS l’activer (AC3 de TCK-167, reconduite par TCK-378) :\n'
    + '    le refus passe par une redirection, pas par un drapeau expérimental. Si cette décision est\n'
    + '    rouverte, elle s’écrit en ADR et ce bloc se réécrit avec elle.',
  ];
  const frontieres = chemins.filter((f) => /(^|\/)(forbidden|unauthorized)\.tsx?$/.test(f));
  if (frontieres.length === 0) {
    messages.push(
      'DRAPEAU — le drapeau est actif et AUCUN fichier de frontière `forbidden.tsx` /\n'
      + '    `unauthorized.tsx` n’existe sous `src/app`. L’interruption retomberait alors sur la\n'
      + '    frontière d’ERREUR — exactement le défaut que TCK-378 corrige, mais en plus discret.',
    );
  }
  return messages;
}

/** D — la comparaison du cliquet, dans les DEUX sens. */
function comparerCliquet(actuels, inventaire) {
  return {
    nouveaux: actuels.filter((f) => !inventaire.includes(f)),
    perimes: inventaire.filter((f) => !actuels.includes(f)),
  };
}

/** D — le verdict du cliquet. */
function evaluerCliquet(nouveaux, perimes, plafond = REFUS_ARTISANAL.length) {
  const messages = [];
  if (nouveaux.length > 0) {
    messages.push(
      `CLIQUET — ${nouveaux.length} écran(s) de plus décident d’un refus sur le rôle sans passer par\n`
      + `    \`src/lib/auth/guards.ts\` (plafond : ${plafond}) :\n`
      + nouveaux.map((f) => `    · ${f}`).join('\n')
      + '\n\n    C’est de cette population qu’est sorti chacun des trois `forbidden()` de TCK-378 :'
      + '\n    chaque écran réinvente son terminateur, et un jour l’un d’eux réinvente le mauvais.'
      + '\n    → Passez par les gardes partagées, ou nommez le fichier dans `REFUS_ARTISANAL` ET'
      + '\n      remontez `PLAFOND_MESURE` d’autant, en disant pourquoi dans le message de commit.',
    );
  }
  if (perimes.length > 0) {
    messages.push(
      `CLIQUET — ${perimes.length} entrée(s) PÉRIMÉE(S) dans \`REFUS_ARTISANAL\` :\n`
      + perimes.map((f) => `    · ${f}`).join('\n')
      + '\n\n    Ce n’est pas une régression, c’est un progrès que l’inventaire doit enregistrer :'
      + '\n    retirez ces lignes de `scripts/check-auth-interrupts.mjs` (et baissez `PLAFOND_MESURE`),'
      + '\n    le cliquet descend d’autant. Un plafond qu’on ne redescend jamais finit par autoriser'
      + '\n    gratuitement le prochain écart.',
    );
  }
  return messages;
}

/**
 * Les épreuves du LECTEUR DE CONFIGURATION — ce qui manquait au contrôle C.
 *
 * `drapeauActif()` lisait `next.config.ts` lui-même et n'était traversée par AUCUNE épreuve :
 * les 34 `EPREUVES` passent par `analyser()`, les `EPREUVES_DECISION` par `evaluerDrapeau()`
 * sur des verdicts déjà pris. Muter un seul mot de sa regex sortait donc en 0, en silence,
 * drapeau réellement actif compris. *L'auto-épreuve d'une garde doit couvrir sa CONFIGURATION,
 * pas seulement ses expressions régulières.*
 *
 * Chaque entrée est un triplet `[nom, fragment de config, attendu]`.
 */
const EPREUVES_CONFIG = [
  ['drapeau activé', 'export default { experimental: { authInterrupts: true } };', { present: true, valeur: 'true' }],
  ['drapeau activé, sans espaces', 'const c={experimental:{authInterrupts:true}};', { present: true, valeur: 'true' }],
  ['drapeau explicitement à false', 'export default { experimental: { authInterrupts: false } };', { present: false, valeur: 'false' }],
  ['drapeau par une variable', 'export default { experimental: { authInterrupts: ACTIF } };', { present: true, valeur: 'ACTIF' }],
  ['drapeau absent', "export default { images: { remotePatterns: [] } };", { present: false }],
  ['drapeau EN COMMENTAIRE — ne compte pas', '// experimental: { authInterrupts: true }\nexport default {};', { present: false }],
  ['drapeau dans un docblock — ne compte pas', '/**\n * authInterrupts: true\n */\nexport default {};', { present: false }],
  ['config réelle du dépôt — le drapeau y est absent', null, { present: false }],
  // Le ROND-TRIP : la config RÉELLE, avec le drapeau injecté, doit être vue comme active.
  // C'est ce qui empêche de vider le lecteur (`lireConfig()` qui rendrait `''` passerait toutes
  // les épreuves ci-dessus, puisqu'elles n'attendent qu'un `present: false`) — et c'est aussi
  // ce qui prouve que la source réellement lue traverse bien la regex du contrôle C.
  ['config réelle + drapeau injecté → détecté', (r) => `${r}\nconst zz = { experimental: { authInterrupts: true } };`, { present: true, valeur: 'true' }],
];

/**
 * Les épreuves du détecteur de DÉCISION SUR LE RÔLE — le cœur du cliquet D.
 *
 * Chaque entrée est un triplet `[nom, source, attendu]`, jouée sur les prédicats réellement
 * lus dans `src/lib/roles.ts` : c'est le chemin de production, pas une imitation.
 */
const EPREUVES_ROLE = [
  ['prédicat de `@/lib/roles`', 'if (!isAgent(user.roles)) redirect("/app");', true],
  ['prédicat composé', 'const ok = isAgencyAdmin(r) || isSuperAdmin(r);', true],
  ['décision EN LIGNE — la forme la plus artisanale', "const a = user.roles.includes('agency_admin');", true],
  ['décision en ligne, chaînage optionnel', "if (user.roles?.some((r) => r === 'agent')) {}", true],
  ['décision en ligne par indexOf', "if (roles.indexOf('owner') !== -1) {}", true],
  ['décision par le profil actif', "const p = activeProfile?.type;", true],
  ['délégation à `guards.ts` — PAS une décision du fichier', 'assertCanReachAgentArea(user.roles);', false],
  ['aucun rôle en jeu', 'const t = await getTranslations("customers"); redirect("/app");', false],
  ['homonyme préfixé — `isAgentLike` n’est pas `isAgent`', 'if (isAgentLike(r)) {}', false],
  ['membre homonyme — `x.isAgent(` est qualifié', 'if (svc.isAgent(r)) {}', false],
];

/**
 * Les épreuves des DÉCISIONS — jouées elles aussi à chaque invocation.
 *
 * Chacune est un triplet `[nom, () => messages, nombre attendu]`.
 */
const EPREUVES_DECISION = [
  ['interruption sans drapeau → rouge', () => evaluerInterruptions([{ fichier: 'a', ligne: 1, genre: 'appel', extrait: 'forbidden()' }], { present: false }), 1],
  ['interruption AVEC drapeau → tolérée', () => evaluerInterruptions([{ fichier: 'a', ligne: 1, genre: 'appel', extrait: 'forbidden()' }], { present: true, valeur: 'true' }), 0],
  ['aucune interruption → rien', () => evaluerInterruptions([], { present: false }), 0],
  ['drapeau absent → rien', () => evaluerDrapeau({ present: false }, []), 0],
  ['drapeau présent SANS frontière → 2 messages', () => evaluerDrapeau({ present: true, valeur: 'true' }, ['src/app/page.tsx']), 2],
  ['drapeau présent AVEC frontière → 1 message', () => evaluerDrapeau({ present: true, valeur: 'true' }, ['src/app/forbidden.tsx']), 1],
  ['cliquet : un écran de plus → rouge', () => evaluerCliquet(...Object.values(comparerCliquet(['a', 'b'], ['a'])), 1), 1],
  ['cliquet : une entrée périmée → rouge', () => evaluerCliquet(...Object.values(comparerCliquet(['a'], ['a', 'b'])), 2), 1],
  ['cliquet : inventaire exact → rien', () => evaluerCliquet(...Object.values(comparerCliquet(['a', 'b'], ['b', 'a'])), 2), 0],
  ['cliquet : les deux à la fois → 2 messages', () => evaluerCliquet(...Object.values(comparerCliquet(['a', 'c'], ['a', 'b'])), 2), 2],
];

/** Le cliquet D — refus décidé sur le rôle, terminé à la main, hors `lib/auth/guards`. */
const TERMINATEURS = new RegExp(`\\b(?:redirect|notFound|${INTERRUPTIONS.join('|')})\\s*\\(`);

/**
 * La seconde moitié du cliquet D : le REFUS est-il terminé dans ce fichier ?
 *
 * Pure, donc jouable — et il fallait qu'elle le soit. Mutation de mon cru, échappée au premier
 * essai : retirer `notFound` de l'alternance sortait en **0**. Aucune épreuve ne traversait
 * `TERMINATEURS`, et aucune entrée de l'inventaire ne dépendait de ce terminateur-là ; un écran
 * qui refuse par `notFound()` serait donc devenu invisible sans un mot. *Un détecteur qu'aucune
 * épreuve n'atteint est un détecteur qu'on peut casser en silence* — la règle était déjà écrite
 * dans ce fichier, pour les GENRES ; elle ne l'était pas pour les terminateurs.
 */
function termineLeRefus(source) {
  return TERMINATEURS.test(source);
}

const EPREUVES_TERMINATEUR = [
  ['redirect', "if (!ok) redirect('/app');", true],
  ['notFound', 'if (!ok) notFound();', true],
  ['forbidden', 'if (!ok) forbidden();', true],
  ['unauthorized', 'if (!ok) unauthorized();', true],
  ['espace avant la parenthèse', "redirect ('/app');", true],
  ['aucun terminateur', 'return <div />;', false],
  ['préfixe — `redirectTo` n’est pas `redirect`', "const u = redirectTo('/app');", false],
];

/**
 * Les écritures par lesquelles un écran DÉCIDE lui-même du rôle.
 *
 * Trouvé en mutant cette garde (revue de TCK-378) : le cliquet ne comptait un écran que s'il
 * IMPORTAIT `@/lib/roles`. Deux formes lui échappaient, et ce sont les deux plus probables :
 *
 *   · la décision écrite EN LIGNE, sans prédicat —
 *     `user.roles.includes('agency_admin') || user.roles.includes('super_admin')`.
 *     Ce n'était pas hypothétique : `src/app/(dashboard)/app/settings/agency/upgrade/page.tsx`
 *     l'écrivait DÉJÀ, et l'inventaire disait 21 quand la population réelle était 22. La forme
 *     la plus artisanale de toutes était la seule invisible.
 *   · l'écran qui importe `guards.ts` pour une branche et bricole l'AUTRE à la main : l'ancienne
 *     exclusion blanchissait le fichier entier sur la seule présence de l'import.
 *
 * D'où le renversement : ce n'est plus l'IMPORT qui compte, c'est la DÉCISION écrite dans le
 * fichier. Déléguer à `assertCanReachAgentArea(user.roles)` n'en est pas une — aucun prédicat,
 * aucun `.includes` — et un écran qui délègue tout continue donc de ne pas compter.
 *
 * Les prédicats ne sont pas recopiés : ils sont LUS dans `src/lib/roles.ts`. Une liste recopiée
 * serait juste le jour où on l'écrit, et le neuvième prédicat serait invisible. Un plancher
 * garde la lecture : si l'extraction rend moins que `PLANCHER_PREDICATS`, le fichier a été
 * renommé ou réécrit, et la garde le dit au lieu de compter zéro décision.
 */
const ROLES_TS = join(SRC, 'lib', 'roles.ts');
const PLANCHER_PREDICATS = 8;

function predicatsDeRole() {
  if (!existsSync(ROLES_TS)) return [];
  const src = neutraliser(readFileSync(ROLES_TS, 'utf8'), { chaines: false });
  return [...src.matchAll(/\bexport\s+function\s+(is[A-Z][\w$]*)\s*\(/g)].map((m) => m[1]);
}

/**
 * Construit le détecteur de décision-sur-le-rôle. Pur : il prend ses prédicats en argument,
 * ce qui le rend jouable sur des entrées synthétiques (`EPREUVES_ROLE`).
 */
function decideDuRole(source, predicats) {
  if (predicats.length > 0
    && new RegExp(`(?<![.\\w$])(?:${predicats.join('|')})\\s*\\(`).test(source)) return true;
  // `roles.includes('agent')`, `user.roles?.some(…)`, `roles.indexOf(…)` — la décision nue.
  if (/\broles\s*\)?\s*[?]?\.\s*(?:includes|some|indexOf|find|filter)\s*\(/.test(source)) return true;
  // `request.activeProfile()` / `activeProfile?.type === 'agent'` — l'autre écriture du rôle.
  if (/\bactiveProfile\b/.test(source)) return true;
  return false;
}

function refusArtisanal(chemins, predicats) {
  const trouves = [];
  for (const chemin of chemins) {
    const rel = relWeb(chemin);
    if (!rel.startsWith('src/app/(dashboard)/')) continue;
    const brut = readFileSync(chemin, 'utf8');
    const sansRien = neutraliser(brut, { chaines: true });
    if (!decideDuRole(sansRien, predicats)) continue;
    if (!termineLeRefus(sansRien)) continue;
    trouves.push(rel);
  }
  return trouves.sort();
}

/* ══════════════════════════════════════════════════════════════════════════════════════════ */
const echecs = [];

// 1 · les épreuves, AVANT tout. Une garde qui ne sait plus reconnaître ce qu'elle cherche n'a
//     pas le droit de certifier un dépôt vert.
const ratees = jouerLesEpreuves();
if (ratees.length > 0) {
  console.error(`\n✗ LA GARDE ELLE-MÊME EST CASSÉE — ${ratees.length}/${EPREUVES.length} épreuve(s) ratée(s).\n`);
  for (const r of ratees) {
    console.error(`  · « ${r.nom} » : attendu ${r.attendu}, obtenu ${r.obtenu}`);
    console.error(`      ${JSON.stringify(r.source)}`);
  }
  console.error('\n  Le dépôt n’a PAS été analysé : le verdict aurait été sans valeur.\n');
  process.exit(1);
}

// 2 · le périmètre
if (!existsSync(SRC)) {
  console.error(`✗ ${relative(ROOT, SRC)} est introuvable — la garde n’a rien pu lire.`);
  process.exit(1);
}
const tous = fichiers(SRC);
if (tous.length === 0) {
  console.error(`✗ aucun fichier lisible sous ${relative(ROOT, SRC)} — la garde n’aurait rien vérifié.`);
  process.exit(1);
}
const ensemble = new Set(tous.map(relWeb));

// Le RECOUPEMENT — une énumération qui n'emprunte aucun code de ce script (cf. § LE PÉRIMÈTRE).
const suivis = fichiersSuivis();
if (suivis === null) {
  echecs.push(
    'PÉRIMÈTRE — `git ls-files` n’a pas répondu : le périmètre n’a pas pu être RECOUPÉ.\n'
    + '    Les sentinelles seules ne voient pas l’exclusion d’un répertoire qui n’en contient\n'
    + '    aucune — mesuré : exclure `components` retire 53 % du dépôt sans un mot. Ce contrôle\n'
    + '    ne se contourne pas en silence : faites tourner cette garde dans le dépôt git.',
  );
} else if (suivis.length < PLANCHER_SUIVIS || suivis.length * 2 < tous.length) {
  // Deux planchers, et le second est DÉRIVÉ : mutation de mon cru, échappée au premier essai —
  // vider `fichiersSuivis()` ET abaisser `PLANCHER_SUIVIS` à 0 (deux lignes) repassait au vert.
  // La référence doit couvrir au moins la moitié de ce qui a été parcouru ; ce second plancher
  // se lit sur `tous.length`, donc il ne se neutralise pas en éditant une constante.
  echecs.push(
    `PÉRIMÈTRE — \`git ls-files\` ne rend que ${suivis.length} fichier(s) sous ${relWeb(SRC)}, `
    + `pour ${tous.length} parcourus (planchers : ${PLANCHER_SUIVIS} absolu, `
    + `${Math.ceil(tous.length / 2)} dérivé).\n`
    + '    Une référence vide ou tronquée valide n’importe quel parcours : la comparaison\n'
    + '    n’aurait rien gardé.',
  );
} else {
  const manquants = manquantsDuPerimetre(suivis.map(relWeb), ensemble);
  if (manquants.length > 0) {
    echecs.push(
      `PÉRIMÈTRE — ${manquants.length} fichier(s) suivi(s) par git sont ABSENTS du parcours de\n`
      + `    cette garde (${tous.length} parcourus, ${suivis.length} suivis) :\n`
      + manquants.slice(0, 12).map((f) => `    · ${f}`).join('\n')
      + (manquants.length > 12 ? `\n    … et ${manquants.length - 12} autre(s)` : '')
      + '\n\n    C’est la signature d’un répertoire retiré du parcours. Les sentinelles ne le'
      + '\n    voient pas quand aucune n’y vit ; ce recoupement, si.',
    );
  }
}

const absentes = SENTINELLES.filter((s) => !ensemble.has(s));
if (absentes.length > 0) {
  echecs.push(
    `PÉRIMÈTRE — ${absentes.length} sentinelle(s) hors de l’ensemble parcouru :\n`
    + absentes.map((s) => `    · ${s}`).join('\n')
    + '\n    Un fichier déplacé ou un répertoire exclu rend la garde muette sans la rendre rouge.'
    + '\n    Corrigez `SENTINELLES` dans ce script — en sachant ce que vous retirez de la surveillance.',
  );
}

// 3 · A et B, sur tout `src`
const sourceConfig = lireConfig();
if (sourceConfig === null) {
  echecs.push(
    `DRAPEAU — \`${relWeb(CONFIG)}\` est INTROUVABLE : le contrôle C n’a rien lu.\n`
    + '    Une garde qui ne trouve pas le fichier qu’elle surveille n’a pas le droit de conclure —\n'
    + '    elle concluait « drapeau absent », ce qui est le verdict rassurant. Si la configuration\n'
    + '    a été renommée, corrigez `CONFIG` dans ce script.',
  );
}
const drapeau = drapeauActif(sourceConfig ?? '');
const violations = [];
// AUCUNE exemption, et c'est vérifié : `analysees` compte les fichiers réellement passés dans
// `analyser()`, et doit valoir `tous.length`.
//
// Trouvé en mutant cette garde : un `if (rel === '…') continue;` glissé ici — la forme que prend
// toujours une exemption, « ce fichier-là est un cas particulier » — ne changeait RIEN à la
// sortie. `src/lib/auth/guards.ts` est le candidat évident : il nomme `forbidden` dans son
// docblock. Il n'en a pas besoin, les commentaires étant neutralisés, et il est analysé comme
// les 964 autres.
//
// ⚠ Le marquage est la DERNIÈRE instruction du corps, et c'est le point. Tant qu'il était en
// tête, la même exemption glissée UNE LIGNE PLUS BAS — juste après l'incrément — sortait en 0 :
// le compteur valait toujours 1110. *Un seul déplacement de ligne séparait le rouge du vert.*
// Placé en dernier, un `continue` posé n'importe où dans le corps saute le marquage, et le seul
// endroit où il ne le sauterait pas est la fin du corps, où il ne fait rien.
//
// C'est aussi un ENSEMBLE et non un compteur : un `+= 1` peut être gonflé, une clé déjà vue ne
// s'ajoute pas deux fois.
const analysees = new Set();
for (const chemin of tous) {
  const rel = relWeb(chemin);
  const { constats } = analyser(readFileSync(chemin, 'utf8'));
  for (const c of constats) violations.push({ fichier: rel, ...c });
  analysees.add(rel);
}
if (analysees.size !== tous.length) {
  echecs.push(
    `EXEMPTION — ${tous.length - analysees.size} fichier(s) ont été ÉCARTÉS de l'analyse sur `
    + `${tous.length} parcourus.\n`
    + '    Cette garde n’a pas d’exemption, et ne doit pas en acquérir en silence. Si l’une devient\n'
    + '    nécessaire, elle se nomme, se date et se justifie — et elle doit rougir le jour où elle\n'
    + '    ne sert plus, comme les entrées de `REFUS_ARTISANAL`.',
  );
}

echecs.push(...evaluerInterruptions(violations, drapeau));

// 4 · C — cohérence du drapeau
echecs.push(...evaluerDrapeau(drapeau, tous.map(relWeb)));

// 5 · D — le cliquet
const artisanaux = refusArtisanal(tous, predicatsDeRole());
const { nouveaux, perimes } = comparerCliquet(artisanaux, REFUS_ARTISANAL);
echecs.push(...evaluerCliquet(nouveaux, perimes));

/* ── Rapport ─────────────────────────────────────────────────────────────────────────────── */
if (REPORT) {
  console.log(`interruptions d’autorisation — ${tous.length} fichiers lus sous ${relWeb(SRC)}\n`);
  console.log(`  épreuves de la garde   : ${EPREUVES.length} formes + ${EPREUVES_DECISION.length} décisions + ${EPREUVES_CONFIG.length} configs + ${EPREUVES_ROLE.length} rôles + ${EPREUVES_TERMINATEUR.length} terminateurs + ${EPREUVES_PERIMETRE.length} périmètres, toutes passées`);
  console.log(`  fichiers analysés      : ${analysees.size}/${tous.length} (aucune exemption)`);
  console.log(`  périmètre recoupé      : ${suivis === null ? 'git indisponible' : `${suivis.length} fichiers suivis par git, tous parcourus`}`);
  console.log(`  prédicats de rôle lus  : ${predicatsDeRole().join(', ')}`);
  console.log(`  sentinelles présentes  : ${SENTINELLES.length - absentes.length}/${SENTINELLES.length}`);
  console.log(`  drapeau authInterrupts : ${drapeau.present ? `PRÉSENT (${drapeau.valeur})` : 'absent'}`);
  console.log(`  A+B · usages forbidden()/unauthorized() : ${violations.length}`);
  for (const v of violations) console.log(`      ✗ ${v.fichier}:${v.ligne} [${v.genre}] ${v.extrait}`);
  console.log(`  D · refus artisanaux : ${artisanaux.length} (plafond ${REFUS_ARTISANAL.length})`);
  for (const f of artisanaux) console.log(`      · ${f}${REFUS_ARTISANAL.includes(f) ? '' : '   ← NOUVEAU'}`);
  for (const f of perimes) console.log(`      · ${f}   ← PÉRIMÉ, à retirer de l’inventaire`);
  console.log();
}

if (echecs.length === 0) {
  console.log(
    `✓ interruptions d’autorisation : 0 usage de forbidden()/unauthorized() sur ${tous.length} `
    + `fichiers de ${relWeb(SRC)}, drapeau \`experimental.authInterrupts\` absent, `
    + `${artisanaux.length} refus artisanaux (plafond ${REFUS_ARTISANAL.length}).`,
  );
  console.log(
    `  Garde auto-éprouvée : ${EPREUVES.length} formes + ${EPREUVES_DECISION.length} décisions `
    + `+ ${EPREUVES_CONFIG.length} configs + ${EPREUVES_ROLE.length} rôles `
    + `+ ${EPREUVES_TERMINATEUR.length} terminateurs + ${EPREUVES_PERIMETRE.length} périmètres jouées, `
    + `${SENTINELLES.length} sentinelles trouvées, ${analysees.size}/${tous.length} fichiers analysés sans exemption,`
    + ` périmètre recoupé par git.`,
  );
  console.log('  PORTÉE — A et B sont EXACTS pour les formes énumérées dans `EPREUVES` : un import');
  console.log('  ou un appel se lit dans le texte, il ne se calcule pas. Ce qu’un vert ici ne dit');
  console.log('  PAS : que chaque page garde bien son accès — seulement qu’aucune ne le refuse par');
  console.log('  une interruption désarmée. Le cliquet D borne la population où le défaut renaît,');
  console.log('  il ne la corrige pas. Les limites connues sont en tête de ce script.');
  process.exit(0);
}

console.error(`\n✗ ${echecs.length} écart(s) — scripts/check-auth-interrupts.mjs\n`);
for (const e of echecs) console.error(`  · ${e}\n`);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
