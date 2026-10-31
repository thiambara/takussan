#!/usr/bin/env node
/**
 * Garde : aucun `float` ne porte l'argent du socle IA (TCK-2448, ADR-0086).
 *
 * **Pourquoi.** Coûts, tarifs et plafonds circulent en chaînes décimales, en dollars, de la colonne
 * `numeric` sans précision jusqu'à l'écran. Un seul `(float)` ou un seul cast `decimal:N` réintroduit
 * l'arrondi qui finit par lire 0 un modèle assez peu cher, et le budget ne compte plus rien. Rien
 * d'autre ne le verrait : le test le plus précis ne couvre qu'un chemin, et les petits montants
 * ordinaires passent très bien par un `float`.
 *
 * **Ce qu'elle lit et refuse.**
 *   A. Les fichiers où tout nombre décimal est de l'argent (`AiCostCalculator`, `AiBudget`, `AiMoney`,
 *      `AiModelCatalogue`, `AiModel`, `AiCall`, `AiUsageSetting`, `MontantIa`, `AiModelController`,
 *      `AiUsageController`) : aucun `float`, `double`, `(real)`, `round(`, `number_format(`, `array_sum(`
 *      ni `decimal:N`, nulle part, casts de modèle compris.
 *   B. Le reste du socle (`app/Ai`, `app/Services/Ai`, `app/Models/Ai*`, les contrôleurs IA, les requêtes
 *      IA, `RadarDashboardController`, `AiEval`) : ces mêmes motifs sur toute ligne qui nomme un montant.
 *      Une évaluation a des scores en `float` : la ligne doit nommer l'argent pour être refusée.
 *   C. Les usages : `dailyBudgetUsd()` rend `?string`, jamais `?float`.
 *   D. `config/ai.php` : un tarif de `pricing` et un montant de `budgets` s'écrivent en chaîne.
 *   E. Le XOF ne revient pas : plus aucun `*_xof` hors de `usd_to_xof` dans ces mêmes fichiers.
 *   F. Le front IA (`components/admin/super/ai`, `RadarWorkList`) : pas de `Number(`, `parseFloat(` ni
 *      `parseInt(` sur une ligne qui nomme un champ `*_usd`, un tarif ou le taux ; ni `+x_usd`, ni un
 *      `<` ou `>` sur un champ `*_usd`, qui comparerait des chaînes.
 *
 * **Ce qu'elle ne prouve pas.** Qu'un `float` n'arrive pas sous un autre nom, ni par une variable
 * intermédiaire sur une autre ligne d'un fichier du groupe B. Elle ne voit ni `$spent >= $cap` en PHP, ni
 * la somme d'une collection (`$calls->sum(...)`), que rien ne distingue d'une somme SQL. C'est une garde de
 * régression franche : l'exactitude se prouve par `AiCostsInDollarsTest` et, endpoint par endpoint, par
 * `AiTinyAmountsInEveryEndpointTest`. Le reste de la plateforme reste en XOF : plans,
 * prix, SMS et paiements n'entrent pas ici.
 *
 * Ses propres tests (`CAS_EPREUVE`) tournent à chaque invocation : une garde dont la lecture régresse
 * sort en 1 sur elle-même.
 *
 *   node scripts/check-ai-money.mjs            # garde
 *   node scripts/check-ai-money.mjs --report   # + les fichiers lus
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const API = join(ROOT, 'takussan-api');
const WEB = join(ROOT, 'takussan-web', 'src');

export const FLOTTANT = /\((?:float|double|real)\)|\b(?:floatval|doubleval)\(|\b(?:float|double)\b|\bround\(|\bnumber_format\(|\barray_sum\(|['"](?:decimal:\d+|real)['"]/;
export const CAST_OU_CONVERSION = /\((?:float|double|real)\)|\b(?:floatval|doubleval)\(|\?float\b|:\s*float\b|\bround\(|\bnumber_format\(|\barray_sum\(|['"](?:decimal:\d+|float|double|real)['"]/;
export const MONTANT = /cost_estimate|_usd\b|cost_usd|spent|budget|usd_to_xof|\bdailyBudget|\$usd\b|\$cost\b|\$price\b|\$row->cost\b|'(?:input|output|cache_read|cache_write)'/i;
export const XOF = /_xof\b|Xof\b/;
export const USAGE_FLOTTANTE = /function\s+dailyBudget\w*\([^)]*\)\s*:\s*\??float/;
export const TARIF_NOMBRE = /'(?:input|output|cache_read|cache_write)'\s*=>\s*\d/;
export const BUDGET_NOMBRE = /'daily_\w+_usd'\s*=>\s*\d/;
export const FRONT_NOMBRE = /(?:\bNumber\(|\bparseFloat\(|\bparseInt\(|\bNumber\.parseFloat\().*(?:_usd\b|usd_to_xof|\.(?:input|output|cache_read|cache_write)\b)|(?:_usd\b|usd_to_xof).*(?:\bNumber\(|\bparseFloat\(|\bparseInt\()|(?:^|[=(,:?\s])\+[\w.?]*_usd\b|_usd\b\s*(?:<=|>=|<(?!\/)|>)\s*[\w.]+/;

const ARGENT_SEUL = [
  'app/Services/Ai/AiCostCalculator.php',
  'app/Services/Ai/AiBudget.php',
  'app/Services/Ai/AiMoney.php',
  'app/Services/Ai/AiModelCatalogue.php',
  'app/Models/AiModel.php',
  'app/Models/AiCall.php',
  'app/Models/AiUsageSetting.php',
  'app/Http/Controllers/Api/Admin/AiUsageController.php',
  'app/Rules/MontantIa.php',
  'app/Http/Controllers/Api/Admin/AiModelController.php',
];

function arbre(dossier, filtre) {
  if (!existsSync(dossier)) return [];
  const sortie = [];
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) {
      if (nom !== '__tests__') sortie.push(...arbre(chemin, filtre));
    } else if (filtre(nom)) {
      sortie.push(chemin);
    }
  }
  return sortie;
}

const estPhp = (nom) => nom.endsWith('.php');

/**
 * Les lignes de code d'un fichier, sans leurs commentaires : un docblock peut raconter ce qu'il ne faut pas
 * faire. Le bloc se suit, car une ligne de code peut commencer par `*` : une multiplication reste du code.
 */
