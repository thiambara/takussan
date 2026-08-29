/**
 * Le RELEVÉ des classes écrites dans le code — la moitié mesurante de `check-classes-emises.mjs`.
 *
 * Il vit dans son propre module pour la même raison que `i18n-scan.mjs` : **il doit être éprouvable
 * sur des fixtures.** Une garde qui ne trouve plus rien et une garde qui n'a plus rien à trouver
 * rendent exactement la même sortie verte ; seul un corpus d'épreuve les distingue.
 *
 * Ce module ne lit pas le disque, ne compile rien, ne décide de rien. Il rend une liste de
 * candidats. La décision — « celui-ci n'est émis par personne » — est dans la garde.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE SAIT PAS, DÉLIBÉRÉMENT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Il ne connaît AUCUN nom de jeton, AUCUN nom d'utilitaire, AUCUNE exception.** C'est la contrainte
 * centrale de TCK-453, et elle vient d'un échec mesuré : la version précédente du contrôle filtrait
 * ses candidats par `radical in JETONS_CLAIR`, donc écartait avant de contrôler exactement la classe
 * dont le jeton n'existe pas — le seul cas qu'elle prétendait attraper. *Une garde qui ne connaît
 * que la liste des valeurs valides et écarte le reste ne garde rien : « le reste » EST le défaut.*
 *
 * Ici, la validité d'une classe n'est jamais jugée : elle est **déléguée au compilateur**. Ce module
 * répond à une seule question, et elle est de POSITION, pas de vocabulaire : *cette chaîne
 * est-elle écrite là où le code écrit des classes CSS ?*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES DEUX ROUTES, ET POURQUOI IL EN FAUT DEUX
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Route « attribut » — la position, sans aucun filtre.** Tout littéral de chaîne atteint depuis un
 * attribut JSX `className=` / `class=` ou une propriété d'objet `className:` est un candidat, quelle
 * que soit sa forme. Aucune grammaire ne s'y applique : c'est ce qui permet à `p-4,5` — que la
 * moindre grammaire écarterait pour sa virgule — d'être relevé et de faire rougir. *Un filtre de
 * forme dans une position de classe rejouerait le défaut de 2026-08-27, un cran plus bas.*
 *
 * La route suit l'expression entière, pas seulement le littéral collé à l'attribut : les chaînes de
 * `className={cn('a', x && 'b')}` sont toutes relevées, sans que le nom `cn` soit écrit nulle part.
 * Un utilitaire renommé, ou un ternaire à la place d'un appel, ne change rien.
 *
 * **Route « forme » — pour ce qui est écrit LOIN de sa position.** Les variantes de `cva()`, les
 * constantes de classes, les tables de style ne sont syntaxiquement rattachées à aucun `className`.
 * Une chaîne hors position est donc relevée si — et seulement si — elle a la forme d'une **liste**
 * de classes : au moins deux jetons séparés par une espace, tous dans le jeu de caractères d'un
 * utilitaire, et au moins un portant une marque de syntaxe Tailwind (`-`, `:`, `[`, `/`).
 *
 * ⚠ Cette grammaire est une grammaire de FORME, jamais de vocabulaire : elle ne connaît aucun nom.
 * Elle peut néanmoins rater (une chaîne d'un seul jeton hors position) — c'est un manque de portée,
 * déclaré ci-dessous, et non un filtre sur la validité.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES TROUS, MESURÉS ET DÉCLARÉS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * 1. **Les classes composées à l'exécution** — `` `bg-${couleur}` ``, `` `${base}-500` `` — sont
 *    INVISIBLES à tout contrôle statique, ici comme dans Tailwind lui-même (qui ne les émet pas
 *    davantage). Le relevé écarte donc explicitement le jeton collé à une interpolation, des deux
 *    côtés : le relever produirait `bg-` , un candidat qui n'existe pas et ne serait jamais émis —
 *    un faux positif fabriqué par le relevé. **Trou déclaré, non fermé** (TCK-453, § Hors périmètre).
 * 2. **Une chaîne d'un seul jeton hors position de classe** (`const OMBRE = 'shadow-sm'`) n'est pas
 *    relevée : sa forme est indiscernable de celle d'une valeur d'énumération (`'for-sale'`).
 * 3. **Le `class=` écrit dans du HTML brut** à l'intérieur d'un gabarit n'est pas suivi comme une
 *    position : le contenu d'un gabarit est une chaîne, pas du code. La route « forme » le rattrape
 *    dès qu'il porte deux jetons, ce qui est le cas courant.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LES COMMENTAIRES SONT ÉCARTÉS, ET C'EST UNE DÉCISION
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le relevé du 2026-08-27 (TCK-453) comptait six candidats non émis sur le périmètre de TCK-440 :
 * **tous les six étaient des artefacts du relevé, aucun n'était un défaut du code.** Le premier,
 * `bg-scrim/`, venait de la PROSE d'un docblock expliquant comment consommer le jeton ; les cinq
 * autres d'une regex mordant au milieu d'un token plus long (`\b` matche après `-` ET après `]`).
 *
 * Les cinq derniers disparaissent par construction ici : on ne cherche plus un motif dans du texte
 * brut, on découpe une chaîne de classes sur ses espaces. `[&>div:first-child]:bg-transparent` et
 * `slide-in-from-bottom-2` sont des jetons entiers, indivisibles.
 *
 * Le premier est tranché explicitement : **les commentaires ne sont pas lus.** Le lexeur les
 * traverse sans jamais en tirer de littéral. La raison n'est pas le confort — c'est qu'un docblock
 * DÉCRIT du code au lieu d'en être : la prose qui explique un jeton parle souvent de classes que le
 * fichier n'écrit pas, et parfois de classes qui n'existent délibérément plus. Les relever ferait
 * rougir sur de la documentation juste. Le prix est déclaré : *un exemple de classe écrit dans un
 * docblock n'est pas contrôlé.*
 */

