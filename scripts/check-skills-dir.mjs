#!/usr/bin/env node
/**
 * Garde du RÉPERTOIRE DE COMPÉTENCES : les compétences écrites par ce dépôt vivent à UN seul
 * endroit, `.agent/skills/`.
 *
 * ─── Le défaut qu'elle attrape a été réel, et il a duré trois mois ───────────────────────────
 *
 * Deux répertoires de compétences étaient suivis par git : `.agent/` (646 fichiers) et `.agents/`
 * (602 fichiers). Les quatre points d'entrée du dépôt — `.claude/commands/{implement,write}-spec.md`
 * et `.windsurf/workflows/{implement,write}-spec.md`, tous quatre relayés par `.agent/workflows/` —
 * désignent `.agent/`. **Aucun fichier de ce dépôt ne référençait `.agents/`.** Personne ne le
 * chargeait, et rien ne le disait.
 *
 * Le coût n'était pas les 602 fichiers dupliqués, c'était le doute. Le 2026-05-18, quelqu'un a
 * corrigé la ligne d'autorisation d'`implementing-specs` — « `spatie/laravel-permission` a été
 * retiré, les capacités sont résolues par `MembershipCapabilityResolver` » — et l'a corrigée dans
 * `.agents/`, le répertoire que personne ne charge. La correction était juste. Elle n'a jamais
 * atteint le fichier que les outils lisent, et pendant trois mois chaque agent qui a implémenté un
 * ticket a lu qu'il fallait utiliser un paquet désinstallé, sur lequel une garde CI casse à
 * l'import. Aucune erreur, aucun lint, aucune CI ne l'a signalé : *un répertoire mort n'est pas
 * inerte, il est absorbant.*
 *
 * ─── Ce que cette garde vérifie, exactement ─────────────────────────────────────────────────
 *
 * Elle ne cherche PAS « est-ce que le répertoire `.agents/` est revenu » — ce serait mesurer une
 * ressemblance avec le dernier bug, et le prochain s'appellera `.agent-skills/` ou `.codex/`. Elle
 * vérifie deux propriétés :
 *
 *   1. **Unicité.** Aucune compétence écrite par ce dépôt n'existe hors de `.agent/skills/`.
 *   2. **Non-vacuité.** `.agent/skills/` porte bien les compétences que les points d'entrée
 *      désignent. Une garde qui ne trouve plus rien à vérifier sort verte, ce qui est le pire des
 *      deux mondes.
 *
 * ─── Comment « écrite par ce dépôt » se mesure, sans liste à tenir à jour ────────────────────
 *
 * Les compétences installées par un greffon portent un PRÉFIXE DE FOURNISSEUR (`bmad-`, `wds-`),
 * et leurs installateurs les répliquent légitimement sous `.agent/`, `.claude/` et `.windsurf/` —
 * 77 sous chacun des deux derniers. Les répliquer n'est pas le défaut : c'est leur mode de pose,
 * et elles ne sont éditées par personne ici.
 *
 * Les compétences que ce dépôt ÉCRIT n'en portent aucun. Mesuré le 2026-08-16 : 15 sous
 * `.agent/skills/`, ZÉRO sous `.claude/skills/` et `.windsurf/skills/` (77 entrées chacun, toutes
 * préfixées). Le critère « pas de préfixe de fournisseur » sépare donc exactement les deux
 * populations, et il n'exige aucune liste nominative — une compétence ajoutée demain est couverte
 * le jour où elle est écrite, sans que personne ait pensé à inscrire son nom ici.
 *
 * *C'est délibéré : une liste tenue à la main est fausse dès le prochain ajout, et fausse avec
 * l'autorité d'une garde verte.* Le seul nom écrit en dur ci-dessous est celui des deux
 * compétences que les points d'entrée désignent nommément, et c'est le contrôle de non-vacuité.
 *
 * Usage :
 *   node scripts/check-skills-dir.mjs            # garde, sort en 1 au moindre écart
 *   node scripts/check-skills-dir.mjs --report   # + l'inventaire de ce qui a été lu
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');

/** Le répertoire qui fait foi — celui que les quatre points d'entrée désignent (TCK-303). */
const CANONIQUE = '.agent/skills';

