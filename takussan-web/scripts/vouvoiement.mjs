/**
 * Le relevé du TUTOIEMENT — fonctions pures de `check-vouvoiement.mjs` (TCK-2683, ADR-0095).
 *
 * Takussan vouvoie partout : site public (connecté ou non), publication, entrée, `/app`
 * ([ADR-0095](../../docs/adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10). Ce module dit
 * où un texte tutoie ; la garde le branche sur `src/messages/fr.json` et sur les chaînes écrites
 * dans `src/`.
 *
 * Trois familles de marques, et seulement celles qui ne sont jamais autre chose :
 *
 * 1. **Les pronoms et possessifs de la 2ᵉ personne du singulier**, partout, en toute casse — `tu`,
 *    `te`, `toi`, `ton`, `ta`, `tes`, `t’`/`t'` devant une minuscule (« t’accompagner » ; pas le
 *    `'T'H` d'un format de date), `-toi`, `-tu`. `te` n'est pas un mot d'une autre langue des
 *    sources lues : le wolof (où « te » veut dire « et ») vit dans `wo.json`, que la garde ne lit pas.
 * 2. **Les impératifs SANS HOMONYME** (`IMPERATIFS_SANS_HOMONYME` : « reviens », « attends »,
 *    « prends »…), partout et en toute casse : leur 3ᵉ personne s'écrit autrement (« revient »,
 *    « attend »), et seul « je » les précède à l'indicatif — d'où l'exclusion de « je ».
 * 3. **Les impératifs AMBIGUS** (`IMPERATIFS`), en TÊTE DE PROPOSITION seulement : début du texte,
 *    après une fin de phrase, un tiret, un deux-points, un point-virgule, une parenthèse, un
 *    guillemet ou un connecteur (« Ensuite, », « puis », « et »), en toute casse. Ailleurs, « envoie »,
 *    « garde » ou « crée » sont une 3ᵉ personne, un nom ou un participe. Plus la forme négative
 *    `N’hésite pas`, `Ne … pas` / `plus` / `jamais` sur ces mêmes verbes.
 *
 * La liste 3 est FERMÉE parce que la conjugaison ne se devine pas : « Choisis » est aussi un participe
 * (« Choisis sur Takussan et partagés avec vous »), « Envoie » une 3ᵉ personne des descriptions de la
 * console. Ces cas-là passent par une EXCEPTION nommée, avec sa raison, jamais par une tolérance.
 *
 * Ce qu'elle ne voit PAS, et le dit : un impératif ambigu au milieu d'une proposition sans connecteur
 * (« Pour finir clique ici »), un verbe hors des deux listes, et la négation sans `pas`/`plus`/`jamais`
 * (« Ne touche à rien », qui est aussi la 3ᵉ personne des niveaux d'opérateur).
 */

const LETTRE = '\\p{L}';

/** Pronoms et possessifs : un mot entier, jamais l'intérieur d'un mot (« boîte », « tête », « taux »). */
const PRONOMS = new RegExp(
  `(?<!${LETTRE})(?:tu|te|toi|ton|ta|tes)(?!${LETTRE}|['’])|(?<![${LETTRE}'’])t['’](?=\\p{Ll})|-(?:toi|tu)(?!${LETTRE})`,
  'giu',
);

/**
 * Impératifs dont aucune autre forme ne s'écrit pareil, hormis la 1ʳᵉ personne (« je viens ») :
 * jugés à toute position. Un participe (« saisis », « remplis », « choisis ») n'a rien à faire ici.
 */
export const IMPERATIFS_SANS_HOMONYME = [
  'Reviens', 'Viens', 'Attends', 'Prends', 'Reprends', 'Apprends', 'Inscris', 'Écris', 'Décris',
  'Reçois', 'Rejoins', 'Joins', 'Mets', 'Remets', 'Fais', 'Refais', 'Sois', 'Aie', 'Dis', 'Réessaie',
  'Réponds', 'Rends', 'Descends', 'Vends', 'Vas-y',
];

