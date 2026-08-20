#!/usr/bin/env node
/**
 * Garde du FORMAT DES DATES SUR LE FIL (ADR-0018, TCK-327) : toute date qu'une ressource d'API
 * ÉMET passe par `BaseResource::iso()` — un instant, `2026-08-17T12:34:56+00:00` — ou par
 * `BaseResource::calendarDate()` — une date calendaire, `2026-08-17`. Rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE, ET POURQUOI ELLE A ÉTÉ RETOURNÉE LE 2026-08-20
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **L'histoire d'origine.** Mesuré le 2026-08-20, avant conversion, sur les 45 fichiers de
 * `takussan-api/app/Http/Resources/` : 138 lignes émettaient une date sous QUATRE appels distincts
 * pour TROIS chaînes distinctes — 55 `toISOString()` (`…T12:34:56.000000Z`), 37
 * `toIso8601String()`, 28 `$this->iso(…)` et 18 `toDateString()`. Les trois cohabitaient parfois
 * dans le même fichier : `KycDossierResource` mélangeait `iso()` et `toISOString()` à quatre lignes
 * d'intervalle. `PlatformPayout::$casts` déclare `period_start` en `'date'` — une période
 * comptable, sans heure — et la ressource l'émettait par `iso()`, donc `2026-08-17T00:00:00+00:00`,
 * quand les DEUX autres ressources portant le même couple de champs sur le même cast
 * (`PayoutResource`, `Accounting/BankStatementResource`) émettaient `2026-08-17`. Le même concept,
 * le même cast, deux contrats.
 *
 * **La première version de cette garde était une LISTE NOIRE D'APPELS, et c'était le mauvais
 * objet.** Elle refusait `toISOString()`, `toIso8601String()`, `toDateString()`,
 * `toDateTimeString()`, `->format(`… — c'est-à-dire les façons d'écrire une conversion À LA MAIN.
 * Elle ne voyait donc RIEN de la façon la plus courte, la plus naturelle et la plus fréquente
 * d'émettre une date depuis un `toArray()` : ne rien écrire du tout.
 *
 *     'confirmed_at' => $this->iso($this->confirmed_at),   ← conforme
 *     'confirmed_at' => $this->confirmed_at,               ← l'attribut Carbon BRUT
 *
 * La seconde ligne ne contient aucun appel interdit. La garde sortait en **0** dessus — mutation
 * jouée le 2026-08-20 sur `BookingResource:24`, sortie constatée :
 * « ✓ toutes les dates de l'API passent par BaseResource. 137 sites dans 45 fichiers ». Le compte
 * baissait de 138 à 137 et rien ne rougissait, parce que le compte était un PLANCHER et non un
 * INVENTAIRE. Or `JsonResource` sérialise ensuite ce Carbon par `Model::serializeDate()`, qui rend
 * `2026-08-17T12:34:56.000000Z` — très exactement l'ancienne forme que TCK-327 retire.
 *
 * **Et le trou n'était pas théorique : il était déjà ouvert dans l'arbre que TCK-327 livrait.**
 * Huit champs, mesurés le 2026-08-20 en exécutant les ressources, pas en les lisant :
 *
 *   · `SettingResource.updated_at`                    → `2026-08-17T12:34:56.000000Z`
 *   · `IntegrationResource` × 4 (`last_used_at`, `last_health_check_at`, `created_at`,
 *     `updated_at`)                                   → `2026-08-17T12:34:56.000000Z`
 *   · `Api/Admin/ModerationItemResource` × 2 (`reported_at`, `created_at`)
 *                                                     → `2026-08-17 12:34:56`
 *   · `Accounting/MatchCandidateResource.paid_at`     → `2026-08-17` sur un cast `datetime`
 *
 * La troisième ligne est une **CINQUIÈME forme**, que ni l'inventaire du ticket ni ADR-0018
 * n'avaient vue : la chaîne SQL brute, ni `T`, ni fuseau. Elle vient d'un
 * `DB::table(…)->selectRaw(…)` — donc d'une valeur jamais castée, qu'aucune lecture de `$casts` ne
 * pouvait signaler. Coût mesuré : `new Date('2026-08-20 13:16:05')` est parsé par le navigateur
 * comme une heure LOCALE là où `new Date('…T13:16:05+00:00')` est parsé en UTC — **2 heures**
 * d'écart sous `TZ=Europe/Paris`, **zéro** sous `TZ=UTC`. Invisible sur la machine de
 * développement, faux chez l'utilisateur.
 *
 * *Une liste noire garde contre les fautes qu'on a déjà commises. Un inventaire garde contre celles
 * qu'on n'a pas encore inventées.* La garde compte désormais les dates ÉMISES, pas les conversions
 * ÉCRITES.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE VÉRIFIE — TROIS CONTRÔLES
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 *   · **A — NON-VACUITÉ (le contrôle qui garde la garde).** Le mode de défaillance central d'une
 *     garde de ce type est de ne plus trouver sa cible et de passer au vert en ne gardant plus
 *     rien : dossier renommé, analyseur cassé, helpers supprimés. Elle exige donc que le dossier
 *     existe, qu'il rende un plancher de fichiers, que l'analyseur d'entrées rende un plancher de
 *     clés de date, et que `BaseResource` déclare TOUJOURS les deux helpers, les deux formats
 *     qu'ils produisent (`DateTimeInterface::ATOM`, `'Y-m-d'`) et la normalisation `->utc()`. Si
 *     l'un cède, elle ROUGIT. Elle exige aussi que chaque EXCEPTION corresponde encore à un site
 *     réel : une exception périmée est une autorisation qui traîne.
 *
 *   · **B — INVENTAIRE POSITIF DES DATES ÉMISES.** Chaque entrée `'clé' => valeur` d'un tableau de
 *     ressource dont la CLÉ est un nom de date doit avoir une VALEUR qui passe par `$this->iso(…)`
 *     ou `$this->calendarDate(…)`. Sinon : rouge. C'est le contrôle que la version précédente
 *     n'avait pas, et le seul qui voie l'attribut brut.
 *
 *   · **C — AUCUNE CONVERSION ÉCRITE À LA MAIN.** L'ancienne liste noire, conservée : elle reste
 *     utile parce qu'elle attrape les conversions posées sous une clé que l'heuristique de B ne
 *     reconnaît pas (`'quarter' => $x->toDateString()` passerait B et non C). Les deux contrôles
 *     se recouvrent partiellement et c'est délibéré.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠ CE QUE LA GARDE NE PROUVE PAS — À LIRE AVANT DE SE FIER À SON VERT
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **1. L'heuristique de nom de clé est un PLANCHER, jamais un inventaire.** Le contrôle B
 * reconnaît une date à son NOM (`*_at`, `*_date`, `*_on`, `*_since`, `period_start`…). Une date
 * émise sous un nom qui n'y ressemble pas lui échappe — et le dépôt en porte l'exemple :
 * `PropertyResource:219` émet `'member_since' => $this->iso($owner->created_at)`, que la première
 * rédaction de cette heuristique ne reconnaissait pas. Le suffixe `_since` a été ajouté APRÈS
 * l'avoir constaté, pas avant. Il en reste sûrement d'autres.
 *
 * Symétriquement, l'heuristique produit des FAUX POSITIFS sur ce dépôt : `'quarter'` y désigne un
 * *quartier* sénégalais, pas un trimestre — raison pour laquelle il n'est pas dans la liste,
 * alors qu'il aurait sa place dans une heuristique écrite en anglais générique. `year_built` et
 * `payment_day` sont des entiers. Une heuristique de nom porte la langue et le domaine du dépôt
 * dans lequel elle est écrite ; elle ne se recopie pas.
 *
 * *Chercher un jeton ne mesure pas une propriété (dette D-23).* Le dire ici évite qu'un vert soit
 * lu pour plus qu'il ne vaut, et c'est écrit dans la SORTIE du script, pas seulement dans cet
 * en-tête.
 *
 * **2. Elle ne prouve pas qu'`iso()` a été employé sur le BON champ.** Un `datetime` passé à
 * `calendarDate()` perd son heure sans que rien ici ne rougisse. C'est
 * `takussan-api/tests/Unit/Http/Resources/DateRepresentationTest.php` qui fige, champ par champ,
 * la correspondance entre le cast du modèle et la forme émise. Les deux sont nécessaires : le test
 * connaît la valeur, la garde connaît l'exhaustivité — et aucun des deux ne remplace l'autre.
 *
 * **3. Elle ne regarde pas les dates émises HORS `app/Http/Resources/`** — contrôleurs qui
 * composent une réponse à la main, DTO de service pré-formatés, payloads de notification, exports.
 * Frontière assumée et écrite dans ADR-0018 : le dossier des ressources est celui où le contrat
 * est *déclaré*. La liste d'exceptions ci-dessous nomme le cas connu où cette frontière fait mal.
 *
 * **4. Elle lit du PHP avec un analyseur de texte, pas avec un parseur.** Il masque commentaires et
 * chaînes, puis équilibre `()[]{}` pour délimiter la valeur d'une entrée — ce qui suffit pour les
 * ternaires multi-lignes du dépôt (`Api/Admin/AgencyResource:33-35`) mais céderait sur du PHP
 * inhabituel. Le contrôle A l'attrape : si l'analyseur cesse de reconnaître le code, le compte de
 * clés de date s'effondre sous le plancher et la garde rougit au lieu de verdir.
 *
 * Usage :
 *   node scripts/check-resource-date-format.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-resource-date-format.mjs --report   # + l'inventaire, DÉRIVÉ à chaque appel
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const RESOURCES = join(ROOT, 'takussan-api', 'app', 'Http', 'Resources');
const BASE = join(RESOURCES, 'Bases', 'BaseResource.php');

/**
 * Planchers de non-vacuité.
 *
 * 45 fichiers, 146 clés de date et 145 sites conformes au 2026-08-20.
 *
 * ⚠ CES VALEURS ONT ÉTÉ DÉLIBÉRÉMENT BASSES, ET C'ÉTAIT UNE FAUTE — corrigée le 2026-08-20, sur
 * mesure. Le plancher valait 100 pour 146 clés réelles : **46 clés pouvaient disparaître en
 * silence**, ce qui est très exactement le trou que ce contrôle prétend fermer. Et ce n'était pas
 * théorique — le repérage des clés ignorait les guillemets doubles, si bien qu'un seul caractère
 * changé (`"confirmed_at" =>` au lieu de `'confirmed_at' =>`) sortait un Carbon brut sur le fil,
 * faisait tomber le compte de 146 à 145, et laissait la garde VERTE.
 *
 * Ce sont donc des CLIQUETS, posés au niveau MESURÉ, et non des planchers de non-vacuité : le
 * compte ne redescend pas. Ils ne disent pas « 146 suffit » — ils disent « on ne perd pas de vue
 * ce qu'on voyait hier ». Retirer légitimement une ressource fait rougir : c'est voulu. On
 * re-mesure alors, et on baisse la constante SCIEMMENT, dans le même commit que la suppression.
 */
