#!/usr/bin/env node
/**
 * Garde : aucun code de `takussan-api/app/` ne lit un média par son CHEMIN LOCAL (TCK-539).
 *
 * **Ce qu'elle interdit.** `->getPath(` et `getFirstMediaPath(` dans `takussan-api/app/`, hors
 * d'une liste d'exceptions justifiées une par une. Un média se lit par son disque —
 * `Storage::disk($media->disk)` et `$media->getPathRelativeToRoot()` — ou, pour ce qui sort vers
 * un client, par `App\Services\Media\PrivateMediaAccess` (flux, URL présignée, copie temporaire).
 *
 * **Pourquoi elle existe.** ADR-0029 range les médias dans R2. Sur un disque S3, `getPath()` ne
 * rend pas un fichier : il rend la clé de l'objet (`12/cni.pdf`), qui n'existe sur aucun système
 * de fichiers. Relevé le 2026-09-21, cinq chemins en dépendaient — `response()->file(getPath())`
 * pour les pièces KYC, `file_get_contents(getPath())` pour les liens de partage, `download(getPath())`
 * pour les versions de documents, le lecteur CSV des relevés bancaires, et le filigrane qui
 * réécrivait ses conversions sur place. **Aucun ne rougissait**, parce que le disque de
 * développement et de test était local : le défaut n'apparaît qu'au premier fichier en R2, c'est-
 * à-dire en préproduction, sur la fonctionnalité que personne n'a pensé à rouvrir.
 *
 * *Un appel qui marche sur le disque de développement et meurt sur celui de production ne se voit
 * pas à la relecture : il se voit à la première requête d'un client.*
 *
 * ## Les exceptions
 *
 * Chacune nomme son fichier, la forme exacte de la ligne tolérée, et pourquoi. Deux sortes :
 *
 *   · PERMANENTE — l'appel n'est pas celui d'un média (`PathGenerator::getPath()` rend un
 *     répertoire RELATIF, pas un chemin local). Une permanente qui ne correspond plus à rien fait
 *     ÉCHOUER la garde : une exception morte est une porte ouverte que plus personne ne surveille.
 *   · TEMPORAIRE — un chantier en cours qui la retirera. Périmée, elle n'échoue pas : elle
 *     s'imprime en avertissement, pour que la session qui ferme le chantier la supprime.
 *
 * ## Ce qu'elle NE prouve PAS — l'angle mort
 *
 *   · Elle cherche une FORME, pas un type. `$disk->path($media->getPathRelativeToRoot())` — le même
 *     défaut, écrit par le disque — la satisfait. `Storage::path(`, `->getLocalPath(` aussi.
 *   · Elle ne voit pas l'autre moitié de TCK-539 : une URL DIRECTE de fichier privé exposée par
 *     `getFullUrl()` / `getUrl()` / `getFirstMediaUrl()`. Ces appels sont légitimes sur une
 *     collection publique ; les distinguer demanderait de connaître le disque de chaque collection.
 *   · Elle ne regarde que `app/`. Un `getPath()` dans `database/seeders/` ou `routes/` lui échappe.
 *   · Les appels DYNAMIQUES lui échappent, délibérément : `$m->$fn()`, `$m->{'getPath'}()`,
 *     `call_user_func([$m, 'getPath'])`, `[$m, 'getPath'](…)`. Les attraper demanderait de suivre
 *     des valeurs, pas des formes ; une regex sur `'getPath'` entre guillemets rougirait sur des
 *     messages et n'attraperait pas `$fn = 'get'.'Path'`. Relevé par la vérification adverse du
 *     2026-09-21.
 *   · Elle lit le PHP avec un analyseur à la main, pas avec le lexer de PHP. Chaînes `'…'`, `"…"`,
 *     `` `…` ``, heredoc et nowdoc, commentaires et HTML en ligne sont suivis. Les limites qui
 *     restent :
 *       – FAUX VERT : les balises courtes `<?` ne sont pas reconnues comme ouverture. Le code qui
 *         suit `?> … <?` est effacé comme du HTML (désactivées par défaut depuis PHP 8, aucune dans
 *         `app/`).
 *       – FAUX VERT : une interpolation qui contient elle-même des guillemets, comme
 *         `"{$a["?>"]}"`. La chaîne se referme au guillemet intérieur, et un `?>` ou un `/*`
 *         qui suit est lu comme du code. Aucune n'existe dans `app/`.
 *       – FAUX VERT : un heredoc dont une interpolation `{$a[` court sur plusieurs lignes, avec à
 *         l'intérieur une ligne qui commence par l'étiquette (la constante `EOT`). La garde y voit
 *         la fermeture, alors que PHP est encore dans l'interpolation : un `?>` ou un `/*` qui suit
 *         dans le corps efface la suite, et l'appel qui vient après passe. Aucun dans `app/`.
 *       – FAUX ROUGE : un `$m->getPath()` sans accolades dans un heredoc ou une chaîne `"…"`
 *         est signalé. PHP n'y interpole que la propriété `$m->getPath`, sans appel.
 *
 * Elle est un cliquet contre la ré-introduction, pas une preuve d'indépendance au disque : celle-ci
 * se prouve par les tests sur `Tests\Support\RemoteDiskFake`, où `getPath()` rend un chemin
 * inexistant comme en production. (`Storage::fake('r2-private')` ne le prouve PAS : c'est un disque
 * local, et `getPath()` y marche.)
 *
 * ## Le mode de défaillance qu'elle refuse : passer au vert en ne voyant rien
 *
 * Deux vérifications actives, chacune sortant en 1 :
 *   1. `takussan-api/app/` porte un nombre plausible de fichiers PHP ;
 *   2. la cible de la convergence, `PrivateMediaAccess.php`, existe et lit bien par
 *      `Storage::disk($media->disk)` — si elle disparaissait, « 0 getPath » ne dirait plus rien de
 *      la façon dont les fichiers sortent.
 *
 * ## Ses propres tests
 *
 * `CAS_EPREUVE`, plus bas : des fragments PHP qu'elle DOIT attraper (à la bonne ligne) et d'autres
 * qu'elle doit laisser passer. Ils tournent à CHAQUE exécution, avant le balayage : une garde dont
 * le motif régresse sort en 1 sur elle-même, avant de rendre un vert sur l'arbre. Chaque forme y
 * est entrée parce qu'une vérification adverse l'a fait passer (2026-09-21).
 *
 * Usage :
 *   node scripts/check-media-getpath.mjs            # garde, sort en 1 à la moindre violation
 *   node scripts/check-media-getpath.mjs --report   # + l'inventaire balayé et les exceptions
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const APP = join(ROOT, 'takussan-api', 'app');
const CIBLE = join(APP, 'Services', 'Media', 'PrivateMediaAccess.php');

/** Plancher de plausibilité, bien sous le compte réel (~770 fichiers PHP le 2026-09-21). */
const PLANCHER_FICHIERS = 300;