/** Les caractères après lesquels un `'`, un `"` ou un `/` ouvrent une expression, jamais du texte. */
const AVANT_EXPRESSION = new Set([
  '(', '[', '{', ',', ';', ':', '=', '!', '&', '|', '?', '+', '-', '*', '%', '~', '^', '>', '<',
  '}', '\n',
]);

/**
 * Décide si un `'`/`"` ouvre un littéral ou appartient à du texte JSX.
 *
 * ⚠ **Ce point décide de tout le reste** : `<p>Aujourd'hui</p>` n'est pas du code, et prendre son
 * apostrophe pour un début de chaîne fait avaler le lexeur jusqu'à la prochaine apostrophe du
 * fichier — donc rater en silence les `className` qu'il traverse. Le critère est positionnel : un
 * littéral suit toujours un opérateur ou une ponctuation, jamais une lettre.
 */
function ouvreUnLitteral(precedent) {
  return precedent === null || AVANT_EXPRESSION.has(precedent);
}

/**
 * Lexe un fichier TS/TSX en la SEULE chose dont le relevé a besoin : des littéraux de chaîne
 * situés, des identifiants et de la ponctuation. Ce n'est pas un analyseur syntaxique et ça n'a
 * pas à l'être — aucun arbre n'est construit.
 *
 * ⚠ Il n'importe volontairement AUCUN analyseur tiers. `typescript@7` (le portage Go) n'exporte
 * plus `ts.createSourceFile` côté Node, ce qui a mis la garde i18n à terre un matin sans que
 * `tsc --noEmit` ni `next build` ne bronchent (TCK-323). Rebrancher sur un analyseur tiers
 * reproduirait la même exposition, un nom de paquet plus loin.
 */
