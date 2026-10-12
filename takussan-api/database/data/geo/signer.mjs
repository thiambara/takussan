#!/usr/bin/env node
/**
 * TCK-633 (ADR-0062 §3) — signe la RELECTURE humaine de fichiers de région.
 *
 *   node database/data/geo/signer.mjs "Prénom Nom" database/data/geo/regions/sn-dk.json [...]
 *
 * Se lance au nom de la personne qui a RELU, jamais au nom d'un agent ni avec un nom inventé
 * (`docs/plans/rapports/tck-633-geo-relecture.md`). Écrit trois champs de `source`, et rien d'autre :
 *
 *   · `relu_par`        — la personne : au moins un prénom et un nom, aucun mot qui désigne un
 *                         outil ou un agent (voir `nomValide`, `MOTS_REFUSES`) ;
 *   · `relu_le`         — la date du jour, AAAA-MM-JJ ;
 *   · `relu_empreinte`  — sha256 du CONTENU relu (`empreinte`). La signature est liée à ce que la
 *                         personne a lu ET à qui l'a lu, quand : toute modification ultérieure du
 *                         fichier — un nom, une coordonnée, une ville retirée, mais aussi le nom du
 *                         relecteur ou la date — la rend caduque, et
 *                         `tests/Unit/Geo/GeoDatasetReviewedTest.php` rougit.
 *
 * Le contenu canonique est le fichier entier, privé de `relu_empreinte` SEULE — `relu_par` et
 * `relu_le` y entrent —, sérialisé par `JSON.stringify` sans indentation. Le test le recalcule en PHP (`json_encode` avec
 * `JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES`, `serialize_precision = -1`) : les deux
 * écritures coïncident, épinglé par `test_l_empreinte_est_celle_du_script_de_signature`.
 *
 * Une ré-extraction (`extract.mjs`) remet les trois champs à `null` : elle annule la relecture.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Les champs HORS de l'empreinte : l'empreinte elle-même, et rien d'autre. `relu_par` et `relu_le`
 * sont signés — remplacer le nom du relecteur après coup rend la signature caduque.
 */
export const CHAMPS_HORS_EMPREINTE = ['relu_empreinte'];

/** Le contenu relu, signataire et date compris, sans l'empreinte elle-même. */
export function contenuCanonique(jeu) {
  const copie = JSON.parse(JSON.stringify(jeu));
  for (const champ of CHAMPS_HORS_EMPREINTE) delete copie.source?.[champ];
  return JSON.stringify(copie);
}

export function empreinte(jeu) {
  return createHash('sha256').update(contenuCanonique(jeu), 'utf8').digest('hex');
}

/**
 * Un prénom et un nom : deux mots au moins, séparés d'une espace, le premier et le dernier
 * commençant par une capitale. Chaque mot compte deux lettres au moins, et une apostrophe ou un
 * trait d'union ne s'y trouve qu'ENTRE deux lettres (« N'Diaye », « Jean-Pierre » ; pas « A- »).
 * Refuse « x », une adresse e-mail, « fixture de test », « A B », « A- B- ».
 * Même expression que `GeoDatasetReviewedTest::NOM_DE_PERSONNE`.
 */
const MOT = "(?=[^ ]*\\p{L}[^ ]*\\p{L})\\p{L}+(?:['’-]\\p{L}+)*";
export const NOM_DE_PERSONNE = new RegExp(`^(?=\\p{Lu})${MOT}(?: ${MOT})* (?=\\p{Lu})${MOT}$`, 'u');

/**
 * Les mots qui désignent un outil ou un agent, refusés en MOT ENTIER (un mot = ce que séparent une
 * espace OU un trait d'union : « Claude-Code Anthropic » est refusé ; « Aïda » ou « Botha » restent
 * des noms), sans égard à la casse. « Claude » seul est un prénom (« Claude Diop »,
 * « Jean-Claude Diop ») : seule la suite « claude code » est refusée. Même liste que `GeoDatasetReviewedTest::MOTS_REFUSES`, qui la relit ici.
 */
export const MOTS_REFUSES = ['agent', 'bot', 'ia', 'ai', 'assistant', 'codex', 'gpt', 'chatgpt', 'copilot', 'anthropic', 'openai', 'gemini'];

export function nomValide(nom) {
  const mots = nom.toLowerCase().split(/[ -]+/);
  const claudeCode = mots.some((mot, i) => mot === 'claude' && mots[i + 1] === 'code');
  return NOM_DE_PERSONNE.test(nom) && !claudeCode && !mots.some((mot) => MOTS_REFUSES.includes(mot));
}

function principal() {
  const [brut, ...fichiers] = process.argv.slice(2);
  const nom = (brut ?? '').trim().replace(/\s+/g, ' ');
  if (!nomValide(nom) || fichiers.length === 0) {
    console.error('usage : node signer.mjs "<Prénom Nom de la personne qui a relu>" <fichier.json>...');
    process.exit(2);
  }
  const aujourdhui = new Date().toISOString().slice(0, 10);
  for (const f of fichiers) {
    const jeu = JSON.parse(readFileSync(f, 'utf8'));
    jeu.source.relu_par = nom;
    jeu.source.relu_le = aujourdhui;
    jeu.source.relu_empreinte = empreinte(jeu);
    writeFileSync(f, `${JSON.stringify(jeu, null, 2)}\n`);
    console.log(`✓ ${f} : relu par ${nom} le ${aujourdhui}, empreinte ${jeu.source.relu_empreinte.slice(0, 12)}…`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal();
}
