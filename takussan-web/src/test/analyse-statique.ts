/**
 * LA LECTURE DÉRIVÉE DES SOURCES — le socle des gardes de contraste (TCK-459, TCK-458).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN LECTEUR D'AST ET PAS UN `grep`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les deux tickets que ce module sert demandent la même chose sous deux formes : **un périmètre
 * DÉRIVÉ**. Un `grep` dérive un ensemble de LIGNES ; ces gardes ont besoin d'un ensemble
 * d'ÉLÉMENTS — avec, pour chacun, les classes qui sont posées EN MÊME TEMPS que les siennes et
 * celles de ses ancêtres. Trois défauts déjà payés dans ce dépôt tiennent tous à cette différence :
 *
 *  1. **Deux classes d'un même `className` ne sont pas forcément simultanées.**
 *     `cn(actif ? 'bg-card text-primary' : 'bg-card/20 text-primary-foreground')` écrit quatre
 *     classes de couleur sur une ligne et n'en rend jamais que deux. Une lecture à plat y voit
 *     `text-primary-foreground` sur `bg-card` — un couple qui n'existe nulle part, mesuré à
 *     1,05:1, donc un ROUGE INVENTÉ. Une garde qui rougit sur du code juste est désarmée avant
 *     d'avoir servi.
 *  2. **Le fond d'un texte n'est presque jamais sur le même élément que lui.** Il est sur un
 *     ancêtre, et c'est ce que `contraste-wcag.ts` remonte au rendu. Ici on le remonte dans
 *     l'ARBRE JSX du fichier — la même chose, sans avoir à monter le composant.
 *  3. **La classe `dark` est posée en toutes lettres, et un `grep` orienté ligne l'a manquée
 *     deux fois** (cf. `portees-sombres.ts`). Ce qui compte n'est pas qu'un fichier contienne le
 *     mot `dark` : c'est qu'un ÉLÉMENT le porte, et quels éléments sont SOUS lui.
 *
 * ⚠ **Ce que ce module ne peut pas voir, et qu'il faut savoir avant de s'appuyer dessus :**
 *
 *  · une classe assemblée à l'exécution (`` `bg-${couleur}` ``) — invisible, et Tailwind ne la
 *    compilerait pas de toute façon ;
 *  · l'ancêtre qui vit dans un AUTRE fichier — la racine d'un composant enfant n'est pas rattachée
 *    au JSX de son appelant. C'est le trou principal, et il est FERMÉ PAR LE HAUT : un texte dont
 *    aucun ancêtre du fichier ne peint est mesuré sur les deux surfaces canoniques (`--card` et
 *    `--background`), ce que le design system exige de toute encre ;
 *  · un `style={{ background: … }}` inline, que `check-chart-contrast.mjs` traite de son côté.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import ts from 'typescript';

/** La racine de `src/`, la seule que ce module lit. */
export const RACINE_SRC = join(process.cwd(), 'src');

// ──────────────────────────────────────────────────────────────────────────────────────────────
// LE SYSTÈME DE FICHIERS
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Tous les `.tsx`/`.ts` sous `racine`, `__tests__` exclu, triés. */
export function sourcesDe(racine: string, extensions = /\.tsx?$/): string[] {
  const out: string[] = [];
  const descendre = (dir: string) => {
    for (const entree of readdirSync(dir)) {
      if (entree === '__tests__' || entree.startsWith('.')) continue;
      const chemin = join(dir, entree);
      if (statSync(chemin).isDirectory()) descendre(chemin);
      else if (extensions.test(entree)) out.push(chemin);
    }
  };
  descendre(racine);
  return out.sort();
}