/** Impératifs qui sont AUSSI une 3ᵉ personne, un nom ou un participe : en tête de proposition seulement. */
export const IMPERATIFS = [
  'Essaie', 'Choisis', 'Découvre', 'Trouve', 'Publie', 'Ajoute', 'Contacte', 'Crée',
  'Connecte', 'Vérifie', 'Renseigne', 'Indique', 'Regarde', 'Laisse', 'Envoie',
  'Partage', 'Garde', 'Compare', 'Explore', 'Commence', 'Continue', 'Enregistre',
  'Clique', 'Appuie', 'Saisis', 'Retrouve', 'Accède', 'Consulte', 'Modifie', 'Élargis',
  'Tape', 'Sélectionne', 'Remplis', 'Pense', 'Va', 'Hésite', 'Oublie', 'Touche', 'Ouvre', 'Complète',
  'Précise', 'Ajuste', 'Télécharge', 'Importe', 'Dépose', 'Utilise', 'Profite', 'Passe', 'Patiente',
  'Recommence', 'Corrige', 'Confirme', 'Invite', 'Appelle', 'Cherche',
  'Finis', 'Termine', 'Supprime',
];

const ALTERNANCE = (liste) => liste.join('|');

/** Les formes sans homonyme, à toute position ; « je » les met à l'indicatif. */
const IMPERATIF_SANS_HOMONYME = new RegExp(
  `(?<!${LETTRE})(?<!je\\s+)(${ALTERNANCE(IMPERATIFS_SANS_HOMONYME)})(?!${LETTRE})`,
  'giu',
);

/** Une tête de proposition : début, fin de phrase, ponctuation forte, ouverture, ou connecteur. */
const TETE = `(?:^\\s*|[.!?…]\\s+|[—–:;(«“"]\\s*|\\n\\s*|(?<!${LETTRE})(?:ensuite|puis|alors|sinon|enfin|d['’]abord),?\\s+)`;

/**
 * Suivi d'un mot en minuscule ou d'un pronom lié (« envoie-le ») : « Partage » ou « Continue » seuls
 * sont des titres, pas des ordres.
 */
const IMPERATIF_EN_TETE = new RegExp(
  `${TETE}(${ALTERNANCE(IMPERATIFS)})(?=\\s+[a-zà-ÿ'’]|-(?:le|la|les|moi|nous|lui|leur|y|en)(?!${LETTRE}))`,
  'giu',
);

/** La négation : « N’hésite pas », « Ne garde pas », « N’oublie jamais »… sur les verbes ambigus. */
const IMPERATIF_NEGATIF = new RegExp(
  `${TETE}(n['’]|ne\\s+)(${ALTERNANCE(IMPERATIFS)})\\s+(?:pas|plus|jamais)(?!${LETTRE})`,
  'giu',
);

/** Les marques du tutoiement trouvées dans `texte`, dans l'ordre (vide : le texte vouvoie ou n'adresse personne). */
export function motsDuTutoiement(texte) {
  const trouves = [];
  for (const m of texte.matchAll(PRONOMS)) trouves.push({ position: m.index, mot: m[0] });
  for (const m of texte.matchAll(IMPERATIF_SANS_HOMONYME)) trouves.push({ position: m.index, mot: m[1] });
  for (const m of texte.matchAll(IMPERATIF_EN_TETE)) trouves.push({ position: m.index + m[0].lastIndexOf(m[1]), mot: m[1] });
  for (const m of texte.matchAll(IMPERATIF_NEGATIF)) {
    const debut = m.index + m[0].lastIndexOf(m[1] + m[2]);
    if (!trouves.some((t) => t.position === debut)) trouves.push({ position: debut, mot: `${m[1]}${m[2]}` });
  }
  const vus = new Set();
  return trouves
    .sort((a, b) => a.position - b.position)
    .filter((t) => (vus.has(t.position) ? false : vus.add(t.position)))
    .map((t) => t.mot);
}

/** Toutes les feuilles chaîne d'un dictionnaire, avec leur clé pointée. */
export function feuillesDuDictionnaire(arbre, prefixe = '') {
  const sortie = [];
  for (const [cle, valeur] of Object.entries(arbre)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle;
    if (typeof valeur === 'string') sortie.push([chemin, valeur]);
    else if (valeur && typeof valeur === 'object') sortie.push(...feuillesDuDictionnaire(valeur, chemin));
  }
  return sortie;
}

