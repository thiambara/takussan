/**
 * Le DÉRIVEUR d'espaces de noms next-intl — la moitié mesurante de `check-i18n-namespaces.mjs`.
 *
 * Il vit dans son propre module pour la même raison que `i18n-scan.mjs` : **il doit être testable
 * sur des fixtures**. `src/i18n/__tests__/i18n-namespaces-scan.test.ts` lui soumet un cas par
 * règle. Sans ce test, la garde peut devenir aveugle en silence — une garde qui ne trouve plus
 * rien et une garde qui n'a plus rien à trouver rendent exactement la même sortie verte.
 *
 * Ce module NE DÉCIDE PAS : il rend un ensemble. La décision, le cliquet et la sortie en 1 sont
 * dans `check-i18n-namespaces.mjs`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QU'IL DÉRIVE, ET POURQUOI IL FAUT LE DÉRIVER
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le dictionnaire complet est sérialisé dans la charge RSC de CHAQUE document (`no-store`, donc
 * payé à chaque chargement). Le découper par frontière de rendu exige de savoir quels espaces de
 * noms chaque frontière peut atteindre. **Cette table ne peut pas être écrite à la main** : c'est
 * la leçon que ce dépôt répète depuis `INDEX.md` (faux sur 213 de ses 266 entrées) — *une liste
 * écrite à la main est juste le jour où on l'écrit*, et ici la sanction d'une table périmée n'est
 * pas un document faux, c'est un `MISSING_MESSAGE` peint à l'écran d'un utilisateur, sur un chemin
 * rare, sans que ni le build, ni ESLint, ni `tsc`, ni les tests ne rougissent.
 *
 * On marche donc le graphe d'imports depuis les fichiers du routeur (`page`, `layout`, `error`,
 * `loading`, `not-found`, `template`, `default`), en suivant `@/…`, les chemins relatifs, et les
 * `import()` dynamiques — puis on relève, dans chaque fichier atteint, les espaces adressés.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL NE RETIRE NI LES COMMENTAIRES NI LES CHAÎNES — ET QUE C'EST DÉLIBÉRÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * La première version stripait les commentaires avant d'appliquer ses motifs. Deux défauts, tous
 * deux MESURÉS sur ce dépôt et tous deux du mauvais côté de l'erreur :
 *
 *   · un `'https://images.unsplash.com/…'` (il y en a deux dans `(auth)/layout.tsx`) est vu comme
 *     un commentaire de ligne par tout stripper naïf : le reste de la ligne disparaît ;
 *   · un texte JSX français porte des apostrophes (`<p>l'utilisateur…`) que tout suiveur de
 *     chaînes prend pour un début de littéral, et qui avalent le code jusqu'à la suivante.
 *
 * Les deux produisent des FAUX NÉGATIFS — un espace de noms qu'on ne voit plus. Or l'asymétrie des
 * coûts est totale ici : un faux positif embarque quelques centaines d'octets de trop, un faux
 * négatif casse un écran en production. **Le scanner travaille donc sur la source BRUTE et
 * SUR-APPROXIME assumément** : un `useTranslations('x')` en commentaire est compté. C'est le sens
 * de l'erreur qu'on veut, et c'est aussi ce qui lui évite d'avoir un lexeur à casser (la leçon de
 * TCK-323 : moins il y a de pièces en amont, moins il y a de pannes silencieuses).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Extensions tentées à la résolution d'un import, dans cet ordre. */
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];

/** Fichiers du routeur d'application qui servent de points d'entrée au graphe. */
export const FICHIERS_ROUTEUR = new Set([
  'page.tsx', 'layout.tsx', 'error.tsx', 'loading.tsx', 'not-found.tsx',
  'template.tsx', 'default.tsx', 'global-error.tsx',
  'page.ts', 'layout.ts', 'error.ts', 'loading.ts', 'not-found.ts',
]);

// ── Motifs ──────────────────────────────────────────────────────────────────────────────────────

const RE_IMPORT_STATIQUE = /(?:^|[^\w$.])(?:import|export)\s+(?:[\s\S]*?\sfrom\s*)?['"]([^'"\n]+)['"]/g;
const RE_IMPORT_DYNAMIQUE = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const RE_REQUIRE = /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;

