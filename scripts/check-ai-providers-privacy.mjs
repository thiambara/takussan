#!/usr/bin/env node
/**
 * Garde : tout fournisseur d'IA joignable est nommé par la politique de confidentialité
 * (TCK-2383, ADR-0076 §3).
 *
 * **Pourquoi.** La console super-admin choisit le modèle de chaque rôle parmi les fournisseurs de
 * `config/ai.php`. Sans cette garde, ajouter un fournisseur et deux clics enverraient des contenus
 * à un sous-traitant que `privacy.ts` ne déclare pas.
 *
 * **Ce qu'elle lit.** Le bloc `'providers' => [ … ]` de `takussan-api/config/ai.php` : chaque entrée
 * de premier niveau doit porter un `legal_name` et une liste `allowed_hosts` non vide, écrite en
 * configuration et jamais lue de l'environnement (TCK-2450, ADR-0085 §3). `privacy.ts` promet que
 * OpenRouter n'achemine que vers des fournisseurs qui déclarent ne pas collecter les données : une entrée
 * dont `data_collection` vaut autre chose que `deny`, ou dont le bloc `provider` n'est pas écrit en toutes
 * lettres, rougit, jusqu'à ce que le texte et cette garde changent.
 * Puis la puce « Intelligence artificielle » (fr) et
 * « Artificial intelligence » (en) du § 4.3 de `takussan-web/src/content/legal/privacy.ts` : chaque
 * `legal_name` doit y figurer, dans les deux langues.
 *
 * **Ce qu'elle ne prouve pas.** Qu'un nom cité par la puce soit encore configuré (la puce peut en
 * dire trop), ni que le texte décrive bien le traitement. Elle ne voit pas `'provider' => [...$x]`, dont un
 * `allow` étalé passerait. Elle ne voit que les hôtes écrits en toutes lettres.
 *
 * **Le pilote suit l'hôte** (`HOTES_A_PILOTE`). `privacy.ts` promet `store` et `data_collection`, que seuls les
 * pilotes `openai` et `openrouter` envoient : une entrée `openai-compatible` sur leurs hôtes retomberait sur `allow`.
 *
 * Ses propres tests (`CAS_EPREUVE`) tournent à chaque invocation : une garde dont la lecture
 * régresse sort en 1 sur elle-même.
 *
 *   node scripts/check-ai-providers-privacy.mjs            # garde
 *   node scripts/check-ai-providers-privacy.mjs --report   # + les fournisseurs lus
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const CONFIG = join(ROOT, 'takussan-api', 'config', 'ai.php');
const PRIVACY = join(ROOT, 'takussan-web', 'src', 'content', 'legal', 'privacy.ts');
const PUCES = { fr: '- **Intelligence artificielle**', en: '- **Artificial intelligence**' };

/** Rend `{ cle: { nom, corps } }` pour chaque entrée de premier niveau du bloc `providers`, `nom` étant son `legal_name` ou null. */
export function lireFournisseurs(php) {
  const debut = php.indexOf("'providers' => [");
  if (debut < 0) throw new Error("bloc 'providers' introuvable");
  let i = php.indexOf('[', debut);
  let profondeur = 0;
  let chaine = null;
  const entrees = {};
  let courante = null;
  let corps = '';
  for (; i < php.length; i++) {
    const c = php[i];
    if (chaine) {
      if (c === '\\') { if (courante) corps += c + php[i + 1]; i++; continue; }
      if (c === chaine) chaine = null;
      if (courante) corps += c;
      continue;
    }
    // Hors chaîne, un commentaire PHP ne se lit pas : une apostrophe française (`l'ajout`) y
    // basculerait l'état de chaîne et ferait taire le fournisseur suivant.
    if (c === '#' || (c === '/' && php[i + 1] === '/')) {
      const fin = php.indexOf('\n', i);
      if (fin < 0) break;
      i = fin;
      continue;
    }
    if (c === '/' && php[i + 1] === '*') {
      const fin = php.indexOf('*/', i + 2);
      if (fin < 0) break;
      i = fin + 1;
      continue;
    }
    if (c === "'" || c === '"') {
      chaine = c;
      if (profondeur === 1 && courante === null) {
        const fin = php.indexOf(c, i + 1);
        const cle = php.slice(i + 1, fin);
        if (/^\s*=>\s*\[/.test(php.slice(fin + 1))) { courante = cle; corps = ''; }
        i = fin;
        chaine = null;
        continue;
      }
      if (courante) corps += c;
      continue;
    }
    if (c === '[') { profondeur++; if (courante && profondeur > 2) corps += c; continue; }
    if (c === ']') {
      profondeur--;
      if (profondeur === 1 && courante) {
        const nom = corps.match(/'legal_name'\s*=>\s*'([^']+)'/);
        entrees[courante] = { nom: nom ? nom[1] : null, corps };
        courante = null;
      }
      if (profondeur === 0) break;
      if (courante) corps += c;
      continue;
    }
    if (courante) corps += c;
  }
  return entrees;
}