const PLANCHER_FICHIERS = 45;
const PLANCHER_CLES_DATE = 146;
const PLANCHER_CONFORMES = 145;

/**
 * L'HEURISTIQUE DE NOM DE CLÉ — le plancher du contrôle B.
 *
 * Chaque motif est là parce qu'un vrai champ du dépôt le porte. Ce n'est pas une taxonomie des
 * noms de date possibles : c'est la liste de ceux qu'on a rencontrés. Elle s'allonge quand on en
 * trouve un de plus, et l'en-tête ci-dessus dit pourquoi elle ne pourra jamais être close.
 */
const MOTIFS_CLE_DATE = [
  [/_at$/, '`confirmed_at`, `published_at`, `last_used_at`… — le suffixe majoritaire'],
  [/_date$/, '`due_date`, `issue_date`, `renewal_date`, `expiry_date`'],
  [/^date$/, 'la clé nue `date`'],
  [/_on$/, '`created_on` — absent du dépôt aujourd\'hui, gardé pour la forme anglaise courante'],
  [/_since$/, '`member_since` (PropertyResource:219) — TROUVÉ APRÈS coup, cf. en-tête §1'],
  [/(^|_)period_(start|end)$/, '`period_start`, `current_period_end` — une période comptable'],
  [/deadline$/, 'une échéance'],
  [/timestamp$/, 'un horodatage nommé comme tel'],
];