/** `@/…` et les chemins relatifs ; tout le reste (paquets npm) sort du périmètre. */
export function resoudreImport(specificateur: string, depuis: string): string | null {
  let base: string;
  if (specificateur.startsWith('@/')) base = join(RACINE_SRC, specificateur.slice(2));
  else if (specificateur.startsWith('.')) base = resolve(dirname(depuis), specificateur);
  else return null;
  for (const candidat of [`${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(candidat) && statSync(candidat).isFile()) return candidat;
  }
  return null;
}

const RE_IMPORT = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;

/**
 * La CLÔTURE D'IMPORT d'un ensemble d'entrées : tout ce qu'elles atteignent, transitivement.
 *
 * C'est une SUR-approximation du rendu — un fichier importé n'est pas forcément monté — et c'est
 * le bon sens de l'erreur pour une garde : elle mesure plus que ce qui s'affiche, jamais moins.
 */
export function clotureDImport(entrees: readonly string[]): string[] {
  const vus = new Set<string>();
  const file = [...entrees];
  while (file.length > 0) {
    const fichier = file.pop()!;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    const texte = readFileSync(fichier, 'utf8');
    RE_IMPORT.lastIndex = 0;
    for (const m of texte.matchAll(RE_IMPORT)) {
      const cible = resoudreImport(m[1]!, fichier);
      if (cible && !vus.has(cible)) file.push(cible);
    }
  }
  return [...vus].sort();
}

/** Le chemin tel que les messages d'échec doivent le nommer : relatif à `src/`, en `/`. */
export function nommer(fichier: string): string {
  return relative(RACINE_SRC, fichier).split(sep).join('/');
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// LA LECTURE DU JSX
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Un GROUPE de classes réellement simultanées, avec la pile de ses ancêtres.
 *
 * Un même élément produit AUTANT de groupes qu'il a de combinaisons de branches : c'est la
 * réponse au défaut n°1 de l'en-tête. `ancetres` va du plus proche au plus lointain et ne porte
 * que les classes INCONDITIONNELLES des ancêtres — une branche d'ancêtre n'est pas une certitude.
 */
export interface GroupeDeClasses {
  readonly fichier: string;
  readonly ligne: number;
  readonly balise: string;
  readonly classes: readonly string[];
  readonly ancetres: readonly (readonly string[])[];
  /**
   * L'élément porte-t-il du TEXTE, dans tout son sous-arbre ?
   *
   * C'est ce qui décide du seuil appliqué — 4,5:1 pour du texte (WCAG 1.4.3), 3:1 pour un objet
   * graphique (1.4.11) — et l'AC5 de TCK-458 en fait une exigence explicite : « le test dit lequel
   * il applique à chaque couple ». Le sous-arbre ENTIER compte, parce qu'une encre est héritée :
   * `<div className="text-white"><span>Bonjour</span></div>` porte bien du texte blanc.
   *
   * Une ponctuation seule (« • », « · », « / ») ne compte PAS comme du texte : c'est un séparateur
   * décoratif, et WCAG 1.4.3 ne gouverne pas un texte purement décoratif. La règle est DÉRIVÉE du
   * contenu (présence d'une lettre ou d'un chiffre), jamais d'une liste de composants.
   */
  readonly texte: boolean;
  /** Le texte de l'attribut, tronqué — reporté tel quel dans les messages d'échec. */
  readonly source: string;
}

interface LitteralSitue {
  readonly texte: string;
  /** Une entrée par nœud conditionnel traversé : `id` du nœud, et la branche prise. */
  readonly chemin: readonly { readonly id: number; readonly branche: string }[];
}

function analyser(fichier: string): ts.SourceFile {
  return ts.createSourceFile(fichier, readFileSync(fichier, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/**
 * Les littéraux de chaînes d'une expression d'attribut, chacun avec le CHEMIN CONDITIONNEL qui
 * décide de sa présence.
 */
function litterauxDe(noeud: ts.Node): LitteralSitue[] {
  const out: LitteralSitue[] = [];
  let compteur = 0;
  const marcher = (n: ts.Node, chemin: LitteralSitue['chemin']) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      out.push({ texte: n.text, chemin });
      return;
    }
    if (ts.isTemplateExpression(n)) {
      out.push({ texte: n.head.text, chemin });
      for (const travee of n.templateSpans) {
        marcher(travee.expression, chemin);
        out.push({ texte: travee.literal.text, chemin });
      }
      return;
    }
    if (ts.isConditionalExpression(n)) {
      const id = (compteur += 1);
      marcher(n.whenTrue, [...chemin, { id, branche: 'oui' }]);
      marcher(n.whenFalse, [...chemin, { id, branche: 'non' }]);
      return;
    }
    if (ts.isBinaryExpression(n)
      && (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        || n.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
      const id = (compteur += 1);
      marcher(n.left, [...chemin, { id, branche: 'gauche' }]);
      marcher(n.right, [...chemin, { id, branche: 'droite' }]);
      return;
    }
    if (ts.isObjectLiteralExpression(n)) {
      // `clsx({ dark: x, 'text-white': y })` — la CLÉ est la classe, et chaque clé est
      // indépendante des autres. Chacune reçoit donc son propre nœud conditionnel.
      for (const prop of n.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const nom = ts.isStringLiteral(prop.name) || ts.isIdentifier(prop.name) ? prop.name.text : null;
        if (nom === null) continue;
        const id = (compteur += 1);
        out.push({ texte: nom, chemin: [...chemin, { id, branche: 'clé' }] });
      }
      return;
    }
    n.forEachChild((enfant) => marcher(enfant, chemin));
  };
  marcher(noeud, []);
  return out;
}

/** Deux littéraux peuvent-ils être posés en même temps ? */
function compatibles(a: LitteralSitue, b: LitteralSitue): boolean {
  for (const pas of a.chemin) {
    const autre = b.chemin.find((p) => p.id === pas.id);
    if (autre && autre.branche !== pas.branche) return false;
  }
  return true;
}

/**
 * Les COMBINAISONS de branches réellement possibles → un groupe de classes par combinaison.
 *
 * Au-delà de six nœuds conditionnels (2⁶ = 64 combinaisons, jamais atteint dans ce dépôt), on
 * retombe sur un groupe par littéral, plus ses compatibles : moins précis, jamais explosif.
 */
function groupesDe(litteraux: readonly LitteralSitue[]): string[][] {
  const noeuds = new Map<number, Set<string>>();
  for (const l of litteraux) {
    for (const pas of l.chemin) {
      if (!noeuds.has(pas.id)) noeuds.set(pas.id, new Set());
      noeuds.get(pas.id)!.add(pas.branche);
    }
  }
  const classesDe = (retenus: readonly LitteralSitue[]) =>
    retenus.flatMap((l) => l.texte.split(/\s+/).filter(Boolean));

  if (noeuds.size === 0) return [classesDe(litteraux)];

  const ids = [...noeuds.keys()];
  if (ids.length > 6) {
    const vus = new Set<string>();
    const out: string[][] = [];
    for (const l of litteraux) {
      const groupe = classesDe(litteraux.filter((m) => compatibles(l, m)));
      const cle = groupe.join(' ');
      if (!vus.has(cle)) { vus.add(cle); out.push(groupe); }
    }
    return out;
  }

  let combinaisons: { id: number; branche: string }[][] = [[]];
  for (const id of ids) {
    const branches = [...noeuds.get(id)!];
    combinaisons = combinaisons.flatMap((c) => branches.map((branche) => [...c, { id, branche }]));
  }
  const vus = new Set<string>();
  const out: string[][] = [];
  for (const combinaison of combinaisons) {
    const retenus = litteraux.filter((l) =>
      l.chemin.every((pas) => combinaison.find((c) => c.id === pas.id)?.branche === pas.branche));
    const groupe = classesDe(retenus);
    const cle = groupe.join(' ');
    if (groupe.length > 0 && !vus.has(cle)) { vus.add(cle); out.push(groupe); }
  }
  return out;
}

function attributDeClasse(ouvrant: ts.JsxOpeningLikeElement): ts.JsxAttribute | null {
  for (const attribut of ouvrant.attributes.properties) {
    if (!ts.isJsxAttribute(attribut)) continue;
    const nom = attribut.name.getText();
    if (nom === 'className' || nom === 'class') return attribut;
  }
  return null;
}

function baliseDe(ouvrant: ts.JsxOpeningLikeElement): string {
  return ouvrant.tagName.getText();
}

/**
 * Le sous-arbre JSX de `n` contient-il du texte ?
 *
 * Compte comme texte : un `JsxText` porteur d'une lettre ou d'un chiffre, et toute interpolation
 * `{…}` d'enfant — une valeur interpolée est du contenu, et supposer le contraire ferait juger au
 * seuil des objets graphiques un libellé qui vient d'un dictionnaire. Ne compte pas : une
 * ponctuation seule, ni un sous-arbre vide (une icône).
 */
function porteDuTexte(n: ts.Node): boolean {
  let trouve = false;
  const marcher = (x: ts.Node) => {
    if (trouve) return;
    if (ts.isJsxText(x)) {
      if (/[\p{L}\p{N}]/u.test(x.text)) trouve = true;
      return;
    }
    if (ts.isJsxExpression(x) && x.parent && (ts.isJsxElement(x.parent) || ts.isJsxFragment(x.parent))) {
      trouve = true;
      return;
    }
    x.forEachChild(marcher);
  };
  if (ts.isJsxElement(n)) for (const enfant of n.children) marcher(enfant);
  return trouve;
}

/**
 * Tous les groupes de classes d'un fichier, avec la pile d'ancêtres de chacun.
 *
 * ⚠ Un `className` posé sur un COMPOSANT (`<Card className="bg-card">`) est lu comme un élément
 * comme un autre : c'est ce que fait le rendu (la classe atterrit sur la racine du composant), et
 * l'ignorer perdrait la moitié des fonds de ce dépôt.
 */
export function groupesDeClasses(fichier: string): GroupeDeClasses[] {
  const source = analyser(fichier);
  const nom = nommer(fichier);
  const out: GroupeDeClasses[] = [];
  const pile: string[][] = [];

  const classesInconditionnelles = (attribut: ts.JsxAttribute | null): string[] => {
    if (!attribut?.initializer) return [];
    return litterauxDe(attribut.initializer)
      .filter((l) => l.chemin.length === 0)
      .flatMap((l) => l.texte.split(/\s+/).filter(Boolean));
  };

  const marcher = (n: ts.Node) => {
    const ouvrant = ts.isJsxElement(n) ? n.openingElement
      : ts.isJsxSelfClosingElement(n) ? n : null;
    if (!ouvrant) { n.forEachChild(marcher); return; }

    const attribut = attributDeClasse(ouvrant);
    if (attribut?.initializer) {
      const texte = porteDuTexte(n);
      const ligne = source.getLineAndCharacterOfPosition(ouvrant.getStart()).line + 1;
      const source_ = attribut.getText().replace(/\s+/g, ' ').slice(0, 160);
      for (const classes of groupesDe(litterauxDe(attribut.initializer))) {
        out.push({
          fichier: nom,
          ligne,
          balise: baliseDe(ouvrant),
          classes,
          ancetres: pile.map((p) => [...p]).reverse(),
          texte,
          source: source_,
        });
      }
    }

    pile.push(classesInconditionnelles(attribut));
    n.forEachChild(marcher);
    pile.pop();
  };

  marcher(source);
  return out;
}

/**
 * Les BALISES JSX rendues SOUS un élément qui porte `classe`, dans ce fichier.
 *
 * C'est ce dont une portée a besoin : pas « le fichier contient la classe » (ce que rendrait un
 * `grep`), mais « ces composants-là sont dans son sous-arbre ». Le `<SheetContent className="dark">`
 * de `SuperAdminShell` en est l'exemple : sa portée traverse un portail, donc elle n'a rien à voir
 * avec la position de l'élément dans le DOM — seulement avec son sous-arbre JSX.
 */
export function balisesSousLaClasse(fichier: string, classe: string): string[] {
  const source = analyser(fichier);
  const out = new Set<string>();

  const collecter = (n: ts.Node) => {
    const ouvrant = ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;
    if (ouvrant) out.add(baliseDe(ouvrant));
    n.forEachChild(collecter);
  };

  const marcher = (n: ts.Node) => {
    const ouvrant = ts.isJsxElement(n) ? n.openingElement
      : ts.isJsxSelfClosingElement(n) ? n : null;
    if (ouvrant) {
      const attribut = attributDeClasse(ouvrant);
      const porte = attribut?.initializer
        ? litterauxDe(attribut.initializer).some((l) => l.texte.split(/\s+/).includes(classe))
        : false;
      // L'élément PORTEUR est lui-même sous la portée : `<Sidebar className="dark" />`
      // n'a pas d'enfant JSX, et c'est pourtant lui que la classe habille.
      if (porte) { collecter(n); return; }
    }
    n.forEachChild(marcher);
  };

  marcher(source);
  return [...out].sort();
}

/** Nom importé → fichier, pour un fichier donné. Sert à passer d'une balise JSX à sa source. */
export function importsDe(fichier: string): Map<string, string> {
  const source = analyser(fichier);
  const out = new Map<string, string>();
  for (const declaration of source.statements) {
    if (!ts.isImportDeclaration(declaration) || !ts.isStringLiteral(declaration.moduleSpecifier)) continue;
    const cible = resoudreImport(declaration.moduleSpecifier.text, fichier);
    if (!cible) continue;
    const clause = declaration.importClause;
    if (!clause) continue;
    if (clause.name) out.set(clause.name.text, cible);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) out.set(element.name.text, cible);
    }
  }
  return out;
}