/**
 * Un segment lu comme texte JSX, sans ce qui n'est qu'un identifiant de code : un mot qui porte `_`,
 * `$` ou un chiffre, un mot tout en capitales (une constante), le nom qui suit un mot-clé de
 * déclaration, et un mot suivi de `=`, `:`, `(` ou `.` — jamais la forme d'un mot de phrase.
 */
function sansIdentifiants(segment) {
  return segment
    .replace(/(?<![\p{L}\w$])(?:const|let|var|type|interface|function|class|enum)\s+[\p{L}\w$]+/gu, ' ')
    .replace(/[\p{L}\w$]*[_$\d][\p{L}\w$]*/gu, ' ')
    .replace(/(?<![\p{L}\w$])\p{Lu}{2,}(?![\p{L}\w$])/gu, ' ')
    .replace(/[\p{L}\w$]+(?=\s*(?:=(?!=)|:|\(|\.(?=\p{L})))/gu, ' ');
}

/**
 * Les chaînes ÉCRITES d'un fichier TS/TSX : littéraux `'…'`, `"…"`, morceaux de gabarit `` `…` `` et,
 * en TSX, le texte entre deux balises. Les commentaires sont ignorés — ils s'adressent au
 * développeur, pas à la personne qui lit l'écran.
 *
 * Un lexeur minimal, sans dépendance (la leçon de `i18n-scan.mjs`, J-40) : il tient l'état
 * code / commentaire / chaîne / gabarit (avec ses `${…}` imbriqués) et reconnaît un littéral
 * d'expression régulière par le jeton qui le précède, faute de quoi un `/['"]/` ouvrirait une
 * chaîne fantôme jusqu'à la fin du fichier.
 */
export function chainesDuSource(source, { tsx = false } = {}) {
  const s = source;
  const n = s.length;
  const debuts = [0];
  for (let k = 0; k < n; k += 1) if (s.charCodeAt(k) === 10) debuts.push(k + 1);
  const ligneDe = (pos) => {
    let bas = 0;
    let haut = debuts.length - 1;
    while (bas < haut) {
      const milieu = (bas + haut + 1) >> 1;
      if (debuts[milieu] <= pos) bas = milieu;
      else haut = milieu - 1;
    }
    return bas + 1;
  };

  const sortie = [];
  // Le code seul (chaînes et commentaires remplacés par des espaces) : c'est là que se lit le texte JSX.
  const code = s.split('');
  const blanchir = (de, a) => {
    for (let k = de; k < a; k += 1) if (code[k] !== '\n') code[k] = ' ';
  };
  /** Pile des accolades : `true` pour celle qui ferme un `${` et rend la main au gabarit. */
  const pile = [];
  let dernier = '';
  let i = 0;

  const lireGabarit = () => {
    // `i` est juste après le `` ` `` ou le `}` qui rouvre le gabarit.
    let debut = i;
    while (i < n) {
      const c = s[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') {
        sortie.push({ ligne: ligneDe(debut), texte: s.slice(debut, i) });
        blanchir(debut, i);
        i += 1;
        dernier = 'x';
        return;
      }
      if (c === '$' && s[i + 1] === '{') {
        sortie.push({ ligne: ligneDe(debut), texte: s.slice(debut, i) });
        blanchir(debut, i);
        pile.push(true);
        i += 2;
        dernier = '{';
        return;
      }
      i += 1;
    }
    debut = n;
  };

  while (i < n) {
    const c = s[i];
    if (c === '/' && s[i + 1] === '/') {
      const fin = s.indexOf('\n', i);
      const a = fin < 0 ? n : fin;
      blanchir(i, a);
      i = a;
      continue;
    }
    if (c === '/' && s[i + 1] === '*') {
      const fin = s.indexOf('*/', i + 2);
      const a = fin < 0 ? n : fin + 2;
      blanchir(i, a);
      i = a;
      continue;
    }
    if (c === '"' || c === "'") {
      const debut = i + 1;
      let k = debut;
      while (k < n && s[k] !== c && s[k] !== '\n') k += s[k] === '\\' ? 2 : 1;
      sortie.push({ ligne: ligneDe(debut), texte: s.slice(debut, k) });
      blanchir(debut, k);
      i = k + 1;
      dernier = 'x';
      continue;
    }
    if (c === '`') {
      i += 1;
      lireGabarit();
      continue;
    }
    if (c === '/' && !/[\w$)\]x]/.test(dernier)) {
      // Littéral d'expression régulière : jusqu'au `/` qui ne s'échappe pas et n'est pas dans une classe.
      let k = i + 1;
      let classe = false;
      while (k < n && s[k] !== '\n') {
        if (s[k] === '\\') { k += 2; continue; }
        if (s[k] === '[') classe = true;
        else if (s[k] === ']') classe = false;
        else if (s[k] === '/' && !classe) break;
        k += 1;
      }
      blanchir(i, k + 1);
      i = k + 1;
      dernier = 'x';
      continue;
    }
    if (c === '{') pile.push(false);
    if (c === '}') {
      if (pile.pop() === true) {
        i += 1;
        lireGabarit();
        continue;
      }
    }
    if (!/\s/.test(c)) dernier = /[\w$]/.test(c) ? 'x' : c;
    i += 1;
  }

  if (tsx) {
    // Le texte JSX : tout segment entre `>` ou `}` et `<` ou `{` — donc aussi la suite d'une
    // expression (« <p>{nom}, vérifie ton adresse</p> ») et le texte qui porte une parenthèse, un
    // `;` ou un `&`. Le code ordinaire en attrape aussi des segments (`} else {`, `a > b) {`) : ils ne
    // `;` ou un `&`. Le code ordinaire en attrape aussi des segments (`} else {`, `a > b) {`) : on y
    // efface ce qui ne peut être qu'un identifiant (`TON_PAR_STATUT`, `const TON`, `type Ton =`)
    // avant de juger — mesuré sur `src/` entier, il n'en reste aucun faux positif.
    const nu = code.join('');
    for (const m of nu.matchAll(/[>}]([^<>{}]+)(?=[<{])/g)) {
      const texte = sansIdentifiants(m[1]);
      if (/\p{L}{2}/u.test(texte)) sortie.push({ ligne: ligneDe(m.index + 1), texte });
    }
  }
  return sortie;
}