/**
 * Les appels interdits dans un corps de ressource (contrôle C), et ce qu'ils émettaient.
 *
 * `->format(` est dans la liste et c'est délibéré : c'est la porte de sortie évidente une fois les
 * autres fermées, et elle rouvrirait le problème sous un autre nom. Une ressource qui a besoin
 * d'une troisième forme n'a pas besoin d'un `format()` local — elle a besoin d'un helper de plus
 * sur `BaseResource`, et d'un amendement à ADR-0018.
 */
const INTERDITS = [
  ['toISOString', '`2026-08-17T12:34:56.000000Z` — six chiffres de fraction que `Date.prototype.toISOString()` ne sait pas reproduire (il en émet trois)'],
  ['toIso8601String', '`2026-08-17T12:34:56+00:00` — la bonne chaîne, mais SANS la normalisation UTC en code que fait `iso()`'],
  ['toDateString', '`2026-08-17` — la bonne chaîne, mais sans le nom qui dit que c\'est une DÉCISION (cast `date`)'],
  ['toDateTimeString', '`2026-08-17 12:34:56` — ni ISO, ni fuseau'],
  ['toRfc3339String', 'une quatrième forme'],
  ['toAtomString', 'la forme d\'`iso()`, écrite à la main'],
  ['toJSON', 'la forme de `toISOString()`, sous un autre nom'],
];

