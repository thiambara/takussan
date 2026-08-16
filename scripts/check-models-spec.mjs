#!/usr/bin/env node
/**
 * Garde de COUVERTURE de la source de vérité data : tout modèle Eloquent de premier niveau
 * (`takussan-api/app/Models/*.php`) doit être mentionné dans `docs/models-spec.md`.
 *
 * **Pourquoi elle existe.** `docs/models-spec.md` est *désigné* source de vérité data. Mesuré le
 * 2026-08-16 : **16 modèles sur 62** n'y étaient mentionnés nulle part — `RoleDelegation`,
 * `WizardDraft`, `ThresholdAlert`, `WelcomeView`, `PropertyContactLead`, `PropertyReport`,
 * `AccountDeletionRequest`, `DataExport`… Ils existaient en base et en code depuis des mois.
 *
 * Le coût n'est pas l'absence, c'est le SENS que l'absence prend dans un document qui prétend
 * couvrir le domaine : le lecteur ne conclut pas « ce n'est pas documenté », il conclut « ça n'existe
 * pas encore, c'est à créer ». *Un inventaire incomplet qui se présente comme complet ne se lit pas
 * comme un silence — il se lit comme une négation.*
 *
 * L'ardoise D-18 le portait depuis le 2026-08-12 avec une liste déjà périmée quand on l'a rouverte :
 * même total (16), moitié de noms différents. Une dette re-mesurée à la main dérive ; une dette
 * mesurée par une garde, non.
 *
 * **Ce que cette garde NE prouve PAS.** Elle vérifie qu'un NOM apparaît, pas qu'il est correctement
 * décrit. Un modèle cité une fois en note de bas de page la satisfait. C'est délibérément un
 * cliquet — un plancher qui empêche la régression franche — et pas une mesure de qualité de la
 * spec. Chercher un jeton ne mesure pas une propriété (dette D-23) : le dire ici évite qu'un vert
 * soit lu pour plus qu'il ne vaut, et c'est écrit dans la sortie du script, pas seulement ici.
 *
 * Usage :
 *   node scripts/check-models-spec.mjs            # garde, sort en 1 au moindre modèle absent
 *   node scripts/check-models-spec.mjs --report   # + l'inventaire complet
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

const MODELS_DIR = join(ROOT, 'takussan-api', 'app', 'Models');
const SPEC = join(ROOT, 'docs', 'models-spec.md');

/**
 * Exclusions JUSTIFIÉES, et chacune doit l'être par écrit.
 *
 * Le dossier `app/Models/` ne contient à sa racine que des modèles Eloquent concrets — les classes
 * de base sont dans `Bases/`, les traits dans `Concerns/`, les enums dans `Enums/`, les profils dans
 * `Profiles/`. On ne descend donc pas dans les sous-dossiers : ce sont d'autres natures d'objet, et
 * les profils polymorphes ont déjà leur section (§34–39, §51).
 *
 * Cette map reste vide tant qu'aucun modèle de premier niveau n'a de raison écrite de ne pas figurer
 * dans la spec. *Une liste d'exemptions est une dette visible ; une exemption implicite est une
 * dette invisible.*
 */
const EXCLUS_JUSTIFIES = new Map([
  // Vide, et c'est l'état sain : les 62 modèles de premier niveau sont couverts.
]);

if (!existsSync(SPEC)) {
  console.error(`✗ ${SPEC.slice(ROOT.length + 1)} est introuvable.`);
  console.error('  La garde ne peut rien vérifier — elle le dit plutôt que de passer en silence.');
  process.exit(1);
}
if (!existsSync(MODELS_DIR)) {
  console.error(`✗ ${MODELS_DIR.slice(ROOT.length + 1)} est introuvable.`);
  process.exit(1);
}

const spec = readFileSync(SPEC, 'utf8');

const modeles = readdirSync(MODELS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && e.name.endsWith('.php'))
  .map((e) => e.name.slice(0, -4))
  .sort();

if (modeles.length === 0) {
  // Une garde qui parcourt une liste vide passe au vert sans rien avoir vérifié : c'est la forme de
  // vacuité la plus difficile à voir, parce que la sortie ressemble à un succès.
  console.error(`✗ aucun modèle trouvé dans ${MODELS_DIR.slice(ROOT.length + 1)} — la garde n'aurait rien vérifié.`);
  process.exit(1);
}