export function lignesDeCode(contenu) {
  let dansBloc = false;
  return contenu.split('\n').map((ligne) => {
    const brute = ligne.trim();
    if (dansBloc) {
      if (brute.includes('*/')) dansBloc = false;
      return '';
    }
    if (brute.startsWith('/*')) {
      dansBloc = !brute.includes('*/');
      return '';
    }
    return brute.startsWith('//') ? '' : ligne.replace(/\s\/\/.*$/, '');
  });
}

function fichiersDuSocle() {
  const dossierAdmin = join(API, 'app/Http/Controllers/Api/Admin');
  const requetes = join(API, 'app/Http/Requests/Api/Admin');
  const lus = [
    ...arbre(join(API, 'app/Ai'), estPhp),
    ...arbre(join(API, 'app/Services/Ai'), estPhp),
    ...readdirSync(join(API, 'app/Models')).filter((n) => /^Ai.*\.php$/.test(n)).map((n) => join(API, 'app/Models', n)),
    ...readdirSync(dossierAdmin).filter((n) => /^Ai.*\.php$/.test(n)).map((n) => join(dossierAdmin, n)),
    ...readdirSync(requetes).filter((n) => /Ai[A-Z].*\.php$/.test(n)).map((n) => join(requetes, n)),
    join(dossierAdmin, 'RadarDashboardController.php'),
    join(API, 'app/Console/Commands/AiEval.php'),
    join(API, 'app/Rules/MontantIa.php'),
  ];
  return [...new Set(lus)];
}

