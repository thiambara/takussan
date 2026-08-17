/**
 * Le SCANNER de texte affiché en dur — la moitié mesurante de `check-i18n.mjs`.
 *
 * Il vit dans son propre module pour une seule raison : **il doit être testable sur des fixtures**.
 * `src/i18n/__tests__/i18n-scan.test.ts` lui soumet un cas par règle et vérifie qu'il compte ce
 * qu'il prétend compter, et RIEN d'autre. Sans ce test, la garde peut devenir aveugle en silence —
 * une garde qui ne trouve plus rien et une garde qui n'a plus rien à trouver rendent exactement la
 * même sortie verte.
 *
 * Ce que ce module NE FAIT PAS : lire le disque, décider, sortir en 1. Il compte. La décision est
 * dans `check-i18n.mjs`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'IMPORTE PLUS `typescript` (TCK-323)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ce fichier employait l'API compilateur de TypeScript — `ts.createSourceFile` et 24 autres points
 * d'entrée. **`typescript@7` (le portage Go, en `dist-tag: latest`) ne les exporte plus côté Node** :
 * `typeof ts.ScriptTarget === 'undefined'`. Le jour où la mise à jour est passée, la garde i18n est
 * morte — 18 tests rouges — alors que `tsc --noEmit` et `next build` restaient verts tous les deux.
 * Une garde de CI a donc été mise à terre par la mise à jour d'un outil qui ne la concernait pas.
 *
 * Rebrancher sur un autre analyseur tiers aurait reproduit exactement la même exposition, un nom de
 * paquet plus loin. Le scanner est donc **autonome** : un lexeur TS/TSX écrit ici, sans dépendance,
 * qui n'a plus rien à casser en amont.
 *
 * ⚠ **Ce n'est PAS un analyseur syntaxique complet, et ce n'est pas un objectif.** Il ne construit
 * aucun arbre : il parcourt les caractères en tenant une pile de contextes (bloc, littéral d'objet,
 * type, appel, balise JSX, enfants JSX, gabarit) et décide **localement** de chaque littéral. Cela
 * suffit très exactement aux quatre catégories comptées, et rien de plus n'est promis.
 *
 * L'équivalence avec l'ancienne version n'est pas déduite du code, elle est **mesurée** : les deux
 * scanners ont été passés sur les 870 fichiers de `src/`, et leurs 3 542 occurrences coïncident
 * une à une — même fichier, même ligne, même catégorie, même extrait. C'est cette mesure, plus les
 * 21 cas de `i18n-scan.test.ts` inchangés, qui tient lieu de preuve.
 */

/**
 * Attributs JSX dont la valeur est LUE PAR UN HUMAIN. Whitelist assumée : elle rate ce qu'elle ne
 * connaît pas, ce qui est le bon sens de l'erreur pour un cliquet (rater, jamais inventer).
 */
export const ATTRS_AFFICHAGE = new Set([
  'placeholder', 'alt', 'title', 'label', 'description', 'emptyMessage', 'helperText',
  'tooltip', 'caption', 'heading', 'subtitle', 'hint', 'legend', 'summary',
  'confirmLabel', 'cancelLabel', 'submitLabel', 'actionLabel', 'emptyLabel', 'errorMessage',
]);

/** Attributs ARIA qui portent du texte lu par un lecteur d'écran (les autres portent des ids). */
export const ATTRS_ARIA = new Set([
  'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'aria-placeholder',
]);

/** Appels dont les arguments chaîne ne sont JAMAIS du texte affiché. */
const APPELS_TECHNIQUES = new Set([
  't', 'tCommon', 'useTranslations', 'getTranslations', 'cn', 'cva', 'clsx', 'twMerge',
  'require', 'import', 'setItem', 'getItem', 'removeItem', 'querySelector', 'getElementById',
  'addEventListener', 'removeEventListener', 'createElement', 'setAttribute', 'matchMedia',
]);