// Insensibles à la CASSE : PHP résout les méthodes sans elle — `$m->GetPath()` s'exécute (relevé
// par la vérification adverse, 2026-09-21, où ces formes passaient en 0).
//
// Les blancs, SAUTS DE LIGNE COMPRIS, sont tolérés entre `->` (ou `?->`) et le nom : `$m -> getPath()`,
// `$m?-> getPath()` et `$m->` en fin de ligne suivi de `getPath()` sont du PHP valide, et passaient
// en 0 tant que la recherche se faisait ligne par ligne (vérification adverse, passe 2). La
// recherche porte donc sur le TEXTE ENTIER du fichier, commentaires retirés.
const FORMES = [
  { re: /->\s*getPath\s*\(/gi, quoi: '`->getPath(` — chemin LOCAL d\'un média' },
  { re: /getFirstMediaPath\s*\(/gi, quoi: '`getFirstMediaPath(` — chemin LOCAL du premier média d\'une collection' },
];

/**
 * Remplace les commentaires PHP par des espaces, en gardant les sauts de ligne — donc les numéros
 * de ligne. Juger sur le DÉBUT de ligne (`*`, `/*`, `//`) sautait du code réel :
 * `/* x *\/ return …getPath()` et une continuation `    * filesize($m->getPath())` passaient.
 *
 * Suit les chaînes `'…'`, `"…"` et `` `…` `` (échappements compris), les heredoc et les nowdoc,
 * pour qu'un `//` d'URL, un `/*` ou un `?>` cité n'ouvre ni commentaire ni HTML. `#` est un
 * commentaire, `#[` un attribut PHP 8 ; un commentaire d'une ligne s'arrête au premier `?>`, comme
 * en PHP. Le HTML en ligne — avant le premier `<?php`/`<?=` (casse indifférente) et entre chaque
 * `?>` et l'ouverture suivante — est effacé : ni commentaire ni chaîne n'y commence. Ce qu'elle ne
 * suit pas : voir l'angle mort de l'en-tête.
 */
function sansCommentaires(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blanc = (t) => t.replace(/[^\n]/g, ' ');
  // Un fichier PHP COMMENCE en HTML : jusqu'au premier `<?php` / `<?=`, et de nouveau après chaque
  // `?>`, le texte n'est ni commentaire ni chaîne. Un `/*` ou un `#` dans ce HTML n'ouvre rien
  // (vérification adverse, passe 4 : `?> /* <?php return $m->getPath();` passait en 0).
  const ouverture = /<\?(?:php\b|=)/gi;
  const versHtml = (depuis) => {
    ouverture.lastIndex = depuis;
    const m = ouverture.exec(src);
    const j = m ? m.index + m[0].length : n;
    out += blanc(src.slice(depuis, j));
    return j;
  };
  // Heredoc / nowdoc : `<<<ETQ`, `<<<"ETQ"` ou `<<<'ETQ'`, puis un saut de ligne ; la fermeture est
  // la première ligne qui commence par l'étiquette — indentée ou non (PHP 7.3+) — non suivie d'un
  // caractère d'identifiant (`EOTX` ne ferme pas `EOT`), et donc suivie de `;`, `,`, `)` ou fin de
  // ligne. Le corps n'est ni commentaire ni `?>` (vérification adverse, passe 5 : `?>` dans un
  // heredoc effaçait la suite du fichier). Celui d'un heredoc est gardé tel quel — `{$m->getPath()}`
  // y interpole un vrai appel —, celui d'un nowdoc est effacé : il n'interpole rien.
  const ID = '[A-Za-z_\\x80-\\uffff][A-Za-z0-9_\\x80-\\uffff]*';
  const ouvertureDoc = new RegExp(`<<<[ \\t]*(?:(${ID})|"(${ID})"|'(${ID})')\\r?\\n`, 'y');
  const doc = (depuis) => {
    ouvertureDoc.lastIndex = depuis;
    const m = ouvertureDoc.exec(src);
    if (!m) return null;
    const corps = depuis + m[0].length;
    const fermeture = new RegExp(`^[ \\t]*${m[1] ?? m[2] ?? m[3]}(?![A-Za-z0-9_\\x80-\\uffff])`, 'gm');
    fermeture.lastIndex = corps;
    const f = fermeture.exec(src);
    // Non refermé : ce n'est pas du PHP valide. On ne le suit pas, pour ne rien effacer à tort.
    if (!f) return null;
    const texte = src.slice(corps, f.index);
    return { texte: src.slice(depuis, corps) + (m[3] ? blanc(texte) : texte) + f[0], fin: f.index + f[0].length };
  };
  i = versHtml(0);
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    const h = c === '<' && d === '<' ? doc(i) : null;
    if (h) {
      out += h.texte;
      i = h.fin;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '?' && d === '>') {
      i = versHtml(i);
    } else if (c === '/' && d === '*') {
      const fin = src.indexOf('*/', i + 2);
      const j = fin === -1 ? n : fin + 2;
      out += blanc(src.slice(i, j));
      i = j;
    } else if ((c === '/' && d === '/') || (c === '#' && d !== '[')) {
      // En PHP, un commentaire d'une ligne s'arrête à la fin de ligne OU au premier `?>` :
      // `// fin ?> <?php return $m->getPath();` exécute l'appel (vérification adverse, passe 3).
      // Le `?>` lui-même n'est pas consommé : la boucle le lit et passe en HTML.
      let j = src.indexOf('\n', i);
      if (j === -1) j = n;
      const fermeture = src.indexOf('?>', i);
      if (fermeture !== -1 && fermeture < j) j = fermeture;
      out += blanc(src.slice(i, j));
      i = j;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/**
 * @type {{ fichier: string, ligne: RegExp, sorte: 'permanente'|'temporaire', motif: string }[]}
 */
const EXCEPTIONS = [
  {
    fichier: 'takussan-api/app/Console/Commands/MediaMoveDisk.php',
    ligne: /\$generator->getPath\(\$media\)/,
    sorte: 'permanente',
    motif: "`PathGenerator::getPath()` rend le répertoire RELATIF d'un média sur son disque, pas un chemin local — c'est la clé que la commande copie d'un disque à l'autre (TCK-538).",
  },
];

const rel = (p) => relative(ROOT, p).split(sep).join('/');

/**
 * Toutes les occurrences des FORMES dans `src`, commentaires retirés.
 * `n` est la ligne (1-based) où commence le NOM de la méthode ; `contexte` est le texte nettoyé des
 * lignes que l'occurrence couvre — c'est sur lui que se juge une exception.
 *
 * @returns {{ n: number, quoi: string, contexte: string }[]}
 */
function occurrences(src) {
  const net = sansCommentaires(src);
  const lignes = net.split('\n');
  const ligneDe = (index) => net.slice(0, index).split('\n').length;
  const trouvees = [];
  for (const { re, quoi } of FORMES) {
    for (const m of net.matchAll(re)) {
      const debut = ligneDe(m.index);
      const fin = ligneDe(m.index + m[0].length - 1);
      const nom = ligneDe(m.index + m[0].search(/[a-z]/i));
      trouvees.push({ n: nom, quoi, contexte: lignes.slice(debut - 1, fin).join('\n') });
    }
  }
  return trouvees.sort((a, b) => a.n - b.n);
}

/**
 * Les tests de la garde. `ligne` : la ligne attendue de la PREMIÈRE occurrence, `null` : aucune.
 * Chaque fragment est précédé de `<?php\n` : la ligne 2 est sa première ligne.
 */
const CAS_EPREUVE = [
  // doit attraper
  { php: '$x = $m->getPath();', ligne: 2 },
  { php: '$x = $m->GetPath();', ligne: 2 },
  { php: '$x = $m->getpath();', ligne: 2 },
  { php: '$x = $a->GETFIRSTMEDIAPATH("logo");', ligne: 2 },
  { php: '$x = $m -> getPath();', ligne: 2 },
  { php: '$x = $m?-> getPath();', ligne: 2 },
  { php: '$x = $m?->getPath();', ligne: 2 },
  { php: '$x = $m->\n    getPath();', ligne: 3 },
  { php: '$x = $m\n    ->\n    getPath();', ligne: 4 },
  { php: '$x = $m->/* glisse */getPath();', ligne: 2 },
  { php: '/* x */ return file_get_contents($m->getPath());', ligne: 2 },
  { php: '$t = $a\n    * filesize($m->getPath());', ligne: 3 },
  { php: '$u = "https://x.test/"; $p = $m->getPath();', ligne: 2 },
  { php: '#[Attr] public function f() { return $m->getPath(); }', ligne: 2 },
  // passe 3 — un commentaire d'une ligne s'arrête à `?>`
  { php: '// fin ?> <?php return $m->getPath();', ligne: 2 },
  { php: '# fin ?> <?php return $m->getPath();', ligne: 2 },
  // passe 4 — le HTML entre `?>` et `<?php` n'ouvre ni commentaire ni chaîne
  { php: '?> /* <?php return $m->getPath();', ligne: 2 },
  { php: '// ?> /* <?php return $m->getPath();', ligne: 2 },
  { php: '# ?> <!-- # --> <?php return $m->getPath();', ligne: 2 },
  { php: '// x ?><?php $m->getPath();', ligne: 2 },
  { php: '?> <p>texte</p> <?= $m->getPath() ?>', ligne: 2 },
  { php: '?> <p>$m->getPath()</p> <?php $ok = 1;', ligne: null },
  { php: '?>\n<?PHP return $m->getPath();', ligne: 3 },
  // passe 5 — un `?>` ou un `/*` cité dans un heredoc, un nowdoc ou des accents graves n'est pas du code
  { php: '$s = <<<EOT\n?> fin\nEOT;\nreturn $m->getPath();', ligne: 5 },
  { php: '$s = <<<"EOT"\n?> fin\nEOT;\nreturn $m->getPath();', ligne: 5 },
  { php: "$s = <<<'EOT'\n?> fin\nEOT;\nreturn $m->getPath();", ligne: 5 },
  { php: '$s = <<<EOT\n  ?> fin\n  EOT;\nreturn $m->getPath();', ligne: 5 },
  { php: '$s = <<<EOT\nEOTX ?>\nEOT;\nreturn $m->getPath();', ligne: 5 },
  { php: 'f(<<<EOT\n?> fin\nEOT, $m->getPath());', ligne: 4 },
  { php: '$s = <<<EOT\n/* fin\nEOT;\nreturn $m->getPath();', ligne: 5 },
  { php: '$x = `echo ?>`; return $m->getPath();', ligne: 2 },
  { php: '$s = <<<EOT\n x {$m->getPath()}\nEOT;', ligne: 3 },
  { php: "$s = <<<'EOT'\n$m->getPath()\nEOT;", ligne: null },
  // passe 3 — `getFirstMediaPath` : blancs et sauts de ligne après `->` et avant `(`
  { php: '$p = $a->getFirstMediaPath ("logo");', ligne: 2 },
  { php: '$p = $a -> getFirstMediaPath("logo");', ligne: 2 },
  { php: '$p = $a->getFirstMediaPath\n    ("logo");', ligne: 2 },
  { php: '$p = $a\n    ->\n    getFirstMediaPath\n    ("logo");', ligne: 4 },
  // doit laisser passer
  { php: '/** doc : ->getPath( */ $ok = 1;', ligne: null },
  { php: '// ->getPath( et getFirstMediaPath(', ligne: null },
  { php: '# $m->getPath()', ligne: null },
  { php: '/*\n * $m->getPath()\n */', ligne: null },
  { php: '$p = $m->getPathRelativeToRoot();', ligne: null },
  { php: '$p = $g->getPathForConversions($m);', ligne: null },
];

const echecsEpreuve = CAS_EPREUVE.filter(({ php, ligne }) => {
  const trouvees = occurrences(`<?php\n${php}`);
  return ligne === null ? trouvees.length > 0 : trouvees[0]?.n !== ligne;
});
if (echecsEpreuve.length > 0) {
  console.error(`✗ la garde échoue sur ${echecsEpreuve.length} de ses propres cas d'épreuve :\n`);
  for (const { php, ligne } of echecsEpreuve) {
    const vu = occurrences(`<?php\n${php}`)[0]?.n ?? 'rien';
    console.error(`  · ${JSON.stringify(php)} — attendu ${ligne === null ? 'rien' : `ligne ${ligne}`}, vu ${vu}`);
  }
  console.error("\n  Son motif a régressé : un vert sur l'arbre ne vaudrait rien. Corrige le motif, jamais le cas.");
  process.exit(1);
}

/** @returns {string[]} chemins absolus de tous les .php sous `dir` */
function phpSous(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...phpSous(p));
    else if (e.isFile() && e.name.endsWith('.php')) out.push(p);
  }
  return out;
}

const fichiers = phpSous(APP).sort();

// (1) le balayage voit-il le code ?
if (fichiers.length < PLANCHER_FICHIERS) {
  console.error(`✗ seulement ${fichiers.length} fichier(s) PHP sous ${rel(APP)} (plancher : ${PLANCHER_FICHIERS}).`);
  console.error('  Un balayage vide ne trouve aucune violation : ce vert-là ne vaudrait rien.');
  console.error('  Si le répertoire a légitimement bougé, corrige ce script — jamais en abaissant le seuil à 0.');
  process.exit(1);
}

// (2) la cible de la convergence existe-t-elle, et lit-elle par le disque ?
if (!existsSync(CIBLE)) {
  console.error(`✗ ${rel(CIBLE)} est introuvable — la garde ne sait plus vers quoi elle fait converger.`);
  process.exit(1);
}
if (!/Storage::disk\(\$media->disk\)/.test(readFileSync(CIBLE, 'utf8'))) {
  console.error(`✗ ${rel(CIBLE)} ne lit plus par \`Storage::disk($media->disk)\`.`);
  console.error("  C'est la seule forme indépendante du disque : si la porte de sortie ne l'emploie plus,");
  console.error('  « 0 getPath » ne dit plus rien de la façon dont les fichiers privés sortent.');
  process.exit(1);
}

const violations = [];
const toleres = [];
const exceptionsVues = new Set();

for (const f of fichiers) {
  const r = rel(f);
  const brut = readFileSync(f, 'utf8');
  const lignesBrutes = brut.split('\n');
  // On ne juge pas les commentaires — le code qui a retiré ces appels les nomme pour s'expliquer —
  // mais on les RETIRE avant de lire (`occurrences()`), au lieu de sauter les lignes qui en ont l'air.
  for (const { n, quoi, contexte } of occurrences(brut)) {
    const nu = lignesBrutes[n - 1].trim();
    const exc = EXCEPTIONS.find((e) => e.fichier === r && e.ligne.test(contexte));
    if (exc) {
      exceptionsVues.add(exc);
      toleres.push({ r, n, exc, ligne: nu });
    } else {
      violations.push({ r, n, quoi, ligne: nu });
    }
  }
}

const permanentesMortes = EXCEPTIONS.filter((e) => e.sorte === 'permanente' && !exceptionsVues.has(e));
const temporairesPerimees = EXCEPTIONS.filter((e) => e.sorte === 'temporaire' && !exceptionsVues.has(e));

if (REPORT) {
  console.log(`Balayage   : ${fichiers.length} fichiers PHP sous ${rel(APP)}`);
  console.log(`Cible      : ${rel(CIBLE)} (lit par Storage::disk($media->disk) — vérifié)`);
  console.log(`Formes     : ${FORMES.length} — ${FORMES.map((x) => x.quoi).join(' ; ')}`);
  console.log(`Exceptions : ${EXCEPTIONS.length} (${EXCEPTIONS.filter((e) => e.sorte === 'permanente').length} permanente(s))`);
  for (const t of toleres) console.log(`  toléré · ${t.r}:${t.n} [${t.exc.sorte}] ${t.exc.motif}`);
  console.log(`Violations : ${violations.length}\n`);
}

for (const e of temporairesPerimees) {
  console.warn(`⚠ exception TEMPORAIRE périmée — ${e.fichier} ne contient plus l'appel toléré.`);
  console.warn(`    ${e.motif}`);
  console.warn('    Retire-la de EXCEPTIONS dans scripts/check-media-getpath.mjs.');
}

let echec = false;

if (permanentesMortes.length > 0) {
  echec = true;
  console.error(`\n✗ ${permanentesMortes.length} exception(s) PERMANENTE(s) ne correspondent plus à aucune ligne :\n`);
  for (const e of permanentesMortes) {
    console.error(`  · ${e.fichier}  ${e.ligne}`);
    console.error(`      ${e.motif}`);
  }
  console.error("\n  Une exception morte est une porte ouverte que plus personne ne surveille : retire-la.");
}

if (violations.length > 0) {
  echec = true;
  console.error(`\n✗ ${violations.length} lecture(s) d'un média par son chemin local :\n`);
  for (const v of violations) {
    console.error(`  · ${v.r}:${v.n}  ${v.quoi}`);
    console.error(`      ${v.ligne}`);
  }
  console.error(`
  Sur R2 (ADR-0029), \`getPath()\` rend la CLÉ de l'objet — \`12/cni.pdf\` —, pas un fichier.
  Lire par le disque du média :

    use App\\Services\\Media\\PrivateMediaAccess;

    $access->stream($media, 'inline');          // flux servi par l'API
    $access->redirect($media, 'attachment');    // URL présignée de 5 minutes
    $access->signedUrl($media);                 // dans une ressource JSON, à la place de l'URL
    $access->withLocalCopy($media, fn (string $path) => …);   // bibliothèque qui exige un chemin

    Storage::disk($media->disk)->get($media->getPathRelativeToRoot());   // les octets, sans plus

  Si l'appel n'est PAS celui d'un média, ajoute une exception justifiée dans EXCEPTIONS.
  Et éprouve le chemin sur Tests\\Support\\RemoteDiskFake — Storage::fake() est un disque
  local, où getPath() marche : le test resterait vert sur le défaut.
`);
}

if (echec) process.exit(1);

console.log(`✓ médias : ${fichiers.length} fichiers balayés, 0 lecture par chemin local — ${toleres.length} appel(s) toléré(s) par exception.`);
console.log('  ⚠ PORTÉE : cherche une forme, pas un type. `$disk->path(...)` et les URL directes de');
console.log('    fichiers privés (`getFullUrl()`) lui échappent — voir l\'en-tête.');
process.exit(0);