/** Une liste écrite en toutes lettres, avec au moins un hôte : ni vide, ni lue de `env()`. */
export function declareSesHotes(corps) {
  return /'allowed_hosts'\s*=>\s*\[\s*'[^']+'/.test(corps);
}

/** `data_collection` autre que `deny`, quels que soient les guillemets, ou un bloc `provider` qui ne se lit pas ici (`env()`). */
export function contreditLaPromesse(corps) {
  return /['"]data_collection['"]\s*=>\s*(?!\s|['"]deny['"])/.test(corps) || /['"]provider['"]\s*=>\s*(?!\s|\[)/.test(corps);
}

/**
 * Rend `{ cle: [hôtes] }` : les `allowed_hosts` d'un fournisseur (TCK-2423, ADR-0085 §4). Chaque entrée en déclare
 * ({@link declareSesHotes}) ; Voyage AI doit en plus y porter son hôte.
 */
export function lireHotes(php) {
  const hotes = {};
  for (const cle of Object.keys(lireFournisseurs(php))) {
    const debut = php.search(new RegExp(`'${cle}'\\s*=>\\s*\\[`));
    let i = php.indexOf('[', debut);
    const ouverture = i;
    for (let profondeur = 0; i < php.length; i++) {
      if (php[i] === '[') profondeur++;
      if (php[i] === ']' && --profondeur === 0) break;
    }
    const liste = php.slice(ouverture, i).match(/'allowed_hosts'\s*=>\s*\[([^\]]*)\]/);
    if (liste) hotes[cle] = [...liste[1].matchAll(/'([^']+)'/g)].map((h) => h[1]);
  }
  return hotes;
}

/** L'hôte, sous-domaines compris, et le pilote sans lequel la promesse de `privacy.ts` ne part pas. */
const HOTES_A_PILOTE = { 'openrouter.ai': 'openrouter', 'api.openai.com': 'openai' };

