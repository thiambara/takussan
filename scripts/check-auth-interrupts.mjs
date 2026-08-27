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
 * Cette garde s'auto-éprouve donc **à chaque invocation**, sur six plans. Les comptes ci-dessous
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
 *   3. `SENTINELLES` — quatre chemins qui DOIVENT figurer dans l'ensemble parcouru. Retirer un
 *      répertoire du périmètre, ou déplacer une de ces pages sans le dire, fait parler la garde
 *      au lieu de la rendre muette. *Un grep qui ne trouve plus rien et un grep qui ne cherche
 *      plus rien rendent la même sortie.*
 *   4. `PLANCHERS` — une taille minimale pour chacune des listes ci-dessus. Vider `SENTINELLES`
 *      la rendait muette **sans la rendre rouge** : le filtre des absentes d'une liste vide est
 *      vide. Une liste d'épreuves qu'on peut vider n'est pas une épreuve.
 *   5. `PLAFOND_MESURE` — le compte de `REFUS_ARTISANAL`, redit à part. Allonger l'inventaire
 *      d'une ligne remontait le plafond sans un mot ; il faut désormais deux lignes et un
 *      argument.
 *   6. **Aucune exemption, et c'est compté.** `analysees` doit valoir le nombre de fichiers
 *      parcourus. Un `if (…) continue;` glissé dans la boucle — la forme que prend toujours une
 *      exemption — fait rougir la garde.
 *
 * Les six points ci-dessus n'ont pas été imaginés : ils sont les cinq trous trouvés en MUTANT
 * cette garde, plus celui qu'on savait devoir couvrir. 21 mutations de son propre code,
 * 21 attrapées.
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
 *     été mis à l'épreuve : 21 mutations du code de cette garde, 21 attrapées (2026-08-27).
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
 * sont passées par le helper).
 *
 * ⚠ Cette liste n'est PAS une liste d'exceptions tolérées : c'est un plafond. Ces 21 écrans
 * écrivent chacun leur propre `redirect('/app…')` à la main, ce qui est correct aujourd'hui et
 * fragile demain — c'est de cette population qu'est sorti chacun des trois `forbidden()`.
 * TCK-378 ne les convertit pas (hors périmètre), il en interdit le vingt-deuxième.
 *
 * Si vous ajoutez une ligne ici, vous remontez un plafond : dites pourquoi dans le message de
 * commit. Si la garde vous dit qu'une ligne est PÉRIMÉE, ce n'est pas une régression — c'est un
 * progrès que l'inventaire doit enregistrer : retirez la ligne, le cliquet descend.
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
  'src/app/(dashboard)/app/maintenance/providers/page.tsx',
  'src/app/(dashboard)/app/overview/agency/page.tsx',
  'src/app/(dashboard)/app/overview/agent/page.tsx',
  'src/app/(dashboard)/app/overview/alerts/page.tsx',
  'src/app/(dashboard)/app/overview/exports/page.tsx',
  'src/app/(dashboard)/app/overview/kpis/page.tsx',
  'src/app/(dashboard)/app/overview/owner/page.tsx',
  'src/app/(dashboard)/app/overview/page.tsx',
  'src/app/(dashboard)/app/owners/page.tsx',
];

/**
 * Le plafond MESURÉ le 2026-08-27, écrit à part de la liste.
 *
 * Trouvé en mutant cette garde : allonger `REFUS_ARTISANAL` d'une ligne remontait le plafond
 * sans un mot. Le chiffre est donc redit ici, et l'écart entre les deux fait échouer la garde :
 * *remonter un plafond doit coûter deux lignes et un argument, pas une.*
 */
const PLAFOND_MESURE = 21;

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
const PLANCHERS = { EPREUVES: 34, SENTINELLES: 4, GENRES: 7 };

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

/* ──────────────────────────────────────────────────────────────────────────────────────────── */
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

function drapeauActif() {
  if (!existsSync(CONFIG)) return { present: false, absent: true };
  const src = neutraliser(readFileSync(CONFIG, 'utf8'), { chaines: false });
  const m = src.match(/\bauthInterrupts\s*:\s*([A-Za-z0-9_.]+)/);
  if (!m) return { present: false, absent: false };
  return { present: m[1] !== 'false', valeur: m[1], absent: false };
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
function refusArtisanal(chemins) {
  const trouves = [];
  for (const chemin of chemins) {
    const rel = relWeb(chemin);
    if (!rel.startsWith('src/app/(dashboard)/')) continue;
    const brut = readFileSync(chemin, 'utf8');
    const src = neutraliser(brut, { chaines: false });
    if (!/from\s*['"]@\/lib\/roles['"]/.test(src)) continue;
    if (/from\s*['"]@\/lib\/auth\/guards['"]/.test(src)) continue;
    if (!TERMINATEURS.test(neutraliser(brut, { chaines: true }))) continue;
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
const drapeau = drapeauActif();
const violations = [];
// AUCUNE exemption, et c'est vérifié : `analysees` compte les fichiers réellement passés dans
// `analyser()`, et doit valoir `tous.length`.
//
// Trouvé en mutant cette garde : un `if (rel === '…') continue;` glissé ici — la forme que prend
// toujours une exemption, « ce fichier-là est un cas particulier » — ne changeait RIEN à la
// sortie. `src/lib/auth/guards.ts` est le candidat évident : il nomme `forbidden` dans son
// docblock. Il n'en a pas besoin, les commentaires étant neutralisés, et il est analysé comme
// les 964 autres.
let analysees = 0;
for (const chemin of tous) {
  const rel = relWeb(chemin);
  const { constats } = analyser(readFileSync(chemin, 'utf8'));
  analysees += 1;
  for (const c of constats) violations.push({ fichier: rel, ...c });
}
if (analysees !== tous.length) {
  echecs.push(
    `EXEMPTION — ${tous.length - analysees} fichier(s) ont été ÉCARTÉS de l'analyse sur `
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
const artisanaux = refusArtisanal(tous);
const { nouveaux, perimes } = comparerCliquet(artisanaux, REFUS_ARTISANAL);
echecs.push(...evaluerCliquet(nouveaux, perimes));

/* ── Rapport ─────────────────────────────────────────────────────────────────────────────── */
if (REPORT) {
  console.log(`interruptions d’autorisation — ${tous.length} fichiers lus sous ${relWeb(SRC)}\n`);
  console.log(`  épreuves de la garde   : ${EPREUVES.length} formes + ${EPREUVES_DECISION.length} décisions, toutes passées`);
  console.log(`  fichiers analysés      : ${analysees}/${tous.length} (aucune exemption)`);
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
    `  Garde auto-éprouvée : ${EPREUVES.length} formes + ${EPREUVES_DECISION.length} décisions jouées, `
    + `${SENTINELLES.length} sentinelles trouvées, ${analysees}/${tous.length} fichiers analysés sans exemption.`,
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