/** @returns {string[]} les violations d'un fichier PHP. */
export function violationsPhp(chemin, contenu, argentSeul) {
  const sortie = [];
  lignesDeCode(contenu).forEach((c, i) => {
    if (c === '') return;
    const ou = `${chemin}:${i + 1}`;
    if (argentSeul && FLOTTANT.test(c)) sortie.push(`${ou} — un fichier d'argent IA ne connaît pas le float : ${c.trim()}`);
    else if (!argentSeul && MONTANT.test(c) && CAST_OU_CONVERSION.test(c)) sortie.push(`${ou} — un montant IA passe par un float ou un arrondi : ${c.trim()}`);
    if (USAGE_FLOTTANTE.test(c)) sortie.push(`${ou} — dailyBudgetUsd() rend ?string : ${c.trim()}`);
    if (XOF.test(c.replaceAll('usd_to_xof', ''))) sortie.push(`${ou} — le XOF n'existe qu'à l'affichage (ADR-0086) : ${c.trim()}`);
  });
  return sortie;
}

/** @returns {string[]} les violations de `config/ai.php`. */
export function violationsConfig(contenu) {
  const sortie = [];
  lignesDeCode(contenu).forEach((c, i) => {
    if (TARIF_NOMBRE.test(c)) sortie.push(`config/ai.php:${i + 1} — un tarif s'écrit en chaîne : ${c.trim()}`);
    if (BUDGET_NOMBRE.test(c)) sortie.push(`config/ai.php:${i + 1} — un plafond s'écrit en chaîne : ${c.trim()}`);
    if (XOF.test(c.replaceAll('usd_to_xof', '').replaceAll('AI_USD_TO_XOF', ''))) sortie.push(`config/ai.php:${i + 1} — le XOF n'existe qu'à l'affichage : ${c.trim()}`);
  });
  return sortie;
}

/** @returns {string[]} les violations d'un fichier du front. */
export function violationsFront(chemin, contenu) {
  const sortie = [];
  lignesDeCode(contenu).forEach((c, i) => {
    if (FRONT_NOMBRE.test(c)) sortie.push(`${chemin}:${i + 1} — un montant IA ne passe pas par Number : ${c.trim()}`);
  });
  return sortie;
}

