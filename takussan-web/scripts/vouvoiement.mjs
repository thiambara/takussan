/**
 * Le relevé du TUTOIEMENT — fonctions pures de `check-vouvoiement.mjs` (TCK-2683, ADR-0095).
 *
 * Takussan vouvoie partout : site public (connecté ou non), publication, entrée, `/app`
 * ([ADR-0095](../../docs/adr/0095-le-ton-suit-la-session.md), révisé le 2026-11-10). Ce module dit
 * où un texte tutoie ; la garde le branche sur `src/messages/fr.json` et sur les chaînes écrites
 * dans `src/`.
 *
 * Deux familles de marques, et seulement celles qui ne sont jamais autre chose :
 *
 * 1. **Les pronoms et possessifs de la 2ᵉ personne du singulier** — `tu`, `toi`, `ton`, `ta`, `tes`,
 *    `t’`/`t'` devant une minuscule (« t’accompagner » ; pas le `'T'H` d'un format de date), `-toi`,
 *    `-tu`. `te` est écarté : il n'apparaît en français qu'avec
 *    un verbe déjà au tutoiement, que l'un des autres motifs attrape, et il est un mot courant
 *    d'autres langues présentes dans les sources.
 * 2. **Une liste FERMÉE d'impératifs au singulier en tête de phrase** (« Essaie », « Reviens »…).
 *    Fermée parce que la conjugaison ne se devine pas : « Choisis » est aussi un participe
 *    (« Choisis sur Takussan et partagés avec vous »), « Envoie » une 3ᵉ personne des descriptions
 *    de la console. Ces cas-là passent par une EXCEPTION nommée, avec sa raison, jamais par une
 *    tolérance.
 *
 * Insensible à la casse pour les pronoms (« Ton agence… ») ; les impératifs ne sont cherchés qu'en
 * tête de phrase, avec leur majuscule.
 */

const LETTRE = '\\p{L}';

/** Pronoms et possessifs : un mot entier, jamais l'intérieur d'un mot (« boîte », « tête », « taux »). */
const PRONOMS = new RegExp(
  `(?<!${LETTRE})(?:tu|toi|ton|ta|tes)(?!${LETTRE}|['’])|(?<![${LETTRE}'’])t['’](?=\\p{Ll})|-(?:toi|tu)(?!${LETTRE})`,
  'giu',
);

/** La liste du relevé de TCK-2683 — elle ne s'allonge que par un cas mesuré. */
export const IMPERATIFS = [
  'Essaie', 'Reviens', 'Choisis', 'Découvre', 'Trouve', 'Publie', 'Ajoute', 'Contacte', 'Crée',
  'Connecte', 'Inscris', 'Vérifie', 'Renseigne', 'Indique', 'Regarde', 'Laisse', 'Envoie', 'Écris',
  'Partage', 'Garde', 'Reçois', 'Compare', 'Explore', 'Commence', 'Continue', 'Prends', 'Enregistre',
  'Clique', 'Appuie', 'Saisis', 'Retrouve', 'Rejoins', 'Accède', 'Consulte', 'Modifie', 'Élargis',
  'Tape', 'Mets', 'Fais',
];

/** En tête du texte, ou après une fin de phrase ; suivi d'un mot en minuscule (« Partage » seul est un titre). */
const IMPERATIF_EN_TETE = new RegExp(
  `(?:^|[.!?…]\\s+)(${IMPERATIFS.join('|')}) (?=[a-zà-ÿ])`,
  'gu',
);

/** Les marques du tutoiement trouvées dans `texte`, dans l'ordre (vide : le texte vouvoie ou n'adresse personne). */
export function motsDuTutoiement(texte) {
  const trouves = [];
  for (const m of texte.matchAll(PRONOMS)) trouves.push({ position: m.index, mot: m[0] });
  for (const m of texte.matchAll(IMPERATIF_EN_TETE)) trouves.push({ position: m.index + m[0].indexOf(m[1]), mot: m[1] });
  return trouves.sort((a, b) => a.position - b.position).map((t) => t.mot);
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
    // Le texte JSX : entre `>` et `<` ou `{`, sans rien qui ressemble à du code.
    const nu = code.join('');
    for (const m of nu.matchAll(/>([^<>{}();=&|]+)(?=[<{])/g)) {
      if (/\p{L}{2}/u.test(m[1])) sortie.push({ ligne: ligneDe(m.index + 1), texte: m[1] });
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