const ACCENT = /[àâäéèêëïîôöùûüÿçœæÀÂÄÉÈÊËÏÎÔÖÙÛÜŸÇŒÆ]/;
const MOT = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/;
/** Deux mots de 2+ lettres séparés par une espace — « Tableau de bord », « Mes réservations ». */
const PHRASE = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}\s+[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/;

/**
 * Reconnaît une chaîne de classes Tailwind. C'est la SEULE classe de faux positifs systématique
 * mesurée sur ce dépôt (33 occurrences sur 3 628, soit 0,9 %, concentrées dans `ui/badge.tsx`,
 * `ui/button.tsx`, `inventory/InventoryBadges.tsx`, `share/ShareButton.tsx` — toujours dans un
 * `cva()`, donc hors attribut `className`).
 */
export function ressembleATailwind(s) {
  if (ACCENT.test(s)) return false; // aucune classe Tailwind ne porte d'accent
  const jetons = s.trim().split(/\s+/).filter(Boolean);
  if (jetons.length === 0) return false;
  const tailwind = jetons.filter((j) =>
    // variantes (`hover:`, `dark:`), variantes arbitraires (`[&>svg]:`, `has-data-[…]:`) et
    // nommage de groupe (`group/badge`) — tout ce qui porte `:`, `[` ou `&` est de la syntaxe
    // Tailwind, jamais de la prose.
    /[:[\]&]/.test(j)
    || /^(?:group|peer)\//.test(j)
    || /^-?(?:flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|static|rounded|border|shadow|transition|duration|ease|cursor|gap|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|min|max|size|text|bg|font|items|justify|self|content|place|space|divide|overflow|z|opacity|ring|outline|leading|tracking|truncate|whitespace|select|pointer|animate|scale|rotate|translate|origin|object|aspect|col|row|order|basis|shrink|grow|list|underline|uppercase|lowercase|capitalize|antialiased|backdrop|blur|fill|stroke|inset|top|bottom|left|right|line)(?:-|$)/.test(j),
  );
  return tailwind.length >= Math.max(1, Math.ceil(jetons.length * 0.6));
}

// ── Le lexeur ───────────────────────────────────────────────────────────────────────────────────

/**
 * Mots-clés après lesquels une EXPRESSION est attendue. C'est ce qui distingue `a < b` (comparaison)
 * de `return <div>` (JSX), et `x / y` (division) de `split(/,/)` (littéral régulier) : après l'un de
 * ces mots, `<` ouvre du JSX et `/` ouvre une expression régulière.
 *
 * `this`, `super`, `true`, `false`, `null` et `undefined` en sont volontairement absents : ce sont
 * des VALEURS, et `this < x` est une comparaison.
 */
const MOTS_ATTENDANT_EXPRESSION = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do',
  'else', 'yield', 'await', 'as', 'satisfies', 'extends', 'implements', 'keyof', 'infer', 'is',
  'asserts', 'import', 'export', 'default', 'from', 'let', 'const', 'var', 'function', 'class',
  'interface', 'type', 'enum', 'declare', 'namespace', 'module', 'public', 'private', 'protected',
  'readonly', 'static', 'abstract', 'async', 'if', 'while', 'for', 'switch', 'try', 'catch',
  'finally', 'with',
]);

/** Jetons après lesquels un littéral est du TYPE et non une valeur (`x as 'a'`, `'a' | 'b'`). */
const AVANT_TYPE = new Set(['as', 'satisfies', 'keyof', 'extends', 'implements', 'is', '|', '&', '<']);

/** Ponctuations à plusieurs caractères, du plus long au plus court (l'ordre compte). */
const PONCTUATIONS = [
  '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
  '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=',
  '%=', '&=', '|=', '^=', '**', '<<', '>>',
];

const estDebutIdent = (c) => c !== undefined && /[A-Za-z_$¡-￿]/.test(c);
const estIdent = (c) => c !== undefined && /[A-Za-z0-9_$¡-￿]/.test(c);