/**
 * Les préfixes de fournisseur — les seules compétences qu'on accepte de voir répliquées.
 *
 * Ce ne sont pas des exceptions de confort : ces arbres sont POSÉS par un installateur de greffon,
 * personne ne les édite dans ce dépôt, et une divergence entre deux copies s'y corrige en
 * réinstallant. Le défaut que cette garde existe pour attraper — une correction écrite dans la
 * mauvaise copie et perdue — ne peut pas s'y produire.
 */
const PREFIXES_FOURNISSEUR = ['bmad-', 'wds-'];

/**
 * Le contrôle de NON-VACUITÉ — parce que « aucune copie parasite » n'est pas « la bonne copie ».
 *
 * Prouvé par mutation : en renommant `.agent/skills/` tout entier, la première version de cette
 * garde restait VERTE. Elle ne trouvait plus aucune compétence hors du canonique, pour l'excellente
 * raison qu'elle n'en trouvait plus du tout — et les quatre points d'entrée pointaient dans le
 * vide sans que rien ne le dise.
 *
 * Ces deux noms-là sont écrits en dur parce que ce sont ceux que `.claude/commands/` et
 * `.windsurf/workflows/` citent nommément. Ils ne peuvent pas disparaître sans casser les points
 * d'entrée, donc les exiger ici ne crée aucune dette de maintenance.
 */
const EXIGEES = ['implementing-specs', 'writing-specs'];

/** Une compétence sans préfixe de fournisseur est une compétence écrite par ce dépôt. */
const estEcriteIci = (nom) => !PREFIXES_FOURNISSEUR.some((p) => nom.startsWith(p));

/**
 * Tout répertoire SUIVI PAR GIT qui porte un `<nom>/SKILL.md`.
 *
 * L'énumération passe par `git ls-files` et non par un parcours du système de fichiers. Ce n'est
 * pas une optimisation, c'est une correction : la première version descendait depuis la racine avec
 * une liste noire (`node_modules`, `vendor`, `.git`…) et signalait **105 écarts** sur une machine de
 * développement — tous situés dans `.claude/worktrees/`, les copies de travail que l'outillage
 * d'agents crée et que git ignore.
 *
 * Ces copies n'existent pas sur le runner : la garde était donc **verte en CI et rouge en local**,
 * ce qui est le pire des deux états — celui après lequel on cesse de la lancer. Et le défaut est
 * structurel, pas circonstanciel : une liste noire ne peut écarter que les répertoires qu'on a déjà
 * rencontrés, et le prochain ne s'appellera pas `.claude/worktrees/`.
 *
 * `git ls-files` répond exactement à la question posée — *ce dépôt contient-il une compétence hors
 * du canonique ?* — puisque « ce dépôt contient » signifie « git suit ». *Quand une garde et son
 * périmètre divergent, c'est le périmètre qu'il faut dériver, pas la liste d'exceptions qu'il faut
 * allonger.*
 */