export function lexe(source) {
  const jetons = [];
  const lignes = [0];
  for (let k = 0; k < source.length; k++) if (source[k] === '\n') lignes.push(k + 1);
  const ligneDe = (i) => {
    let bas = 0;
    let haut = lignes.length - 1;
    while (bas < haut) {
      const m = (bas + haut + 1) >> 1;
      if (lignes[m] <= i) bas = m;
      else haut = m - 1;
    }
    return bas + 1;
  };

  // Pile de contextes : 'code' au sommet = on lit du code ; 'gabarit' = on lit le texte d'un
  // gabarit ; 'interp' = on lit l'expression d'un `${…}`, avec sa profondeur d'accolades.
  const pile = [{ mode: 'code' }];
  let precedent = null;
  let i = 0;

  const pousse = (t, v, debut, extra = {}) => {
    jetons.push({ t, v, i: debut, ligne: ligneDe(debut), ...extra });
  };

  while (i < source.length) {
    const sommet = pile[pile.length - 1];

    if (sommet.mode === 'gabarit') {
      // Texte de gabarit : on accumule jusqu'au backtick fermant ou au prochain `${`.
      let chunk = '';
      const debut = i;
      let fini = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') { chunk += source.slice(i, i + 2); i += 2; continue; }
        if (c === '`') {
          pile.pop();
          i += 1;
          pousse('chaine', chunk, debut, { colleAvant: sommet.colleApres, colleApres: false });
          precedent = '`';
          fini = true;
          break;
        }
        if (c === '$' && source[i + 1] === '{') {
          i += 2;
          pousse('chaine', chunk, debut, { colleAvant: sommet.colleApres, colleApres: true });
          // Le gabarit CÈDE la place à l'expression : l'oublier laisse deux contextes empilés,
          // et le second avale la suite du fichier comme du texte de gabarit.
          pile.pop();
          pile.push({ mode: 'interp', profondeur: 0 });
          precedent = '{';
          fini = true;
          break;
        }
        chunk += c;
        i += 1;
      }
      if (!fini) { pousse('chaine', chunk, debut, { colleAvant: sommet.colleApres, colleApres: false }); pile.pop(); }
      continue;
    }

    const c = source[i];

    if (c === ' ' || c === '\t' || c === '\r') { i += 1; continue; }
    if (c === '\n') { precedent = '\n'; i += 1; continue; }

    // Commentaires : traversés, jamais relevés (cf. l'en-tête).
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && source[i + 1] === '*') {
      const fin = source.indexOf('*/', i + 2);
      i = fin === -1 ? source.length : fin + 2;
      continue;
    }

    // Littéral d'expression régulière. Le critère de position est le même que pour les chaînes, à
    // deux réserves près : `</div>` ouvre une balise JSX fermante et non une regex, et une regex ne
    // franchit jamais une fin de ligne — sans quoi une division avalerait la moitié du fichier.
    if (c === '/' && precedent !== '<' && ouvreUnLitteral(precedent)) {
      let j = i + 1;
      let classe = false;
      let ferme = -1;
      while (j < source.length && source[j] !== '\n') {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '[') classe = true;
        else if (source[j] === ']') classe = false;
        else if (source[j] === '/' && !classe) { ferme = j; break; }
        j += 1;
      }
      if (ferme !== -1) {
        i = ferme + 1;
        while (i < source.length && /[a-z]/.test(source[i])) i += 1;
        precedent = '/';
        continue;
      }
    }

    if ((c === '"' || c === "'") && ouvreUnLitteral(precedent)) {
      const debut = i;
      let contenu = '';
      i += 1;
      while (i < source.length && source[i] !== c) {
        if (source[i] === '\\') { contenu += source[i + 1] ?? ''; i += 2; continue; }
        if (source[i] === '\n') break;
        contenu += source[i];
        i += 1;
      }
      i += 1;
      pousse('chaine', contenu, debut, { colleAvant: false, colleApres: false });
      precedent = c;
      continue;
    }

    if (c === '`') {
      i += 1;
      pile.push({ mode: 'gabarit', colleApres: false });
      continue;
    }

    if (/[A-Za-z_$]/.test(c)) {
      const debut = i;
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i += 1;
      pousse('ident', source.slice(debut, i), debut);
      precedent = source[i - 1];
      continue;
    }

    if (/[0-9]/.test(c)) {
      while (i < source.length && /[0-9a-zA-Z._]/.test(source[i])) i += 1;
      precedent = '0';
      continue;
    }

    if (sommet.mode === 'interp') {
      if (c === '{') sommet.profondeur += 1;
      else if (c === '}') {
        if (sommet.profondeur === 0) {
          pile.pop();
          pile.push({ mode: 'gabarit', colleApres: true });
          i += 1;
          continue;
        }
        sommet.profondeur -= 1;
      }
    }

    pousse('punct', c, i);
    precedent = c;
    i += 1;
  }

  return jetons;
}

/** Les jetons d'une chaîne de classes : découpage sur les espaces, rien de plus. */
function jetonsDe(chaine) {
  return chaine.split(/\s+/).filter(Boolean);
}

/**
 * Le jeu de caractères qu'un utilitaire Tailwind peut porter. C'est un JEU DE CARACTÈRES, pas une
 * liste de noms : aucune connaissance du vocabulaire n'y est encodée. Les majuscules et les accents
 * en sont absents hors valeur arbitraire, ce qui suffit à écarter la prose.
 */