/** Rend les hôtes de cette entrée dont le pilote n'est pas celui que l'hôte exige. */
export function hotesSansLeurPilote(corps) {
  const liste = corps.match(/['"]allowed_hosts['"]\s*=>\s*\[([^\]]*)\]/);
  if (!liste) return [];
  const pilote = corps.match(/['"]driver['"]\s*=>\s*['"]([^'"]+)['"]/)?.[1] ?? null;
  return [...liste[1].matchAll(/['"]([^'"]+)['"]/g)]
    .map((h) => h[1].toLowerCase().split(':')[0])
    .filter((hote) => Object.entries(HOTES_A_PILOTE).some(([h, requis]) => (hote === h || hote.endsWith(`.${h}`)) && pilote !== requis));
}

/** Rend la ligne de la puce, ou null. */
export function lirePuce(texte, prefixe) {
  return texte.split('\n').find((ligne) => ligne.trim().startsWith(prefixe)) ?? null;
}

export function verifier(php, privacy) {
  const erreurs = [];
  const fournisseurs = lireFournisseurs(php);
  const hotes = lireHotes(php);
  if (Object.keys(fournisseurs).length === 0) erreurs.push('aucun fournisseur lu dans config/ai.php');
  for (const [cle, { nom, corps }] of Object.entries(fournisseurs)) {
    if (!declareSesHotes(corps)) erreurs.push(`fournisseur « ${cle} » sans allowed_hosts écrit en configuration`);
    if (contreditLaPromesse(corps)) erreurs.push(`fournisseur « ${cle} » : data_collection autre que deny, ou bloc provider illisible, alors que privacy.ts promet le contraire`);
    for (const hote of hotesSansLeurPilote(corps)) erreurs.push(`fournisseur « ${cle} » : l'hôte ${hote} exige son pilote, sinon ni store ni data_collection ne partent`);
    if (!nom) { erreurs.push(`fournisseur « ${cle} » sans legal_name`); continue; }
    if (cle === 'voyageai' && !hotes[cle]?.includes('api.voyageai.com')) erreurs.push('voyageai : allowed_hosts ne porte pas api.voyageai.com');
    for (const [langue, prefixe] of Object.entries(PUCES)) {
      const puce = lirePuce(privacy, prefixe);
      if (!puce) erreurs.push(`privacy.ts : puce ${langue} « ${prefixe} » absente`);
      else if (!puce.includes(nom)) erreurs.push(`privacy.ts (${langue}) ne nomme pas « ${nom} » (fournisseur ${cle})`);
    }
  }
  return { erreurs, fournisseurs };
}

const CAS_EPREUVE = [
  {
    nom: 'un fournisseur nommé passe',
    php: "'providers' => [\n 'anthropic' => ['driver' => 'anthropic', 'legal_name' => 'Anthropic', 'allowed_hosts' => ['a.test']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic (États-Unis)\n- **Artificial intelligence**: Anthropic (United States)',
    erreurs: 0,
  },
  {
    nom: 'un fournisseur absent de la puce rougit',
    php: "'providers' => [\n 'anthropic' => ['legal_name' => 'Anthropic', 'k' => ['x' => 1], 'allowed_hosts' => ['a.test']],\n 'openai' => ['legal_name' => 'OpenAI', 'allowed_hosts' => ['o.test']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic\n- **Artificial intelligence**: Anthropic',
    erreurs: 2,
  },
  {
    nom: 'voyageai sans son hôte rougit',
    php: "'providers' => [\n 'voyageai' => [\n 'legal_name' => 'Voyage AI',\n ],\n],\n'roles' => [],",
    privacy: '- **Intelligence artificielle** : Voyage AI\n- **Artificial intelligence**: Voyage AI',
    erreurs: 2,
  },
  {
    nom: 'voyageai sur un autre hôte rougit',
    php: "'providers' => [\n 'voyageai' => [\n 'legal_name' => 'Voyage AI',\n 'allowed_hosts' => ['ailleurs.test'],\n ],\n],\n'roles' => [],",
    privacy: '- **Intelligence artificielle** : Voyage AI\n- **Artificial intelligence**: Voyage AI',
    erreurs: 1,
  },
  {
    nom: 'voyageai avec son hôte passe',
    php: "'providers' => [\n 'voyageai' => [\n 'legal_name' => 'Voyage AI',\n 'allowed_hosts' => ['api.voyageai.com'],\n ],\n],\n'roles' => [],",
    privacy: '- **Intelligence artificielle** : Voyage AI\n- **Artificial intelligence**: Voyage AI',
    erreurs: 0,
  },
  {
    nom: 'un fournisseur sans legal_name rougit',
    php: "'providers' => [\n 'mistral' => ['driver' => 'mistral', 'allowed_hosts' => ['m.test']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic\n- **Artificial intelligence**: Anthropic',
    erreurs: 1,
  },
  {
    nom: "une apostrophe en commentaire ne fait pas taire le fournisseur suivant",
    php: "'providers' => [\n 'anthropic' => ['legal_name' => 'Anthropic', 'allowed_hosts' => ['a.test']],\n // l'ajout se fait ici\n 'openai' => ['legal_name' => 'OpenAI', 'allowed_hosts' => ['o.test']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic\n- **Artificial intelligence**: Anthropic',
    erreurs: 2,
  },
  {
    nom: 'un commentaire avant la première entrée, les deux nommés',
    php: "'providers' => [\n # l'ordre compte\n 'anthropic' => ['legal_name' => 'Anthropic', 'allowed_hosts' => ['a.test']],\n // d'autres, plus tard\n 'openai' => ['legal_name' => 'OpenAI', 'allowed_hosts' => ['o.test']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenAI\n- **Artificial intelligence**: Anthropic, OpenAI',
    erreurs: 0,
  },
  {
    nom: "un commentaire en bloc avec apostrophe n'efface pas le fournisseur",
    php: "'providers' => [\n /* l'x\n   d'y */\n 'openai' => ['legal_name' => 'OpenAI', 'allowed_hosts' => ['o.test']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic\n- **Artificial intelligence**: Anthropic',
    erreurs: 2,
  },
  {
    nom: "une entrée sans allowed_hosts rougit",
    php: "'providers' => [\n 'anthropic' => ['legal_name' => 'Anthropic'],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 1,
  },
  {
    nom: 'une liste allowed_hosts vide rougit',
    php: "'providers' => [\n 'anthropic' => ['legal_name' => 'Anthropic', 'allowed_hosts' => []],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 1,
  },
  {
    nom: "des hôtes lus de l'environnement rougissent",
    php: "'providers' => [\n 'anthropic' => ['legal_name' => 'Anthropic', 'allowed_hosts' => explode(',', env('HOTES'))],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 1,
  },
  {
    nom: 'allowed_hosts dans un commentaire ne compte pas',
    php: "'providers' => [\n 'anthropic' => [\n // 'allowed_hosts' => ['a.test'],\n 'legal_name' => 'Anthropic'],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 1,
  },
  {
    nom: 'data_collection à allow contredit la promesse et rougit',
    php: "'providers' => [\n 'openrouter' => ['legal_name' => 'OpenRouter', 'allowed_hosts' => ['r.test'], 'provider' => ['data_collection' => 'allow']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 1,
  },
  {
    nom: 'data_collection à allow entre guillemets doubles rougit',
    php: "'providers' => [\n 'openrouter' => ['legal_name' => 'OpenRouter', 'allowed_hosts' => ['r.test'], 'provider' => [\"data_collection\" => 'allow']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 1,
  },
  {
    nom: "data_collection lu de l'environnement rougit",
    php: "'providers' => [\n 'openrouter' => ['legal_name' => 'OpenRouter', 'allowed_hosts' => ['r.test'], 'provider' => ['data_collection' => env('X', 'deny')]],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 1,
  },
  {
    nom: "un bloc provider lu de l'environnement rougit",
    php: "'providers' => [\n 'openrouter' => ['legal_name' => 'OpenRouter', 'allowed_hosts' => ['r.test'], 'provider' => env('X')],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 1,
  },
  {
    nom: 'deny entre guillemets doubles passe',
    php: "'providers' => [\n 'openrouter' => ['legal_name' => 'OpenRouter', 'allowed_hosts' => ['r.test'], 'provider' => [\"data_collection\" => \"deny\"]],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 0,
  },
  ...[
    ['openai-compatible sur openrouter.ai rougit', 'openai-compatible', 'openrouter.ai', 1],
    ['openai-compatible sur api.openai.com rougit', 'openai-compatible', 'api.openai.com', 1],
    ['un sous-domaine d’openrouter.ai sans son pilote rougit', 'openai-compatible', 'eu.openrouter.ai', 1],
    ['un port ne fait pas perdre l’hôte', 'openai-compatible', 'OPENROUTER.ai:8443', 1],
    ['le pilote openrouter sur eu.openrouter.ai passe', 'openrouter', 'eu.openrouter.ai', 0],
    ['le pilote openai sur api.openai.com passe', 'openai', 'api.openai.com', 0],
    ['un point d’accès sur son propre hôte passe', 'openai-compatible', 'api.mon-point.example', 0],
    ['un suffixe qui ressemble ne compte pas', 'openai-compatible', 'pasopenrouter.ai', 0],
  ].map(([nom, pilote, hote, erreurs]) => ({
    nom,
    php: `'providers' => [\n 'point' => ['driver' => '${pilote}', 'legal_name' => 'Point', 'allowed_hosts' => ['${hote}']],\n],`,
    privacy: '- **Intelligence artificielle** : Point\n- **Artificial intelligence**: Point',
    erreurs,
  })),
  {
    nom: 'data_collection à deny passe',
    php: "'providers' => [\n 'openrouter' => ['legal_name' => 'OpenRouter', 'allowed_hosts' => ['r.test'], 'provider' => ['data_collection' => 'deny']],\n],",
    privacy: '- **Intelligence artificielle** : Anthropic, OpenRouter\n- **Artificial intelligence**: Anthropic, OpenRouter',
    erreurs: 0,
  },
  {
    nom: 'un legal_name absent de la puce anglaise seule rougit',
    php: "'providers' => [\n 'openai' => ['legal_name' => 'OpenAI', 'allowed_hosts' => ['o.test']],\n],",
    privacy: '- **Intelligence artificielle** : OpenAI\n- **Artificial intelligence**: Anthropic',
    erreurs: 1,
  },
];

let echec = false;
for (const cas of CAS_EPREUVE) {
  const { erreurs } = verifier(cas.php, cas.privacy);
  if (erreurs.length !== cas.erreurs) {
    console.error(`✗ épreuve « ${cas.nom} » : ${erreurs.length} erreur(s) au lieu de ${cas.erreurs}`, erreurs);
    echec = true;
  }
}
if (echec) process.exit(1);

const { erreurs, fournisseurs } = verifier(readFileSync(CONFIG, 'utf8'), readFileSync(PRIVACY, 'utf8'));
if (REPORT) for (const [cle, { nom }] of Object.entries(fournisseurs)) console.log(`  ${cle} → ${nom}`);
if (erreurs.length > 0) {
  for (const e of erreurs) console.error(`✗ ${e}`);
  process.exit(1);
}
console.log(`✓ check-ai-providers-privacy : ${Object.keys(fournisseurs).length} fournisseur(s), tous nommés par privacy.ts`);