/**
 * Les écarts : `{ ou, mot, texte }` pour chaque texte qui tutoie et qu'aucune exception ne couvre,
 * plus les exceptions fautives (sans raison, ou qui ne couvrent plus rien — une exception morte est
 * une tolérance qui attend son prochain abus).
 *
 * `ou` vaut la clé (`publicProfileIndex.join.title`) pour le dictionnaire, `chemin:ligne` pour une
 * source ; une exception se nomme par la clé, ou par `chemin` pour une source.
 */
export function verifier({ dictionnaire, fichiers, exceptions }) {
  const ecarts = [];
  const exceptionsFautives = [];
  const parCle = new Map();
  for (const e of exceptions) {
    if (!e.raison || !String(e.raison).trim()) exceptionsFautives.push(`${e.cle} : exception sans raison`);
    else parCle.set(e.cle, { ...e, servie: false });
  }
  const couvre = (cle) => {
    const e = parCle.get(cle);
    if (!e) return false;
    e.servie = true;
    return true;
  };

  for (const [cle, valeur] of feuillesDuDictionnaire(dictionnaire)) {
    const mots = motsDuTutoiement(valeur);
    if (mots.length && !couvre(cle)) ecarts.push({ ou: cle, mot: mots[0], texte: valeur });
  }
  for (const { chemin, source } of fichiers) {
    for (const { ligne, texte } of chainesDuSource(source, { tsx: chemin.endsWith('.tsx') })) {
      // Une phrase a au moins deux mots : un littéral d'un seul mot est un identifiant (la prop
      // `ton: 'clair' | 'sombre'` de `PastilleCredits`), jamais un texte adressé à quelqu'un.
      if (!/\S\s+\S/u.test(texte)) continue;
      const mots = motsDuTutoiement(texte);
      if (mots.length && !couvre(chemin)) ecarts.push({ ou: `${chemin}:${ligne}`, mot: mots[0], texte: texte.trim() });
    }
  }
  for (const e of parCle.values()) {
    if (!e.servie) exceptionsFautives.push(`${e.cle} : l'exception ne couvre plus aucun texte — la retirer`);
  }
  return { ecarts, exceptionsFautives };
}