/**
 * EXCEPTIONS AU CONTRÔLE B — chacune justifiée PAR ÉCRIT, et chacune vérifiée.
 *
 * Une exception qui ne correspond plus à aucun site réel fait ROUGIR le contrôle A : une
 * autorisation qui traîne après la disparition de son motif est exactement le mécanisme par lequel
 * une liste d'exemptions devient une passoire. *Une liste d'exemptions est une dette VISIBLE ; une
 * exemption implicite est une dette invisible.*
 *
 * Clé : `<chemin sous app/Http/Resources/>::<clé émise>`. Pas de numéro de ligne — il dérive au
 * premier ajout de champ, et une exception qui « tombe » silencieusement d'un site à l'autre serait
 * pire que pas d'exception du tout.
 */
const EXCEPTIONS_JUSTIFIEES = new Map([
  [
    'Accounting/MatchCandidateResource.php::paid_at',
    "NON CONFORME, ET SCIEMMENT LAISSÉ TEL QUEL — ce n'est pas une exemption de confort.\n" +
      "    Mesuré le 2026-08-20 : la ressource émet `2026-08-17`, une DATE CALENDAIRE, pour un\n" +
      '    champ dont le cast est `datetime` (`BookingPayment::paid_at`, vérifié par\n' +
      "    `getCasts()['paid_at'] === 'datetime'`). C'est le défaut EXACT qu'ADR-0018 nomme sur\n" +
      '    `PlatformPayout::period_start`, retourné : `BookingPaymentResource.paid_at` émet\n' +
      '    `2026-08-17T12:34:56+00:00` pour la MÊME colonne du MÊME modèle.\n' +
      '    Pourquoi il n\'est pas corrigé ici : la troncature n\'a pas lieu dans la ressource. Le DTO\n' +
      '    `App\\Services\\Accounting\\MatchCandidate::$paidAt` est déclaré `?string` et reçoit déjà\n' +
      '    `$p->paid_at?->toDateString()` de `PaymentSearchService` (lignes 56, 77 et 107). La\n' +
      "    ressource ne peut pas récupérer l'heure : elle a été jetée en amont. Le correctif exige\n" +
      "    de retyper le DTO en `?DateTimeInterface` et de toucher `app/Services/Accounting/` —\n" +
      '    HORS du périmètre de TCK-327, qui est celui des ressources.\n' +
      '    À ouvrir en ticket. Cette entrée existe pour que le trou soit COMPTÉ, pas pardonné.',
  ],
]);

const erreurs = [];

// ── Contrôle A — non-vacuité (première moitié : le dossier existe-t-il) ─────────────────────────