/** Séquences d'échappement d'un littéral de chaîne ou de gabarit, telles que TypeScript les cuit. */
const ECHAPPEMENTS = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/**
 * Compte les occurrences de texte affiché en dur dans un fichier source.
 *
 * QUATRE catégories, et l'énoncé de chacune est ce que la garde peut défendre :
 *   `jsx`      — texte JSX nu portant un mot de 2+ lettres.
 *   `attribut` — attributs de `ATTRS_AFFICHAGE` initialisés par un littéral.
 *   `aria`     — attributs de `ATTRS_ARIA` initialisés par un littéral.
 *   `litteral` — littéraux de chaîne hors JSX portant un accent français OU une phrase de 2 mots.
 *
 * Rend `[{ ligne, categorie, extrait }]`, dans l'ordre du fichier. Les gabarits INTERPOLÉS
 * (`` `Bonjour ${n}` ``) ne sont pas comptés : le total est un PLANCHER, jamais un inventaire.
 */
export function compteFichier(chemin, source) {
  const s = source;
  const n = s.length;

  const debutsDeLigne = [0];
  for (let k = 0; k < n; k += 1) if (s.charCodeAt(k) === 10) debutsDeLigne.push(k + 1);
  const ligneDe = (pos) => {
    let bas = 0;
    let haut = debutsDeLigne.length - 1;
    while (bas < haut) {
      const milieu = (bas + haut + 1) >> 1;
      if (debutsDeLigne[milieu] <= pos) bas = milieu;
      else haut = milieu - 1;
    }
    return bas + 1;
  };

  const trouves = [];
  /** > 0 pendant un coup d'œil qu'on va rembobiner : sans quoi le texte serait compté deux fois. */
  let silence = 0;
  const pousse = (pos, categorie, extrait) => {
    if (silence > 0) return;
    trouves.push({
      ligne: ligneDe(pos),
      categorie,
      extrait: extrait.slice(0, 60).replace(/\s+/g, ' ').trim(),
    });
  };

  let i = 0;
  /** Dernier jeton significatif rencontré. `valeur` : une expression peut-elle se terminer ici ? */
  let prec = { t: '', valeur: false };
  const notePrec = (t, valeur) => { prec = { t, valeur }; };

  // ── Sauts et coups d'œil ──────────────────────────────────────────────────────────────────────

  /** Position du prochain caractère significatif à partir de `p` (blancs et commentaires sautés). */
  const sautBlancs = (p) => {
    let k = p;
    while (k < n) {
      const c = s[k];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'
        || c === ' ' || c === '﻿') { k += 1; continue; }
      if (c === '/' && s[k + 1] === '/') { while (k < n && s[k] !== '\n') k += 1; continue; }
      if (c === '/' && s[k + 1] === '*') {
        k += 2;
        while (k < n && !(s[k] === '*' && s[k + 1] === '/')) k += 1;
        k += 2;
        continue;
      }
      return k;
    }
    return n;
  };

  /** Le prochain jeton significatif, sous forme de texte (`','`, `'=>'`, `'as'`, `"'"` …). */
  const prochainJeton = (p) => {
    const k = sautBlancs(p);
    if (k >= n) return '';
    const c = s[k];
    if (estDebutIdent(c)) {
      let j = k;
      while (j < n && estIdent(s[j])) j += 1;
      return s.slice(k, j);
    }
    for (const op of PONCTUATIONS) if (s.startsWith(op, k)) return op;
    return c;
  };

  /** Y a-t-il un saut de ligne entre `p` et le prochain jeton ? (pour l'insertion de `;`) */
  const sautDeLigneAvant = (p) => s.slice(p, sautBlancs(p)).includes('\n');

  // ── Contextes ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Une pile de contextes remplace l'arbre. Chaque contexte porte de quoi décider d'un littéral :
   * `k` (bloc, littéral d'objet, corps de type, appel…), `estType` (tout ce qu'il contient est de
   * la syntaxe de type), `typeEnAttente` (une annotation est ouverte et court jusqu'au prochain
   * terminateur), `appele` (nom de l'appelé, pour `APPELS_TECHNIQUES`) et `role` pour les crochets.
   */
  const nouveauCtx = (k, extra = {}) => ({
    k,
    estType: k === 'typelit' || k === 'typeargs',
    typeEnAttente: null,
    ternaires: 0,
    dansCase: false,
    attenteCorps: null,
    attenteAlias: false,
    appele: null,
    role: null,
    ...extra,
  });

  const estTypeIci = (ctx) => ctx.estType || ctx.typeEnAttente !== null;

  // ── Littéraux ─────────────────────────────────────────────────────────────────────────────────

  /** Lit un littéral de chaîne à partir du guillemet en `i`. Rend la valeur CUITE. */
  const litChaine = () => {
    const guillemet = s[i];
    i += 1;
    let cuite = '';
    while (i < n) {
      const c = s[i];
      if (c === '\\') { cuite += litEchappement(); continue; }
      if (c === guillemet) { i += 1; break; }
      if (c === '\n') { i += 1; break; } // chaîne non terminée : on ne bloque pas le scan
      cuite += c;
      i += 1;
    }
    return cuite;
  };

  /** Lit une séquence d'échappement à partir du `\` en `i` et rend le caractère cuit. */
  const litEchappement = () => {
    i += 1; // le `\`
    const c = s[i];
    i += 1;
    if (c === 'x') { const h = s.substr(i, 2); i += 2; return String.fromCharCode(parseInt(h, 16) || 0); }
    if (c === 'u') {
      if (s[i] === '{') {
        const fin = s.indexOf('}', i);
        const h = s.slice(i + 1, fin);
        i = fin + 1;
        return String.fromCodePoint(parseInt(h, 16) || 0);
      }
      const h = s.substr(i, 4);
      i += 4;
      return String.fromCharCode(parseInt(h, 16) || 0);
    }
    if (c === '\n') return ''; // continuation de ligne
    if (c === '\r') { if (s[i] === '\n') i += 1; return ''; }
    return ECHAPPEMENTS[c] ?? c;
  };

  /**
   * Lit un gabarit à partir du backtick en `i`. Rend `{ cuite, substitution }` — les parties
   * `${…}` sont analysées comme du code (elles peuvent contenir du JSX, des appels, des chaînes).
   */
  const litGabarit = (ctx) => {
    i += 1; // le backtick
    let cuite = '';
    let substitution = false;
    while (i < n) {
      const c = s[i];
      if (c === '\\') { cuite += litEchappement(); continue; }
      if (c === '`') { i += 1; break; }
      if (c === '$' && s[i + 1] === '{') {
        substitution = true;
        i += 2;
        notePrec('${', false);
        parcoursCode(nouveauCtx('template'), '}');
        continue;
      }
      if (c === '\r') { cuite += '\n'; i += s[i + 1] === '\n' ? 2 : 1; continue; }
      cuite += c;
      i += 1;
    }
    return { cuite, substitution, ctx };
  };

  /** Saute une expression régulière à partir du `/` en `i`. */
  const sauteRegex = () => {
    i += 1;
    let dansClasse = false;
    while (i < n) {
      const c = s[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '[') dansClasse = true;
      else if (c === ']') dansClasse = false;
      else if (c === '/' && !dansClasse) { i += 1; break; }
      else if (c === '\n') break;
      i += 1;
    }
    while (i < n && estIdent(s[i])) i += 1; // drapeaux
  };

  // ── Classement d'un littéral hors JSX ─────────────────────────────────────────────────────────

  /**
   * Reproduit `estDirective` + `estStructurel` + `estArgumentTechnique` de la version compilateur,
   * mais depuis les jetons voisins plutôt que depuis le nœud parent. Chaque branche porte en
   * commentaire la forme d'AST qu'elle remplace.
   */
  const litteralEstIgnore = (ctx, valeur, avant, apres) => {
    // `'use client'` / `'use server'` — ExpressionStatement dont l'expression EST le littéral.
    if (/^use [a-z]+$/.test(valeur)
      && (avant === '' || avant === ';' || avant === '{' || avant === '}')
      && (apres === ';' || apres === '' || sautDeLigneAvant(i))) return true;

    // ImportDeclaration / ExportDeclaration / ImportTypeNode / ModuleDeclaration.
    if (avant === 'from' || avant === 'import' || avant === 'module' || avant === 'namespace') return true;
    if (avant === '(' && ctx.k === 'call' && ctx.appele === 'import') return true;

    // LiteralTypeNode — `x as 'a'`, `'a' | 'b'`, `Record<'a', X>`, et tout ce qui est déjà du type.
    if (AVANT_TYPE.has(avant) || apres === '|' || apres === '&') return true;
    if (estTypeIci(ctx)) return true;

    // PropertyAssignment / PropertySignature / EnumMember dont le NOM est le littéral.
    if ((ctx.k === 'objlit' || ctx.k === 'typelit' || ctx.k === 'classbody' || ctx.k === 'enumbody')
      && (avant === '{' || avant === ',' || avant === ';' || avant === '}')
      && (apres === ':' || (ctx.k === 'enumbody' && (apres === '=' || apres === ',' || apres === '}')))) return true;

    // ComputedPropertyName et ElementAccessExpression — `{ ['clé']: 1 }`, `obj['clé']`.
    if ((ctx.k === 'computed' || ctx.k === 'index') && avant === '[' && apres === ']') return true;

    // JsxExpression dont le parent est un JsxAttribute — `placeholder={'…'}`.
    if (ctx.k === 'jsxAttrExpr' && avant === '{' && apres === '}') return true;

    // CallExpression dont l'appelé est technique, ET dont le littéral est un argument DIRECT
    // (`t('x')` oui ; `t('a' + b)` non — là le parent est un binaire, pas l'appel).
    if (ctx.k === 'call' && APPELS_TECHNIQUES.has(ctx.appele)
      && (avant === '(' || avant === ',') && (apres === ',' || apres === ')')) return true;

    return false;
  };

  /** (d) littéraux de chaîne hors JSX : libellés d'enums, messages zod, retours de server actions. */
  const classeLitteral = (ctx, valeur, debut, avant) => {
    if (!(ACCENT.test(valeur) || PHRASE.test(valeur))) return;
    const apres = prochainJeton(i);
    if (litteralEstIgnore(ctx, valeur, avant, apres)) return;
    if (ressembleATailwind(valeur)) return;
    pousse(debut, 'litteral', valeur);
  };

  // ── Le parcours du code ───────────────────────────────────────────────────────────────────────

  /**
   * Parcourt du code jusqu'à `fermant` (inclus), ou jusqu'à la fin du fichier pour le contexte
   * racine. Chaque `(`, `[`, `{`, `${` et conteneur JSX ouvre un contexte fils.
   */
  function parcoursCode(ctx, fermant) {
    while (i < n) {
      const c = s[i];

      // blancs et commentaires
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v'
        || c === ' ' || c === '﻿') { i += 1; continue; }
      if (c === '/' && s[i + 1] === '/') { while (i < n && s[i] !== '\n') i += 1; continue; }
      if (c === '/' && s[i + 1] === '*') {
        i += 2;
        while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i += 1;
        i += 2;
        continue;
      }

      // fermeture du contexte
      if (fermant && c === fermant) {
        i += 1;
        notePrec(fermant, fermant === ')' || fermant === ']'
          || (fermant === '}' && (ctx.k === 'objlit' || ctx.k === 'template')));
        return;
      }
      // fermeture INATTENDUE : on la rend au parent plutôt que de dériver sur tout le fichier
      if (!fermant && (c === ')' || c === ']' || c === '}')) { i += 1; continue; }
      if (fermant && (c === ')' || c === ']' || c === '}')) return;

      // littéral de chaîne
      if (c === '"' || c === '\'') {
        const debut = i;
        const avant = prec.t;
        const valeur = litChaine();
        notePrec('"', true);
        classeLitteral(ctx, valeur, debut, avant);
        continue;
      }

      // gabarit
      if (c === '`') {
        const debut = i;
        const avant = prec.t;
        const { cuite, substitution } = litGabarit(ctx);
        notePrec('`', true);
        // NoSubstitutionTemplateLiteral seulement : un gabarit interpolé n'est pas compté.
        if (!substitution) classeLitteral(ctx, cuite, debut, avant);
        continue;
      }

      // expression régulière (vs division)
      if (c === '/' && !prec.valeur) { sauteRegex(); notePrec('/re/', true); continue; }

      // nombre
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] ?? ''))) {
        while (i < n && /[0-9a-fA-FxXoObBeEnN._]/.test(s[i])) i += 1;
        notePrec('0', true);
        continue;
      }

      // identifiant ou mot-clé
      if (estDebutIdent(c)) {
        const debut = i;
        while (i < n && estIdent(s[i])) i += 1;
        const mot = s.slice(debut, i);
        // Après un `.`, l'identifiant est un NOM DE PROPRIÉTÉ, jamais un mot-clé : `z.infer<T>` a
        // failli être lu comme du JSX parce que `infer` attend une expression — mais pas ici.
        if (prec.t === '.' || prec.t === '?.') { notePrec(mot, true); continue; }
        if (mot === 'interface') ctx.attenteCorps = 'typelit';
        else if (mot === 'enum') ctx.attenteCorps = 'enumbody';
        else if (mot === 'class') ctx.attenteCorps = 'classbody';
        else if (mot === 'case' || mot === 'default') ctx.dansCase = true;
        else if (mot === 'type'
          && (prec.t === '' || prec.t === ';' || prec.t === '{' || prec.t === '}'
            || prec.t === 'export' || prec.t === 'declare')) ctx.attenteAlias = true;
        notePrec(mot, !MOTS_ATTENDANT_EXPRESSION.has(mot));
        continue;
      }

      // JSX ? `<` en position d'expression, suivi d'un nom de balise ou d'un fragment
      if (c === '<' && !prec.valeur && (estDebutIdent(s[i + 1]) || s[i + 1] === '>')
        && !estParametreDeType()) { parcoursElementJsx(); continue; }

      // ouvrants
      if (c === '(' || c === '[' || c === '{') { ouvre(ctx, c); continue; }

      // ponctuation
      let op = c;
      for (const cand of PONCTUATIONS) if (s.startsWith(cand, i)) { op = cand; break; }
      i += op.length;
      majPonctuation(ctx, op);
      notePrec(op, op === '++' || op === '--');
    }
  }

  /** Saute une liste `<…>` équilibrée à partir du `<` en `i`, sans se laisser prendre par `=>`. */
  function sauteArgumentsDeType() {
    let profondeur = 0;
    while (i < n) {
      const c = s[i];
      if (c === '=' && s[i + 1] === '>') { i += 2; continue; }
      if (c === '"' || c === '\'') { litChaine(); continue; }
      if (c === '`') { litGabarit(nouveauCtx('typeargs')); continue; }
      if (c === '<') { profondeur += 1; i += 1; continue; }
      if (c === '>') { profondeur -= 1; i += 1; if (profondeur <= 0) return; continue; }
      if (c === '\n' && profondeur === 0) return;
      i += 1;
    }
  }

  /**
   * `<T,>(x: T) => x` et `<T extends X>` : un `<` en position d'expression qui ouvre en réalité des
   * paramètres de type. La forme se reconnaît à ce qui suit le premier identifiant.
   */
  function estParametreDeType() {
    if (!estDebutIdent(s[i + 1])) return false;
    let k = i + 1;
    while (k < n && estIdent(s[k])) k += 1;
    const suivant = prochainJeton(k);
    return suivant === ',' || suivant === 'extends';
  }

  /** Ouvre un contexte fils sur `(`, `[` ou `{`, après avoir décidé de sa NATURE. */
  function ouvre(ctx, c) {
    const avant = prec.t;
    const avantEstValeur = prec.valeur;
    i += 1;

    if (c === '(') {
      // appel si une valeur précède ; l'appelé est le DERNIER identifiant (`a.b.c(…)` → `c`),
      // ce que faisait déjà `estArgumentTechnique` en remontant les `PropertyAccessExpression`.
      const appel = avantEstValeur && /^[A-Za-z_$¡-￿][\w$¡-￿]*$/.test(avant);
      notePrec('(', false);
      parcoursCode(nouveauCtx(appel ? 'call' : 'paren', { appele: appel ? avant : null }), ')');
      ctx.typeEnAttente = ctx.typeEnAttente === 'annotation' ? null : ctx.typeEnAttente;
      return;
    }

    if (c === '[') {
      const role = avantEstValeur ? 'index'
        : (['objlit', 'typelit', 'classbody', 'enumbody'].includes(ctx.k)
          && (avant === '{' || avant === ',' || avant === ';' || avant === '}')) ? 'computed'
          : 'array';
      notePrec('[', false);
      parcoursCode(nouveauCtx(role, { estType: role !== 'array' && estTypeIci(ctx) }), ']');
      return;
    }

    // `{` : bloc, littéral d'objet, corps de type, corps de classe ou corps d'enum ?
    let k;
    if (ctx.attenteCorps) { k = ctx.attenteCorps; ctx.attenteCorps = null; } else if (estTypeIci(ctx)
      && ['=', ':', '|', '&', ',', '(', '<', '[', '=>', 'extends', 'keyof', 'readonly'].includes(avant)) {
      // en position de type, `{` ouvre un TypeLiteral — mais `function f(): void {` ouvre un corps,
      // et son `avant` est alors la fin du type (`void`, `>`, `]`…), pas un de ces jetons.
      k = 'typelit';
    } else if (!avantEstValeur
      && !['=>', ')', 'else', 'try', 'finally', 'do', ';', '{', '}', '', 'const', 'let', 'var'].includes(avant)) {
      k = 'objlit';
    } else if (avant === '=>' || avant === ')' || avant === 'else' || avant === 'try'
      || avant === 'finally' || avant === 'do' || avant === ';' || avant === '{' || avant === '}'
      || avant === '') {
      k = 'block';
    } else {
      k = 'objlit';
    }
    if (k === 'block' || k === 'classbody') ctx.typeEnAttente = null;
    notePrec('{', false);
    parcoursCode(nouveauCtx(k, { estType: k === 'typelit' }), '}');
  }

  /** Met à jour les marqueurs de type / ternaire / `case` du contexte courant sur une ponctuation. */
  function majPonctuation(ctx, op) {
    if (op === '?') {
      // `x?: T` (marqueur d'optionnalité) n'ouvre pas de ternaire ; `cond ? a : b` si.
      const suivant = prochainJeton(i);
      if (suivant !== ':' && suivant !== ',' && suivant !== ')' && suivant !== '}' && suivant !== '=') {
        ctx.ternaires += 1;
      }
      return;
    }
    if (op === ':') {
      if (ctx.dansCase) { ctx.dansCase = false; return; }        // `case 'x':`
      if (ctx.ternaires > 0) { ctx.ternaires -= 1; return; }     // `cond ? a : b`
      if (ctx.k === 'objlit') return;                            // `{ clé: valeur }`
      if (!ctx.estType) ctx.typeEnAttente = 'annotation';        // `x: Type`
      return;
    }
    if (op === '=') {
      if (ctx.attenteAlias) { ctx.attenteAlias = false; ctx.typeEnAttente = 'alias'; return; }
      ctx.typeEnAttente = null;
      return;
    }
    if (op === '=>') {
      if (ctx.typeEnAttente === 'annotation') ctx.typeEnAttente = null;
      return;
    }
    if (op === ',' || op === ';') { ctx.typeEnAttente = null; ctx.attenteAlias = false; return; }
  }

  // ── JSX ───────────────────────────────────────────────────────────────────────────────────────

  /** `<Nom …>` : lit la balise, ses attributs, puis ses enfants. `i` pointe sur le `<`. */
  function parcoursElementJsx() {
    i += 1; // `<`
    while (i < n && (estIdent(s[i]) || s[i] === '.' || s[i] === '-' || s[i] === ':')) i += 1;
    // `<FormInput<LoginFormValues> …>` : arguments de type sur la balise. Sans ce saut, le `<` est
    // pris pour un attribut et TOUT le reste de la balise bascule en texte JSX.
    if (s[i] === '<') sauteArgumentsDeType();

    while (i < n) {
      const k = sautBlancs(i);
      i = k;
      if (i >= n) return;
      if (s[i] === '/' && s[i + 1] === '>') { i += 2; notePrec('/>', true); return; }
      if (s[i] === '>') { i += 1; parcoursEnfantsJsx(); notePrec('/>', true); return; }
      if (s[i] === '{') { // `{...props}`
        i += 1;
        notePrec('{', false);
        parcoursCode(nouveauCtx('jsxSpread'), '}');
        continue;
      }
      if (!estDebutIdent(s[i])) { i += 1; continue; }

      const debutAttr = i;
      while (i < n && (estIdent(s[i]) || s[i] === '-' || s[i] === ':')) i += 1;
      const nom = s.slice(debutAttr, i);
      const apres = sautBlancs(i);
      if (s[apres] !== '=') continue; // attribut booléen : pas d'initialiseur, rien à compter
      i = apres + 1;
      i = sautBlancs(i);
      litValeurAttributJsx(nom, debutAttr);
    }
  }

  /**
   * (b) et (c) attributs d'affichage et attributs ARIA textuels. Seuls comptent les initialiseurs
   * qui SONT un littéral — `title="x"`, `title={'x'}`, `` title={`x`} `` — jamais une expression.
   */
  function litValeurAttributJsx(nom, debutAttr) {
    const interesse = ATTRS_AFFICHAGE.has(nom) || ATTRS_ARIA.has(nom);
    const c = s[i];

    if (c === '"' || c === '\'') {
      // chaîne d'attribut JSX : les échappements N'Y SONT PAS traités (c'est du texte brut)
      const guillemet = c;
      const debut = i + 1;
      let k = debut;
      while (k < n && s[k] !== guillemet) k += 1;
      const valeur = s.slice(debut, k);
      i = k + 1;
      notePrec('"', true);
      if (interesse && MOT.test(valeur) && !ressembleATailwind(valeur)) {
        pousse(debutAttr, ATTRS_ARIA.has(nom) ? 'aria' : 'attribut', `${nom}="${valeur}"`);
      }
      return;
    }

    if (c === '{') {
      i += 1;
      notePrec('{', false);
      // Le seul cas qui compte est « le conteneur ne porte QUE le littéral ». On le reconnaît
      // avant de parcourir : sinon (`{cond ? 'Oui' : 'Non'}`) le parcours normal s'en charge, et
      // ces littéraux-là tombent en catégorie `litteral`, exactement comme dans l'ancienne version.
      const debutExpr = sautBlancs(i);
      if (s[debutExpr] === '"' || s[debutExpr] === '\'' || s[debutExpr] === '`') {
        const sauve = i;
        const sauvePrec = prec;
        i = debutExpr;
        silence += 1; // ce coup d'œil sera peut-être rembobiné
        const r = s[i] === '`'
          ? litGabarit(nouveauCtx('jsxAttrExpr'))
          : { cuite: litChaine(), substitution: false };
        silence -= 1;
        if (!r.substitution && prochainJeton(i) === '}') {
          i = sautBlancs(i) + 1;
          notePrec('}', true);
          if (interesse && MOT.test(r.cuite) && !ressembleATailwind(r.cuite)) {
            pousse(debutAttr, ATTRS_ARIA.has(nom) ? 'aria' : 'attribut', `${nom}="${r.cuite}"`);
          }
          return;
        }
        i = sauve; // pas un littéral seul : on rembobine et on parcourt pour de bon
        prec = sauvePrec;
      }
      parcoursCode(nouveauCtx('jsxAttrExpr'), '}');
      return;
    }

    if (c === '<') { parcoursElementJsx(); return; } // `attr=<div/>`, rarissime mais légal
  }

  /** (a) texte JSX nu, plus les enfants (éléments imbriqués et conteneurs `{…}`). */
  function parcoursEnfantsJsx() {
    while (i < n) {
      if (s[i] === '<') {
        if (s[i + 1] === '/') { // balise fermante : elle clôt CE contexte d'enfants
          i += 2;
          while (i < n && s[i] !== '>') i += 1;
          i += 1;
          return;
        }
        parcoursElementJsx();
        continue;
      }
      if (s[i] === '{') {
        i += 1;
        notePrec('{', false);
        parcoursCode(nouveauCtx('jsxChildExpr'), '}');
        continue;
      }
      const debut = i;
      while (i < n && s[i] !== '<' && s[i] !== '{') i += 1;
      const texte = s.slice(debut, i);
      if (MOT.test(texte)) {
        // `getStart()` d'un JsxText saute les blancs de tête : la ligne rapportée est celle du
        // premier caractère non blanc, pas celle du `>` qui précède.
        const decalage = texte.length - texte.replace(/^\s+/, '').length;
        pousse(debut + decalage, 'jsx', texte);
      }
    }
  }

  parcoursCode(nouveauCtx('root'), null);
  return trouves;
}
