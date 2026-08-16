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
 */
import ts from 'typescript';

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

/** Le littéral est-il l'argument d'un appel technique ? (remonte les `.` : `t.rich('x')`) */
function estArgumentTechnique(noeud) {
  const parent = noeud.parent;
  if (!parent || !ts.isCallExpression(parent)) return false;
  if (!parent.arguments.includes(noeud)) return false;
  let expr = parent.expression;
  while (ts.isPropertyAccessExpression(expr)) expr = expr.name;
  return ts.isIdentifier(expr) && APPELS_TECHNIQUES.has(expr.text);
}

/** Le littéral est-il une directive de prologue (`'use client'`, `'use server'`) ? */
function estDirective(noeud) {
  return Boolean(noeud.parent)
    && ts.isExpressionStatement(noeud.parent)
    && noeud.parent.expression === noeud
    && /^use [a-z]+$/.test(noeud.text ?? '');
}

/** Le littéral est-il du typage, un chemin de module, un nom de propriété ou une clé d'objet ? */
function estStructurel(noeud) {
  const p = noeud.parent;
  if (!p) return true;
  if (ts.isLiteralTypeNode(p)) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return true;
  if (ts.isImportTypeNode(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isModuleDeclaration(p)) return true;
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isEnumMember(p)) && p.name === noeud) return true;
  if (ts.isComputedPropertyName(p)) return true;
  if (ts.isElementAccessExpression(p) && p.argumentExpression === noeud) return true;
  if (ts.isJsxAttribute(p)) return true; // traité par (b)/(c)
  if (ts.isJsxExpression(p) && p.parent && ts.isJsxAttribute(p.parent)) return true;
  return false;
}

/**
 * Compte les occurrences de texte affiché en dur dans un fichier source.
 *
 * QUATRE catégories, et l'énoncé de chacune est ce que la garde peut défendre :
 *   `jsx`      — nœuds `JsxText` portant un mot de 2+ lettres.
 *   `attribut` — attributs de `ATTRS_AFFICHAGE` initialisés par un littéral.
 *   `aria`     — attributs de `ATTRS_ARIA` initialisés par un littéral.
 *   `litteral` — littéraux de chaîne hors JSX portant un accent français OU une phrase de 2 mots.
 *
 * Rend `[{ ligne, categorie, extrait }]`. Les gabarits INTERPOLÉS (`` `Bonjour ${n}` ``) ne sont
 * pas comptés : le total est un PLANCHER, jamais un inventaire.
 */
export function compteFichier(chemin, source) {
  const sf = ts.createSourceFile(chemin, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const trouves = [];
  const pousse = (noeud, categorie, extrait) => {
    const { line } = sf.getLineAndCharacterOfPosition(noeud.getStart(sf));
    trouves.push({ ligne: line + 1, categorie, extrait: extrait.slice(0, 60).replace(/\s+/g, ' ').trim() });
  };

  const visite = (noeud) => {
    // (a) texte JSX nu
    if (noeud.kind === ts.SyntaxKind.JsxText) {
      if (MOT.test(noeud.text)) pousse(noeud, 'jsx', noeud.text);
    }

    // (b) et (c) attributs d'affichage et attributs ARIA textuels
    if (ts.isJsxAttribute(noeud) && noeud.initializer) {
      const nom = noeud.name.getText(sf);
      if (ATTRS_AFFICHAGE.has(nom) || ATTRS_ARIA.has(nom)) {
        let valeur = null;
        const init = noeud.initializer;
        if (ts.isStringLiteral(init)) valeur = init.text;
        else if (ts.isJsxExpression(init) && init.expression
                 && (ts.isStringLiteral(init.expression)
                     || ts.isNoSubstitutionTemplateLiteral(init.expression))) {
          valeur = init.expression.text;
        }
        if (valeur !== null && MOT.test(valeur) && !ressembleATailwind(valeur)) {
          pousse(noeud, ATTRS_ARIA.has(nom) ? 'aria' : 'attribut', `${nom}="${valeur}"`);
        }
      }
    }

    // (d) littéraux de chaîne hors JSX : libellés d'enums, messages zod, retours de server actions
    if (ts.isStringLiteral(noeud) || ts.isNoSubstitutionTemplateLiteral(noeud)) {
      const v = noeud.text;
      if ((ACCENT.test(v) || PHRASE.test(v))
        && !estDirective(noeud)
        && !estStructurel(noeud)
        && !estArgumentTechnique(noeud)
        && !ressembleATailwind(v)) {
        pousse(noeud, 'litteral', v);
      }
    }

    ts.forEachChild(noeud, visite);
  };

  ts.forEachChild(sf, visite);
  return trouves;
}