/** `useTranslations('a.b')` / `getTranslations('a.b')` — la forme littérale, la seule sûre. */
const RE_NS_LITTERAL = /\b(?:useTranslations|getTranslations)\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g;
/** `getTranslations({ namespace: 'a.b', … })` — la forme objet de `next-intl/server`. */
const RE_NS_OBJET = /\bnamespace\s*:\s*(['"`])([^'"`\n]+)\1/g;
/** `useTranslations()` / `getTranslations()` — traducteur à la RACINE du dictionnaire. */
const RE_TRADUCTEUR_RACINE = /\b(?:useTranslations|getTranslations)\s*\(\s*\)/;
/** `useTranslations(<autre chose qu'un littéral>)` — le cas qu'il faut résoudre ou refuser. */
const RE_NS_DYNAMIQUE = /\b(?:useTranslations|getTranslations)\s*\(\s*([^)'"`\s][^)]*?)\s*\)/g;
/** Tout littéral de chaîne, pour les récoltes (règles B et C). */
const RE_LITTERAL = /(['"`])([^'"`\n]{2,120})\1/g;

/**
 * Résout un spécificateur de module en chemin de fichier, ou `null` si c'est un paquet externe
 * (aucun fichier de `node_modules` n'est marché : le dictionnaire n'y vit pas).
 */
export function resoudreModule(spec, depuis, racineSrc) {
  let base;
  if (spec.startsWith('@/')) base = join(racineSrc, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(depuis), spec);
  else return null;
  for (const e of EXTENSIONS) if (existsSync(base + e) && statSync(base + e).isFile()) return base + e;
  if (existsSync(base) && statSync(base).isDirectory()) {
    for (const e of EXTENSIONS) {
      const p = join(base, 'index' + e);
      if (existsSync(p)) return p;
    }
    return null;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

/** Les spécificateurs de module cités par une source (statiques, dynamiques, `require`). */
export function importsDe(source) {
  const specs = new Set();
  for (const re of [RE_IMPORT_STATIQUE, RE_IMPORT_DYNAMIQUE, RE_REQUIRE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(source))) specs.add(m[1]);
  }
  return [...specs];
}

/** `'property.types'` → `'property'`. Le provider se découpe au PREMIER niveau, jamais plus bas. */
export const premierNiveau = (chemin) => String(chemin).split('.')[0];

/**
 * Relève d'UN fichier ce qui concerne next-intl, sans rien résoudre.
 *
 * - `litteraux` — espaces adressés par un littéral : la forme décidable, et la plus fréquente.
 * - `dynamiques` — le texte de l'expression passée à `useTranslations(…)` quand ce n'est pas un
 *   littéral. Le champ existe pour que ces sites soient **nommés** : la garde exige qu'ils se
 *   résolvent, et refuse ceux qu'elle ne sait pas résoudre plutôt que de les ignorer.
 * - `racine` — le fichier tient un traducteur à la racine du dictionnaire. Il peut alors adresser
 *   n'importe quel espace, et la règle C ci-dessous récolte ses littéraux.
 */
export function releveFichier(source) {
  const litteraux = new Set();
  const dynamiques = new Set();
  let m;

  RE_NS_LITTERAL.lastIndex = 0;
  while ((m = RE_NS_LITTERAL.exec(source))) litteraux.add(premierNiveau(m[2]));
  RE_NS_OBJET.lastIndex = 0;
  while ((m = RE_NS_OBJET.exec(source))) litteraux.add(premierNiveau(m[2]));
  RE_NS_DYNAMIQUE.lastIndex = 0;
  while ((m = RE_NS_DYNAMIQUE.exec(source))) dynamiques.add(m[1].trim());

  return { litteraux: [...litteraux], dynamiques: [...dynamiques], racine: RE_TRADUCTEUR_RACINE.test(source) };
}

/**
 * Retire les commentaires qui OCCUPENT UNE LIGNE ENTIÈRE — et rien d'autre.
 *
 * ⚠️ Ce n'est PAS un stripper de commentaires, et c'est exactement le point. Un stripper complet
 * doit suivre les chaînes ; suivre les chaînes de ce dépôt casse sur deux formes MESURÉES :
 * `'https://images.unsplash.com/…'`, dont le `//` passe pour un commentaire de ligne, et le texte
 * JSX français (`l'utilisateur`), dont l'apostrophe passe pour un début de littéral. Les deux
 * produisent des faux NÉGATIFS, c'est-à-dire des espaces de noms qu'on cesse de voir.
 *
 * Cette fonction ne touche donc jamais au MILIEU d'une ligne : elle jette les lignes qui
 * commencent par `//` et les blocs `/* … *\/` dont l'ouverture commence une ligne. Aucune chaîne
 * ne peut être abîmée, puisqu'aucune chaîne n'est écrite en début de ligne précédée de `//`.
 *
 * Elle existe pour UN usage — la récolte large de la règle C — et pour une raison mesurée : les
 * blocs JSDoc de ce dépôt contiennent des EXEMPLES de code (`useTranslations('leases.deposit')`,
 * `i18nNamespace="agents.onboarding.kyc"`). Comptés, ils ajoutaient au socle de CHAQUE page
 * quatre espaces de noms — `admin`, `agents`, `auth`, `leases` — dont un qui n'existe même pas
 * dans le dictionnaire. Le socle passait de 8,2 % à 26,5 % du dictionnaire complet **à cause de
 * la documentation**. Les règles A et B, elles, travaillent toujours sur la source brute : leurs
 * motifs sont assez étroits pour qu'un exemple en commentaire ne coûte que quelques octets.
 */
export function retireCommentairesPleineLigne(source) {
  const lignes = source.split('\n');
  const gardees = [];
  let dansBloc = false;
  for (const ligne of lignes) {
    if (dansBloc) {
      if (ligne.includes('*/')) dansBloc = false;
      continue;
    }
    if (/^\s*\/\//.test(ligne)) continue;
    if (/^\s*\/\*/.test(ligne)) {
      if (!ligne.includes('*/')) dansBloc = true;
      continue;
    }
    gardees.push(ligne);
  }
  return gardees.join('\n');
}

/**
 * RÈGLE C — récolte les espaces atteignables depuis un traducteur RACINE.
 *
 * Un `useTranslations()` sans argument résout des chemins ABSOLUS (`errors.api.unauthenticated`,
 * `nav.sidebar.myFavorites`), qu'aucun relevé de site d'appel ne peut deviner. On récolte donc,
 * dans les fichiers qui en tiennent un, tout littéral dont le premier segment est un espace de
 * noms EXISTANT du dictionnaire. Le dictionnaire est ici la source de vérité, et c'est ce qui
 * empêche la récolte de dériver : elle ne peut inventer aucun nom.
 *
 * Sur-approxime : `'property.jpg'` compterait pour `property`. C'est le bon sens de l'erreur.
 */
export function recolteRacine(source, espacesConnus) {
  const trouves = new Set();
  const utile = retireCommentairesPleineLigne(source);
  RE_LITTERAL.lastIndex = 0;
  let m;
  while ((m = RE_LITTERAL.exec(utile))) {
    const valeur = m[2];
    if (!valeur.includes('.')) continue;
    const tete = premierNiveau(valeur);
    if (espacesConnus.has(tete)) trouves.add(tete);
  }
  return [...trouves];
}

/**
 * RÈGLE B — résout une expression de namespace non littérale, par récolte de littéraux.
 *
 * Deux formes existent sur ce dépôt, et la garde n'en accepte pas d'autres :
 *
 *   1. `TABLE.clé` — `const TABLE = { clé: 'property.types', … } as const` (les tables
 *      `PROPERTY_ENUM_NAMESPACES` / `CUSTOMER_ENUM_NAMESPACES`). On récolte les valeurs associées
 *      à la clé dans tout le graphe ; à défaut, TOUTES les valeurs de la table.
 *   2. `identifiant` seul — typiquement une PROP (`i18nNamespace` de `KycUploader`). On récolte
 *      tout littéral lié à ce nom dans le graphe : valeur par défaut de destructuration
 *      (`i18nNamespace = '…'`), attribut JSX (`i18nNamespace="…"`), propriété d'objet
 *      (`i18nNamespace: '…'`).
 *
 * Rend `[]` quand rien n'est trouvé — et c'est alors à l'appelant d'ÉCHOUER, jamais d'ignorer.
 */
export function resoudreDynamique(expression, sources) {
  const nom = expression.replace(/\?\./g, '.').split('.')[0].trim();
  const membre = expression.includes('.') ? expression.replace(/\?\./g, '.').split('.').slice(1).join('.').trim() : null;
  if (!/^[A-Za-z_$][\w$]*$/.test(nom)) return [];

  const trouves = new Set();
  for (const source of sources) {
    if (membre) {
      // `NOM = { … }` puis, à l'intérieur, `membre: 'valeur'`.
      const decl = new RegExp(`\\b${nom}\\s*(?::[^=]*)?=\\s*\\{([\\s\\S]*?)\\}\\s*(?:as const)?\\s*;`, 'g');
      let d;
      while ((d = decl.exec(source))) {
        const corps = d[1];
        const cible = new RegExp(`(?:^|[\\s,{])${membre}\\s*:\\s*(['"\`])([^'"\`\\n]+)\\1`, 'm');
        const hit = cible.exec(corps);
        if (hit) trouves.add(hit[2]);
        else {
          const toutes = /:\s*(['"`])([^'"`\n]+)\1/g;
          let v;
          while ((v = toutes.exec(corps))) trouves.add(v[2]);
        }
      }
    } else {
      const lie = new RegExp(`\\b${nom}\\s*(?::\\s*[^=,)]*)?\\s*[:=]\\s*(['"\`])([^'"\`\\n]+)\\1`, 'g');
      let v;
      while ((v = lie.exec(source))) trouves.add(v[2]);
    }
  }
  return [...trouves];
}

/** Parcourt un répertoire et rend tous les fichiers de code, tests exclus. */
export function fichiersDe(dir, acc = []) {
  for (const entree of readdirSync(dir)) {
    if (entree === 'node_modules' || entree === '__tests__') continue;
    const p = join(dir, entree);
    const st = statSync(p);
    if (st.isDirectory()) fichiersDe(p, acc);
    else if (EXTENSIONS.some((e) => p.endsWith(e)) && !/\.(test|spec)\.[tj]sx?$/.test(p)) acc.push(p);
  }
  return acc;
}

/**
 * Marche le graphe d'imports depuis `entrees` et rend `{ fichiers, sources, releves }`.
 *
 * `sources` conserve le texte de chaque fichier atteint : les règles B et C en ont besoin, et le
 * relire deux fois coûterait le double d'E/S pour rien.
 */
export function marcheGraphe(entrees, racineSrc, lire = (f) => readFileSync(f, 'utf8')) {
  const fichiers = new Set();
  const sources = new Map();
  const releves = new Map();
  const pile = [...entrees];
  while (pile.length) {
    const f = pile.pop();
    if (fichiers.has(f)) continue;
    fichiers.add(f);
    let source;
    try {
      source = lire(f);
    } catch {
      continue;
    }
    // ⚠ Une seule et même source débarrassée de ses commentaires pleine ligne sert à TOUT :
    // relevé, récoltes, imports. Une version antérieure gardait la source brute pour les règles
    // A et B « parce que leurs motifs sont étroits » — mesuré, c'était faux : un unique exemple
    // JSDoc, `useTranslations('leases.deposit')`, injectait dans le SOCLE de toutes les pages un
    // espace de noms qui n'existe même pas au dictionnaire, et trois autres qui pèsent 27 ko.
    const utile = retireCommentairesPleineLigne(source);
    sources.set(f, utile);
    releves.set(f, releveFichier(utile));
    for (const spec of importsDe(utile)) {
      const cible = resoudreModule(spec, f, racineSrc);
      if (cible && !fichiers.has(cible)) pile.push(cible);
    }
  }
  return { fichiers, sources, releves };
}

/**
 * L'ensemble des espaces de noms atteignables depuis `entrees`.
 *
 * Rend `{ espaces, irresolus }`. `irresolus` liste les sites dynamiques que la règle B n'a pas su
 * résoudre : la garde ÉCHOUE dessus. Les ignorer reviendrait à livrer un provider amputé d'un
 * espace dont rien n'aurait signalé l'absence — précisément le défaut que cette garde existe pour
 * empêcher.
 */
export function espacesAtteignables(entrees, racineSrc, espacesConnus, lire) {
  const { fichiers, sources, releves } = marcheGraphe(entrees, racineSrc, lire);
  const espaces = new Set();
  const irresolus = [];
  // `marcheGraphe` a déjà retiré les commentaires pleine ligne de chaque source : les récoltes
  // larges (règles B et C) relisent donc directement ce qu'il a mis en cache.
  const toutesSources = [...sources.values()];

  for (const [fichier, releve] of releves) {
    for (const e of releve.litteraux) espaces.add(e);
    if (releve.racine) for (const e of recolteRacine(sources.get(fichier), espacesConnus)) espaces.add(e);
    for (const expression of releve.dynamiques) {
      const valeurs = resoudreDynamique(expression, toutesSources).filter((v) => espacesConnus.has(premierNiveau(v)));
      if (valeurs.length === 0) irresolus.push({ fichier, expression });
      else for (const v of valeurs) espaces.add(premierNiveau(v));
    }
  }
  return { espaces, irresolus, fichiers };
}