if (!existsSync(RESOURCES) || !statSync(RESOURCES).isDirectory()) {
  console.error(`✗ ${relative(ROOT, RESOURCES)} est introuvable.`);
  console.error('  La garde ne peut rien vérifier — elle le dit plutôt que de passer en silence.');
  process.exit(1);
}

function fichiersPhp(dir) {
  const out = [];
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) out.push(...fichiersPhp(chemin));
    else if (entree.isFile() && entree.name.endsWith('.php')) out.push(chemin);
  }
  return out;
}

const fichiers = fichiersPhp(RESOURCES).sort();

if (fichiers.length < PLANCHER_FICHIERS) {
  erreurs.push(
    `A — ${fichiers.length} fichier(s) PHP lus sous ${relative(ROOT, RESOURCES)}, plancher ${PLANCHER_FICHIERS}.\n` +
      `    La garde ne lit plus l'arbre qu'elle prétend garder. Un vert ici ne vaudrait rien.`,
  );
}

// ── L'analyseur : masquer commentaires et chaînes, puis délimiter les entrées ───────────────────

/**
 * Rend une copie du source où commentaires et CONTENUS de chaîne sont remplacés par des espaces,
 * à longueur et à sauts de ligne identiques. Les guillemets, eux, restent : c'est ce qui permet de
 * reconnaître `'clé' =>` sans se faire piéger par un `'clé' =>` écrit DANS un docblock.
 *
 * Ce masquage n'est pas de la précaution abstraite. La version précédente de cette garde lisait
 * `BaseResource` brut, et retirer le `->utc()` du corps d'`iso()` la laissait VERTE — parce que le
 * docblock au-dessus cite `->utc()` en expliquant pourquoi il existe. *Une garde qui se satisfait
 * de sa propre documentation ne garde rien.*
 */
function masquer(source) {
  const out = source.split('');
  let i = 0;
  const n = source.length;
  const blanchir = (a, b) => {
    for (let k = a; k < b && k < n; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };

  while (i < n) {
    const c = source[i];
    const d = source[i + 1];

    if (c === '/' && d === '/') {
      let j = i;
      while (j < n && source[j] !== '\n') j += 1;
      blanchir(i, j);
      i = j;
      continue;
    }
    if (c === '#' && d !== '[') {
      let j = i;
      while (j < n && source[j] !== '\n') j += 1;
      blanchir(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = source.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      blanchir(i, j);
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === c) break;
        j += 1;
      }
      blanchir(i + 1, j); // le CONTENU seulement — les guillemets restent lisibles
      i = Math.min(j + 1, n);
      continue;
    }
    i += 1;
  }
  return out.join('');
}

/**
 * Les entrées `'clé' => valeur` d'un fichier, valeur délimitée par équilibrage.
 *
 * Le masquage a effacé le contenu des chaînes : le nom de la clé est donc relu dans le source
 * ORIGINAL, aux mêmes offsets. La valeur court de `=>` jusqu'à la première virgule rencontrée à
 * profondeur nulle, ou jusqu'à la fermeture du tableau qui la porte — ce qui couvre les ternaires
 * multi-lignes (`Api/Admin/AgencyResource:33-35`) que tout analyseur ligne-à-ligne classerait, à
 * tort, non conformes.
 */