const CAS_EPREUVE = [
  ['cast decimal:N sur un fichier d\'argent', violationsPhp('x', "'input' => 'decimal:8',", true).length === 1],
  ['(float) sur un fichier d\'argent', violationsPhp('x', '$a = (float) $b;', true).length === 1],
  ['round sur un montant du socle', violationsPhp('x', "'cost_usd' => round($cost, 2),", false).length === 1],
  ['(float) sur un montant du socle', violationsPhp('x', "'spent' => (float) $spent,", false).length === 1],
  ['cast decimal:2 du socle', violationsPhp('x', "'daily_budget_usd' => 'decimal:2',", false).length === 1],
  ['un score reste un float', violationsPhp('x', "$sums[$field] = round($sum / $n, 4);", false).length === 0],
  ['un commentaire peut en parler', violationsPhp('x', '/**\n * `(float) $cost_estimate` serait faux\n */', true).length === 0],
  ['une multiplication n\'est pas un commentaire', violationsPhp('x', '$a = $b\n  * (float) $c;', true).length === 1],
  ['round sur le plafond d\'un contrôleur', violationsPhp('x', 'return $usd === null ? null : (string) round((float) $usd, 2);', false).length === 1],
  ['round seul sur $usd', violationsPhp('x', 'return round($usd, 2);', false).length === 1],
  ['(double) sur un fichier d\'argent', violationsPhp('x', '$a = (double) $b;', true).length === 1],
  ['(double) sur un montant du socle', violationsPhp('x', "'spent' => (double) $spent,", false).length === 1],
  ['doubleval sur un montant du socle', violationsPhp('x', '$c = doubleval($cost);', false).length === 1],
  ['(float) par la ligne de requête', violationsPhp('x', '$c = (float) $row->cost;', false).length === 1],
  ['round par la ligne de requête', violationsPhp('x', 'round($row->cost, 2)', false).length === 1],
  ['array_sum d\'un montant', violationsPhp('x', "$t = array_sum($spent);", false).length === 1],
  ['cast float sur un coût', violationsPhp('x', "'cost_estimate_usd' => 'float',", false).length === 1],
  ['cast double sur un plafond', violationsPhp('x', "'daily_budget_usd' => 'double',", false).length === 1],
  ['cast float sur un modèle d\'argent', violationsPhp('x', "'autre' => 'float',", true).length === 1],
  ['cast double sur un modèle d\'argent', violationsPhp('x', "'autre' => 'double',", true).length === 1],
  ['usage en float', violationsPhp('x', 'public function dailyBudgetUsd(): ?float', false).length >= 1],
  ['champ en XOF', violationsPhp('x', "'cost_xof' => $c,", false).length === 1],
  ['le taux reste permis', violationsPhp('x', "'usd_to_xof' => (string) config('ai.usd_to_xof'),", false).length === 0],
  ['tarif en nombre', violationsConfig("'x' => ['input' => 4.00, 'output' => '1'],").length === 1],
  ['tarif en chaîne', violationsConfig("'x' => ['input' => '4.00', 'output' => '1'],").length === 0],
  ['plafond en nombre', violationsConfig("'daily_global_usd' => 8.33,").length === 1],
  ['Number sur un champ du front', violationsFront('x', 'const a = Number(row.spent_today_usd);').length === 1],
  ['parseFloat sur un tarif du front', violationsFront('x', 'parseFloat(modele.input)').length === 1],
  ['Number hors argent', violationsFront('x', 'Number(e.target.value)').length === 0],
  ['plus unaire sur un champ du front', violationsFront('x', 'const a = +row.spent_today_usd;').length === 1],
  ['comparaison de chaînes du front', violationsFront('x', 'ai.spent_today_usd >= ai.daily_budget_usd').length === 1],
  ['une comparaison par la bibliothèque reste permise', violationsFront('x', 'comparerMontantsIa(ai.spent_today_usd, ai.daily_budget_usd) >= 0').length === 0],
];
const rates = CAS_EPREUVE.filter(([, ok]) => !ok).map(([nom]) => nom);
if (rates.length > 0) {
  console.error(`✗ check-ai-money : la lecture a régressé (${rates.join(' ; ')}).`);
  process.exit(1);
}

const violations = [];
const lusPhp = fichiersDuSocle();
for (const relatif of ARGENT_SEUL) {
  if (!existsSync(join(API, relatif))) violations.push(`${relatif} — fichier d'argent introuvable : la garde ne le lit plus.`);
}
for (const chemin of lusPhp) {
  if (!existsSync(chemin)) {
    violations.push(`${relative(ROOT, chemin)} — introuvable : la garde ne le lit plus.`);
    continue;
  }
  const relatif = relative(API, chemin);
  violations.push(...violationsPhp(relative(ROOT, chemin), readFileSync(chemin, 'utf8'), ARGENT_SEUL.includes(relatif)));
}
violations.push(...violationsConfig(readFileSync(join(API, 'config/ai.php'), 'utf8')));
const lusFront = [
  ...arbre(join(WEB, 'components/admin/super/ai'), (n) => /\.tsx?$/.test(n)),
  join(WEB, 'components/admin/super/radar/RadarWorkList.tsx'),
];
for (const chemin of lusFront) {
  violations.push(...violationsFront(relative(ROOT, chemin), readFileSync(chemin, 'utf8')));
}

if (REPORT) {
  console.log(`Fichiers d'argent : ${ARGENT_SEUL.length}`);
  console.log(`Fichiers du socle lus : ${lusPhp.length}`);
  console.log(`Fichiers du front lus : ${lusFront.length}`);
}
if (violations.length > 0) {
  console.error('✗ check-ai-money : un montant du socle IA quitte les chaînes décimales (ADR-0086).');
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`✓ check-ai-money : ${lusPhp.length} fichiers PHP et ${lusFront.length} du front sans float sur un montant IA`);