function trouverCompetences() {
  const sortie = execFileSync('git', ['ls-files', '--full-name', '*SKILL.md'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const chemins = sortie
    .split('\n')
    .filter(Boolean)
    .map((fichier) => dirname(fichier))
    .sort();

  // ⚠ **Une compétence ne contient pas d'autres compétences.** Le parcours d'origine coupait la
  // descente dès qu'il rencontrait un `SKILL.md` ; le passage à `git ls-files` a perdu cette règle,
  // et la garde a aussitôt signalé `bmad-module-builder/assets/setup-skill-template/SKILL.md` —
  // qui est un GABARIT livré à l'intérieur d'une compétence vendue, pas une compétence.
  //
  // Le préfixe éditeur est porté par le répertoire de tête (`bmad-module-builder`), pas par la
  // feuille (`setup-skill-template`) : juger la feuille, c'est déclarer « écrit ici » tout asset
  // qu'un fournisseur imbrique. On écarte donc ce qui est imbriqué sous une compétence déjà vue —
  // le tri lexicographique garantit que le parent précède ses enfants.
  const racines = [];
  for (const chemin of chemins) {
    if (racines.some((r) => chemin.startsWith(`${r}/`))) continue;
    racines.push(chemin);
  }

  return racines.map((chemin) => ({ nom: chemin.split('/').pop(), chemin }));
}

const toutes = trouverCompetences();
const ecritesIci = toutes.filter((c) => estEcriteIci(c.nom));
const canoniques = ecritesIci.filter((c) => c.chemin.startsWith(`${CANONIQUE}/`));
const parasites = ecritesIci.filter((c) => !c.chemin.startsWith(`${CANONIQUE}/`));

const erreurs = [];

// ── Propriété 1 : unicité ───────────────────────────────────────────────────────────────────
for (const c of parasites) {
  erreurs.push(
    `${c.chemin}/SKILL.md — compétence écrite par ce dépôt, hors de \`${CANONIQUE}/\`.`,
  );
}

// ── Propriété 2 : non-vacuité ───────────────────────────────────────────────────────────────
if (!existsSync(join(ROOT, CANONIQUE))) {
  erreurs.push(
    `\`${CANONIQUE}/\` est introuvable — les quatre points d'entrée du dépôt pointent dans le vide.`,
  );
} else {
  for (const nom of EXIGEES) {
    if (!canoniques.some((c) => c.nom === nom)) {
      erreurs.push(
        `\`${CANONIQUE}/${nom}/SKILL.md\` est introuvable — `
        + `\`.claude/commands/\` et \`.windsurf/workflows/\` le citent nommément.`,
      );
    }
  }
}

if (REPORT) {
  const parEmplacement = new Map();
  for (const c of toutes) {
    const racine = c.chemin.split('/').slice(0, -1).join('/');
    parEmplacement.set(racine, (parEmplacement.get(racine) ?? 0) + 1);
  }
  console.log(`Répertoire canonique : ${CANONIQUE}/  (TCK-303)`);
  console.log(`Préfixes de fournisseur tolérés hors canonique : ${PREFIXES_FOURNISSEUR.join(', ')}\n`);
  console.log(`Arbres de compétences trouvés (${parEmplacement.size}) :`);
  for (const [emplacement, n] of [...parEmplacement].sort()) {
    console.log(`  ${String(n).padStart(3)} compétence(s)  ${emplacement}/`);
  }
  console.log(`\nÉcrites par ce dépôt (sans préfixe de fournisseur) : ${ecritesIci.length}`);
  for (const c of ecritesIci.sort((a, b) => a.chemin.localeCompare(b.chemin))) {
    console.log(`  ${c.chemin}`);
  }
  console.log();
}

if (erreurs.length === 0) {
  console.log(
    `✓ répertoire de compétences unique : ${canoniques.length} compétence(s) écrite(s) par ce dépôt, `
    + `toutes sous \`${CANONIQUE}/\` (${toutes.length - ecritesIci.length} de fournisseur ignorées).`,
  );
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} écart(s) sur le répertoire de compétences :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
console.error(
  `\nLes compétences écrites par ce dépôt vivent sous \`${CANONIQUE}/\`, et nulle part ailleurs.\n`
  + `Un second répertoire n'est pas une sauvegarde : c'est une chance sur deux de corriger la copie\n`
  + `que personne ne charge. C'est arrivé — la correction « spatie/laravel-permission a été retiré »\n`
  + `a été écrite dans \`.agents/\` le 2026-05-18 et n'a atteint \`.agent/\` que trois mois plus tard\n`
  + `(TCK-303, ardoise D-46).\n`
  + `Si un outil tiers exige son propre arbre, il pose des compétences PRÉFIXÉES\n`
  + `(${PREFIXES_FOURNISSEUR.join(', ')}) — celles-là sont ignorées par cette garde.`,
);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde.
process.exit(1);