/**
 * « Mentionné » = le nom de classe apparaît comme MOT ENTIER dans la spec.
 *
 * La borne de mot compte, et pas pour la beauté du geste : sans elle, `Payout` serait « trouvé »
 * dans `PlatformPayout`, `Document` dans `DocumentShareLink`, `Property` dans `PropertyReport`,
 * `Task` dans `ScheduledTaskRun` — tout modèle dont le nom est une sous-chaîne d'un autre serait
 * certifié documenté par la seule présence de son voisin. **Mesuré le 2026-08-16 : 13 des 62 noms
 * sont sous-chaînes d'un autre** — `Agency`, `Announcement`, `BankStatement`, `Booking`,
 * `Conversation`, `Customer`, `Document`, `Integration`, `Lease`, `Payout`, `Property`, `Task`,
 * `User`. Une recherche par sous-chaîne aurait donc rendu la garde aveugle sur un cinquième de son
 * inventaire.
 *
 * `\b` en JS ne coupe pas entre deux majuscules (`Payout` matche dans `PlatformPayout` par la
 * gauche : le `\b` tombe entre `m` et `P`). On borne donc explicitement sur les caractères de mot
 * PHP — lettres, chiffres, `_` — de part et d'autre.
 */
const mentionne = (nom) => new RegExp(`(?<![\\w])${nom}(?![\\w])`).test(spec);

const documentes = [];
const absents = [];

for (const m of modeles) {
  if (mentionne(m)) documentes.push(m);
  else absents.push(m);
}

if (REPORT) {
  console.log(`Modèles de premier niveau : ${modeles.length}\n`);
  for (const m of documentes) console.log(`  ✓ documenté   ${m}`);
  for (const m of absents) {
    const j = EXCLUS_JUSTIFIES.get(m);
    console.log(`  ${j ? '~' : '✗'} ABSENT       ${m}${j ? `   exclusion justifiée (${j})` : ''}`);
  }
  console.log();
}

const erreurs = absents.filter((m) => !EXCLUS_JUSTIFIES.has(m));

// L'inverse compte aussi : une exemption dont le modèle a disparu, ou qui est désormais documentée,
// devient un cimetière que plus personne ne relit.
for (const [m, motif] of EXCLUS_JUSTIFIES) {
  if (!modeles.includes(m)) {
    console.error(`✗ \`${m}\` est dans EXCLUS_JUSTIFIES (${motif}) mais n'existe plus dans app/Models/ — l'entrée est morte.`);
    process.exit(1);
  }
  if (documentes.includes(m)) {
    console.error(`✗ \`${m}\` est désormais documenté : retire-le de EXCLUS_JUSTIFIES (${motif}) — une exemption périmée n'exempte plus rien.`);
    process.exit(1);
  }
}

if (erreurs.length === 0) {
  console.log(`✓ couverture models-spec : ${documentes.length}/${modeles.length} modèles de premier niveau mentionnés, ${EXCLUS_JUSTIFIES.size} exclusion(s) justifiée(s).`);
  console.log('  ⚠ PORTÉE : cette garde vérifie qu\'un NOM apparaît, jamais qu\'il est bien décrit.');
  console.log('    Un modèle cité une seule fois en note la satisfait. C\'est un plancher contre la');
  console.log('    régression franche, pas une mesure de la qualité de la spec.');
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} modèle(s) de premier niveau absent(s) de docs/models-spec.md :\n`);
for (const m of erreurs) {
  console.error(`  · \`${m}\` (takussan-api/app/Models/${m}.php) n'est mentionné NULLE PART dans docs/models-spec.md.`);
}
console.error(`
  docs/models-spec.md est désigné source de vérité data. Un modèle qui n'y figure pas n'y est pas
  lu comme « non documenté » mais comme « n'existe pas encore, à créer » — c'est ce qui a coûté
  16 modèles fantômes pendant des mois (dette D-18, TCK-310).

  Documente-le d'après le CODE et la MIGRATION — colonnes, types, défauts, nullabilité, index,
  contraintes, comportements FK, relations réellement déclarées. Pas d'après le nom du modèle : la
  passe de synchronisation 009 a produit quatre recommandations sur un schéma déduit, et aucune de
  ses colonnes n'existait.

  Si l'absence est délibérée, inscris-la dans EXCLUS_JUSTIFIES avec son motif — jamais en silence.
`);
process.exit(1);