const CARACTERES_UTILITAIRE = /^[a-z0-9![-][a-z0-9:./_%+*~^&>=$#,!?()[\]'"-]*$/;
/** Une marque de syntaxe Tailwind : séparateur de segment, variante, valeur arbitraire, alpha. */
const MARQUE_TAILWIND = /[-:[/]/;

/** Les crochets et parenthèses d'une valeur arbitraire s'apparient, sinon le jeton est tronqué. */
function crochetsApparies(jeton) {
  const pile = [];
  const paire = { ']': '[', ')': '(' };
  for (const c of jeton) {
    if (c === '[' || c === '(') pile.push(c);
    else if (c === ']' || c === ')') { if (pile.pop() !== paire[c]) return false; }
  }
  return pile.length === 0;
}

/**
 * Un jeton a-t-il la forme d'un utilitaire ? Trois exigences, toutes de forme :
 * le jeu de caractères, l'appariement des crochets — un jeton non apparié est le MORCEAU d'une
 * valeur CSS découpée sur ses espaces (`color-mix(in`, `srgb,`, `16px)`) — et la présence d'au
 * moins un caractère alphanumérique, qui écarte un tiret seul.
 */
function jetonBienForme(jeton) {
  if (!CARACTERES_UTILITAIRE.test(jeton.replace(/^-/, ''))) return false;
  if (!/[a-z0-9]/.test(jeton)) return false;
  if (/[,.:]$/.test(jeton)) return false;
  return crochetsApparies(jeton);
}

/**
 * Une chaîne HORS position de classe est-elle une LISTE de classes ? Grammaire de forme, jamais de
 * vocabulaire (cf. l'en-tête, route « forme »).
 */
export function ressembleAUneListeDeClasses(chaine) {
  const jetons = jetonsDe(chaine);
  if (jetons.length < 2) return false;
  if (!jetons.some((j) => MARQUE_TAILWIND.test(j))) return false;
  return jetons.every(jetonBienForme);
}

const OUVRANTS = new Set(['(', '[', '{']);
const FERMANTS = new Set([')', ']', '}']);
const COMPARAISON = new Set(['=', '!', '<', '>']);

/** Un opérateur de comparaison, lu comme une SUITE de ponctuations (`===` fait trois jetons). */
function suiteDeComparaison(jetons, depart, pas) {
  let n = 0;
  let egal = false;
  for (let m = depart; m >= 0 && m < jetons.length && n < 3; m += pas) {
    const t = jetons[m];
    if (t.t !== 'punct' || !COMPARAISON.has(t.v)) break;
    if (t.v === '=') egal = true;
    n += 1;
  }
  return n >= 2 && egal;
}

/**
 * Une chaîne écrite DANS une expression de classe n'est pas toujours une classe : elle peut être le
 * DISCRIMINANT qui choisit la classe. `cn(side === 'left' && 'inset-y-0')` écrit deux chaînes, et
 * une seule est une classe.
 *
 * ⚠ **Ces exclusions sont SYNTAXIQUES, jamais lexicales** — et la distinction est tout le sujet du
 * ticket. On n'écarte pas `left` parce qu'on saurait que `left` n'est pas un jeton : on l'écarte
 * parce qu'il est l'opérande d'un `===`. Une classe inexistante placée au même endroit
 * (`cn(x === 'a' && 'bg-inexistant')`) reste relevée, elle. Mesuré sur `src/` : 51 chaînes écartées
 * ici, toutes des discriminants, aucune classe.
 */
function estUnDiscriminant(jetons, m) {
  const avant = jetons[m - 1];
  const apres = jetons[m + 1];
  if (suiteDeComparaison(jetons, m - 1, -1)) return true;
  if (suiteDeComparaison(jetons, m + 1, +1)) return true;

  // Valeur d'une propriété d'objet dont la clé n'est PAS `className` : `buttonVariants({ variant:
  // 'ghost', size: 'sm' })` choisit une variante, il n'écrit pas une classe. La clé `className`,
  // elle, en écrit bien une — et c'est le seul nom lu dans tout ce module.
  //
  // ⚠ À ne pas confondre avec la branche d'un ternaire, qui porte le même `:` : une propriété
  // d'objet a une CLÉ avant son `:`, elle-même précédée d'une accolade ou d'une virgule.
  if (avant?.t === 'punct' && avant.v === ':') {
    const cle = jetons[m - 2];
    const avantLaCle = jetons[m - 3];
    const estUneCle = (cle?.t === 'ident' || cle?.t === 'chaine')
      && avantLaCle?.t === 'punct' && (avantLaCle.v === '{' || avantLaCle.v === ',');
    if (estUneCle && cle.v !== 'className' && cle.v !== 'class') return true;
  }

  // Accès indexé : `TONS['danger']`, `TONS[x ?? 'neutral']`. Un littéral de TABLEAU (`['a', 'b']`)
  // porte les mêmes crochets — ce qui les sépare est le jeton devant le `[` : un accès en membre
  // suit un identifiant ou une fermeture, jamais une ponctuation ouvrante.
  if (apres?.t === 'punct' && apres.v === ']') {
    let profondeur = 0;
    for (let p = m; p >= 0; p--) {
      const t = jetons[p];
      if (t.t !== 'punct') continue;
      if (t.v === ']' || t.v === ')' || t.v === '}') profondeur += 1;
      else if (t.v === '(' || t.v === '{') profondeur -= 1;
      else if (t.v === '[') {
        if (profondeur > 0) { profondeur -= 1; continue; }
        const devant = jetons[p - 1];
        return devant?.t === 'ident' || (devant?.t === 'punct' && (devant.v === ')' || devant.v === ']'));
      }
    }
  }

  // Branche de `switch`.
  if (avant?.t === 'ident' && avant.v === 'case') return true;
  return false;
}

/**
 * Les indices des jetons « chaîne » atteints depuis une position de classe.
 *
 * On suit l'EXPRESSION entière, pas le littéral collé à l'attribut : tout ce qui est écrit entre
 * les accolades d'un `className={…}` est du texte de classe, quel que soit le chemin qui l'y mène —
 * appel, ternaire, tableau, gabarit. Aucun nom de fonction n'est écrit ici, et c'est le point :
 * `cn`, `clsx`, `cva`, `twMerge` ou n'importe quel utilitaire à venir sont couverts sans être
 * nommés.
 */
function positionsDeClasse(jetons) {
  const dans = new Set();
  for (let k = 0; k < jetons.length; k++) {
    const j = jetons[k];
    if (j.t !== 'ident' || (j.v !== 'className' && j.v !== 'class')) continue;
    const suite = jetons[k + 1];
    if (!suite || suite.t !== 'punct' || (suite.v !== '=' && suite.v !== ':')) continue;
    const premier = jetons[k + 2];
    if (!premier) continue;

    if (premier.t === 'chaine') { dans.add(k + 2); continue; }

    // `className={…}` : jusqu'à l'accolade fermante appariée.
    if (premier.t === 'punct' && premier.v === '{') {
      let profondeur = 0;
      for (let m = k + 2; m < jetons.length; m++) {
        const t = jetons[m];
        if (t.t === 'chaine') { if (!estUnDiscriminant(jetons, m)) dans.add(m); continue; }
        if (t.t !== 'punct') continue;
        if (OUVRANTS.has(t.v)) profondeur += 1;
        else if (FERMANTS.has(t.v)) { profondeur -= 1; if (profondeur === 0) break; }
      }
      continue;
    }

    // `className: …` dans un littéral d'objet : jusqu'à la virgule ou l'accolade de même niveau.
    if (suite.v === ':') {
      let profondeur = 0;
      for (let m = k + 2; m < jetons.length; m++) {
        const t = jetons[m];
        if (t.t === 'chaine') { if (!estUnDiscriminant(jetons, m)) dans.add(m); continue; }
        if (t.t !== 'punct') continue;
        if (OUVRANTS.has(t.v)) profondeur += 1;
        else if (FERMANTS.has(t.v)) { if (profondeur === 0) break; profondeur -= 1; }
        else if (t.v === ',' && profondeur === 0) break;
      }
    }
  }
  return dans;
}

/**
 * Relève les classes écrites par un fichier.
 *
 * @returns {{classe: string, ligne: number, route: 'attribut'|'forme'}[]}
 */
export function scanneClasses(source) {
  const jetons = lexe(source);
  const enPosition = positionsDeClasse(jetons);
  const releve = [];

  for (let k = 0; k < jetons.length; k++) {
    const j = jetons[k];
    if (j.t !== 'chaine') continue;
    const dansUneClasse = enPosition.has(k);
    if (!dansUneClasse && !ressembleAUneListeDeClasses(j.v)) continue;

    const morceaux = jetonsDe(j.v);
    for (let m = 0; m < morceaux.length; m++) {
      // Un jeton collé à une interpolation est un MORCEAU de classe composée à l'exécution :
      // `` `bg-${c}` `` donne `bg-`, qui n'est pas une classe et ne serait émis par personne.
      // Le relever fabriquerait un faux positif ; c'est le trou n°1 de l'en-tête.
      const colleAuDebut = m === 0 && j.colleAvant && !/^\s/.test(j.v);
      const colleALaFin = m === morceaux.length - 1 && j.colleApres && !/\s$/.test(j.v);
      if (colleAuDebut || colleALaFin) continue;
      releve.push({ classe: morceaux[m], ligne: j.ligne, route: dansUneClasse ? 'attribut' : 'forme' });
    }
  }
  return releve;
}