function entrees(source) {
  const masque = masquer(source);
  const trouvees = [];
  // Le masque a vidé le CONTENU des chaînes en gardant leur longueur : une clé `'created_at'` y
  // survit donc en `'          '`. C'est ce qui rend le repérage sûr — un `'clé' =>` écrit dans un
  // docblock a été blanchi guillemets compris, et ne peut plus être confondu avec du code.
  //
  // ⚠ LES DEUX GUILLEMETS, et c'est un trou MESURÉ le 2026-08-20, pas une précaution. Ce motif
  // n'acceptait que le simple. `"confirmed_at" => $this->confirmed_at` — même mutation, un
  // caractère de différence — sortait la garde en 0 : le Carbon brut partait sur le fil, le compte
  // passait de 146 à 145, et RIEN ne rougissait. Une clé que l'analyseur ne voit pas n'est pas une
  // clé conforme, c'est une clé absente de l'inventaire, et un inventaire aveugle verdit toujours.
  const paires = /(['"])( *)\1\s*=>/g;
  paires.lastIndex = 0;
  let m;
  while ((m = paires.exec(masque)) !== null) {
    const debutCle = m.index + 1;
    const finCle = debutCle + m[2].length;
    const cle = source.slice(debutCle, finCle);
    if (!/^[A-Za-z0-9_]+$/.test(cle)) continue;

    let i = m.index + m[0].length;
    let profondeur = 0;
    while (i < masque.length) {
      const c = masque[i];
      if (c === '(' || c === '[' || c === '{') profondeur += 1;
      else if (c === ')' || c === ']' || c === '}') {
        if (profondeur === 0) break;
        profondeur -= 1;
      } else if (c === ',' && profondeur === 0) break;
      i += 1;
    }

    trouvees.push({
      cle,
      ligne: source.slice(0, debutCle).split('\n').length,
      valeur: source.slice(m.index + m[0].length, i).trim().replace(/\s+/g, ' '),
    });
  }
  return trouvees;
}

const estCleDate = (cle) => MOTIFS_CLE_DATE.some(([motif]) => motif.test(cle));
const passeParUnHelper = (valeur) => /\$this->(iso|calendarDate)\s*\(/.test(valeur);

// ── Contrôles B et C ────────────────────────────────────────────────────────────────────────────

const inventaire = [];
const exceptionsVues = new Set();
let conformes = 0;

for (const fichier of fichiers) {
  const source = readFileSync(fichier, 'utf8');
  const rel = relative(ROOT, fichier);
  const relCourt = relative(RESOURCES, fichier);
  const estLaBase = fichier === BASE;
  if (estLaBase) continue; // Elle DÉCLARE les helpers ; elle n'en est pas une utilisatrice.

  const masque = masquer(source);
  const lignes = source.split('\n');

  // ── C — aucune conversion écrite à la main ──
  masque.split('\n').forEach((ligneMasquee, i) => {
    for (const [appel, emettait] of INTERDITS) {
      if (new RegExp(`->${appel}\\s*\\(`).test(ligneMasquee)) {
        erreurs.push(
          `C — ${rel}:${i + 1} : \`${appel}()\` écrit à la main.\n` +
            `        ${lignes[i].trim()}\n` +
            `    Il émet ${emettait}.\n` +
            `    ADR-0018 : un instant passe par \`$this->iso(…)\`, une date calendaire (cast \`date\`)\n` +
            `    par \`$this->calendarDate(…)\`. La forme se déduit du CAST du modèle, pas du goût\n` +
            `    de l'auteur de la ressource.`,
        );
      }
    }
    if (/->format\s*\(/.test(ligneMasquee)) {
      erreurs.push(
        `C — ${rel}:${i + 1} : \`format()\` écrit à la main.\n` +
          `        ${lignes[i].trim()}\n` +
          `    C'est la porte de sortie une fois les autres fermées, et elle rouvre le problème\n` +
          `    sous un autre nom. Une ressource qui a besoin d'une troisième forme a besoin d'un\n` +
          `    helper de plus sur BaseResource — et d'un amendement à ADR-0018.`,
      );
    }
  });

  // ── B — inventaire positif des dates émises ──
  for (const { cle, ligne, valeur } of entrees(source)) {
    if (!estCleDate(cle)) continue;

    const identite = `${relCourt}::${cle}`;
    const conforme = passeParUnHelper(valeur);
    const exception = EXCEPTIONS_JUSTIFIEES.get(identite);

    inventaire.push({
      rel,
      ligne,
      cle,
      valeur,
      helper: conforme ? (/\$this->calendarDate\s*\(/.test(valeur) ? 'calendarDate' : 'iso') : null,
      exception: exception !== undefined,
    });

    if (conforme) {
      conformes += 1;
      if (exception !== undefined) {
        exceptionsVues.add(identite);
        erreurs.push(
          `A — l'exception « ${identite} » est PÉRIMÉE : le site passe désormais par un helper.\n` +
            `        ${rel}:${ligne}  ${valeur}\n` +
            `    La retirer de EXCEPTIONS_JUSTIFIEES. Une autorisation qui survit à son motif est\n` +
            `    le mécanisme par lequel une liste d'exemptions devient une passoire.`,
        );
      }
      continue;
    }

    if (exception !== undefined) {
      exceptionsVues.add(identite);
      continue;
    }

    erreurs.push(
      `B — ${rel}:${ligne} : « ${cle} » est une date ÉMISE SANS passer par BaseResource.\n` +
        `        '${cle}' => ${valeur}\n` +
        `    La valeur ne passe ni par \`$this->iso(…)\` ni par \`$this->calendarDate(…)\`.\n` +
        `    ⚠ Ce n'est PAS un oubli cosmétique : un attribut Carbon rendu brut est sérialisé par\n` +
        `    \`Model::serializeDate()\` en \`2026-08-17T12:34:56.000000Z\`, et une chaîne SQL brute\n` +
        `    (issue d'un \`selectRaw\`) en \`2026-08-17 12:34:56\` — que le navigateur lit comme une\n` +
        `    heure LOCALE, soit 2 h d'écart sous TZ=Europe/Paris et 0 sous TZ=UTC.\n` +
        `    Instant → \`$this->iso(…)\` ; date calendaire (cast \`date\`) → \`$this->calendarDate(…)\`.\n` +
        `    Si ce champ n'est PAS une date, ou s'il ne peut pas l'être ici, l'inscrire dans\n` +
        `    EXCEPTIONS_JUSTIFIEES avec sa raison écrite — jamais en silence.`,
    );
  }
}

// ── Contrôle A — non-vacuité (seconde moitié : l'analyseur et BaseResource) ─────────────────────

const clesDate = inventaire.length;

if (clesDate < PLANCHER_CLES_DATE) {
  erreurs.push(
    `A — ${clesDate} clé(s) de date reconnue(s), cliquet ${PLANCHER_CLES_DATE}.\n` +
      `    Le compte a BAISSÉ. Deux causes, et il faut trancher laquelle AVANT de toucher au\n` +
      `    cliquet : soit l'analyseur ne reconnaît plus une forme du code — le contrôle B ne l'a\n` +
      `    alors pas lue, et son vert ne prouve rien pour elle ; soit des clés de date ont été\n` +
      `    légitimement retirées, et on baisse la constante SCIEMMENT, dans le commit qui les retire.`,
  );
}

if (conformes < PLANCHER_CONFORMES) {
  erreurs.push(
    `A — ${conformes} site(s) conforme(s), plancher ${PLANCHER_CONFORMES}.\n` +
      `    Le motif d'appel des helpers ne reconnaît plus le code du dépôt.`,
  );
}

for (const identite of EXCEPTIONS_JUSTIFIEES.keys()) {
  if (!exceptionsVues.has(identite)) {
    erreurs.push(
      `A — l'exception « ${identite} » ne correspond à AUCUN site.\n` +
        `    Le fichier a été renommé, la clé retirée, ou l'heuristique ne la reconnaît plus.\n` +
        `    Une exception qui ne s'applique à rien n'est pas inoffensive : elle donne à la liste\n` +
        `    une autorité qu'elle n'a plus. La retirer, ou corriger ce qui a bougé.`,
    );
  }
}

if (!existsSync(BASE)) {
  erreurs.push(
    `A — ${relative(ROOT, BASE)} est introuvable.\n` +
      `    C'est la classe qui porte les deux helpers. Sans elle, la garde n'a plus d'objet.`,
  );
} else {
  const base = masquer(readFileSync(BASE, 'utf8'));

  for (const [helper, quoi] of [
    ['iso', "l'instant"],
    ['calendarDate', 'la date calendaire'],
  ]) {
    if (!new RegExp(`function\\s+${helper}\\s*\\(`).test(base)) {
      erreurs.push(
        `A — \`BaseResource::${helper}()\` n'est plus déclaré (${quoi}).\n` +
          `    Le contrôle B exigerait alors un helper qui n'existe pas : la garde demanderait\n` +
          `    l'impossible. Elle rougit ici plutôt que là.`,
      );
    }
  }

  if (!/DateTimeInterface::ATOM/.test(base)) {
    erreurs.push(
      "A — `BaseResource` ne cite plus `DateTimeInterface::ATOM`.\n" +
        "    C'est le format d'instant qu'ADR-0018 a retenu. S'il a changé, la décision a changé :\n" +
        "    amender l'ADR, puis cette garde — dans cet ordre.",
    );
  }
  if (!/'Y-m-d'/.test(readFileSync(BASE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))) {
    erreurs.push(
      "A — `BaseResource` ne cite plus le format `'Y-m-d'`.\n" +
        "    C'est le format de date calendaire qu'ADR-0018 a retenu. Même remarque.",
    );
  }
  if (!/->utc\(\)/.test(base)) {
    erreurs.push(
      "A — `BaseResource` ne normalise plus vers UTC (`->utc()` absent du CODE).\n" +
        "    `format(ATOM)` conserve alors le décalage LOCAL de l'instance : le contrat redevient\n" +
        "    dépendant de `config/app.php` au lieu du code. C'est précisément ce qu'ADR-0018 ferme.",
    );
  }
}

// ── Sortie ──────────────────────────────────────────────────────────────────────────────────────

if (REPORT) {
  console.log(`Fichiers PHP lus sous ${relative(ROOT, RESOURCES)} : ${fichiers.length}`);
  console.log(`Clés de date reconnues : ${clesDate}  (conformes ${conformes}, exceptions ${EXCEPTIONS_JUSTIFIEES.size})`);
  const parHelper = inventaire.reduce((a, e) => ({ ...a, [e.helper ?? 'AUCUN']: (a[e.helper ?? 'AUCUN'] ?? 0) + 1 }), {});
  console.log(`  iso() (instant, …T12:34:56+00:00) : ${parHelper.iso ?? 0}`);
  console.log(`  calendarDate() (jour, YYYY-MM-DD)  : ${parHelper.calendarDate ?? 0}`);
  console.log(`  AUCUN helper                        : ${parHelper.AUCUN ?? 0}`);
  console.log('');
  let fichierCourant = null;
  for (const e of inventaire.sort((a, b) => a.rel.localeCompare(b.rel) || a.ligne - b.ligne)) {
    if (e.rel !== fichierCourant) {
      fichierCourant = e.rel;
      console.log(`  ${e.rel}`);
    }
    const marque = e.helper ? `${e.helper}()` : e.exception ? '⚠ EXCEPTION ÉCRITE' : '✗ AUCUN';
    console.log(`    ${String(e.ligne).padStart(4)}  ${e.cle.padEnd(34)} ${marque}`);
  }
  console.log('');
}

if (erreurs.length > 0) {
  console.error(`✗ ${erreurs.length} écart(s) — le format des dates de l'API (ADR-0018) :\n`);
  for (const e of erreurs) console.error(`  ${e}\n`);
  process.exit(1);
}

console.log("✓ toutes les dates ÉMISES par l'API passent par BaseResource.");
console.log(
  `  ${clesDate} clés de date dans ${fichiers.length} fichiers — ${conformes} conformes, ` +
    `${EXCEPTIONS_JUSTIFIEES.size} exception(s) écrite(s).`,
);
console.log(
  '  Instant `…T12:34:56+00:00`, jour `YYYY-MM-DD` (ADR-0018).',
);
console.log('');
console.log('  ⚠ Ce vert est un PLANCHER, pas une preuve d\'exhaustivité. Le contrôle B reconnaît');
console.log('    une date à son NOM de clé (`*_at`, `*_date`, `*_since`, `period_start`…) : une date');
console.log('    émise sous un autre nom lui échappe — `member_since` y a échappé jusqu\'au');
console.log('    2026-08-20. Et la garde ne dit RIEN de la JUSTESSE du choix : un `datetime` passé à');
console.log('    calendarDate() perd son heure sans qu\'elle rougisse. C\'est');
console.log('    takussan-api/tests/Unit/Http/Resources/DateRepresentationTest.php qui fige, champ');
console.log('    par champ, la correspondance cast ↔ forme émise. La garde connaît l\'exhaustivité,');
console.log('    le test connaît la valeur.');
