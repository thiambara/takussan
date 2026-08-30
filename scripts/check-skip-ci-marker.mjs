#!/usr/bin/env node
/**
 * Garde du MARQUEUR D'EXCLUSION GLOBAL de GitHub — celui qui éteint la CI d'une PR
 * qui n'a rien demandé.
 *
 * ── LE DÉFAUT QU'ELLE EXISTE POUR NOMMER (TCK-479, mesuré le 2026-08-30) ─────────────────
 *
 * GitHub applique `[skip ci]` — et ses quatre synonymes, et le trailer `skip-checks` — au
 * COMMIT, pas à l'événement. Tous les événements `push` et `pull_request` qui visent ce
 * commit sont sautés, quel que soit leur âge et leur rapport avec lui. Un commit qui porte
 * le marqueur et qui devient la TÊTE d'une branche éteint donc, en plus du push qui l'a
 * créé, la CI de **toute PR ouverte plus tard sur cette branche**.
 *
 * `api-ci.yml` poussait sur `dev` un commit de carte d'impact marqué de la sorte. Sur les 12
 * dernières PR `dev` → `preview` — celles qui déploient `preview.api.takussan.com` — **7
 * n'ont exécuté AUCUN workflow du dépôt**. Elles ne le disaient pas : `mergeable: MERGEABLE`,
 * `mergeStateStatus: CLEAN`, et un vert — celui de Vercel, qui n'est pas GitHub Actions et
 * ignore le marqueur. *Un vert unique sur une PR d'intégration ressemble exactement à une CI
 * qui a tourné.*
 *
 * ── ET CE N'EST PAS UN DÉFAUT DE BOT ─────────────────────────────────────────────────────
 *
 * Le premier commit de TCK-479 n'a déclenché aucun workflow non plus. Il n'était pas du bot :
 * c'était le commit qui **décrivait** le défaut, et qui citait le marqueur trois fois dans
 * son corps pour l'expliquer — entre guillemets inverses. GitHub lit le message ENTIER, et
 * ne distingue pas une mention d'une directive. *Le commit qui documentait le mécanisme l'a
 * déclenché sur lui-même.* C'est pourquoi cette garde regarde le message, pas l'auteur.
 *
 * ── ⚠ PORTÉE — CE CONTRÔLE A EST VERT PAR CONSTRUCTION EN CI, ET IL FAUT LE DIRE ─────────
 *
 * Le défaut supprime son propre détecteur : si la tête porte le marqueur, aucun workflow ne
 * tourne, Repo CI compris, et cette garde n'est pas exécutée. Quand elle EST exécutée en CI,
 * le contrôle A est donc vert d'avance. Ce n'est pas une faiblesse qu'on pourrait corriger
 * en la câblant ailleurs : c'est une propriété du défaut. Aucun événement `push` ni
 * `pull_request` ne peut voir ce cas.
 *
 * Son point d'exécution utile est donc AVANT le push :
 *
 *   · le rituel de `CLAUDE.md` — `for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done`
 *     — qui l'attrape sur la tête locale, au moment où le message se corrige encore ;
 *   · avant d'ouvrir une PR d'intégration, sur la tête distante :
 *
 *         git fetch origin dev && node scripts/check-skip-ci-marker.mjs --tete origin/dev
 *
 *     Vert = la PR `dev` → `preview` exécutera les workflows. Rouge = elle se présentera
 *     `CLEAN` sans avoir rien vérifié.
 *
 * Le contrôle B, lui, n'est PAS tautologique en CI : c'est lui qui garde le remède.
 *
 * ── CONTRÔLE B — LES DEUX CÔTÉS DE L'ANTI-BOUCLE ─────────────────────────────────────────
 *
 * Le marqueur global n'a pas été retiré d'`api-ci.yml` sans remplacement : il coupait une
 * vraie boucle (le step pousse la carte → le push relance API CI → qui régénère → qui
 * repousse). Le frein est maintenant un marqueur PROPRE AU DÉPÔT, `[carte-impact]`, écrit
 * dans le message ET lu par une condition `if:`. Deux côtés, deux fichiers de pensée, et
 * une divergence qui ne se signale pas : si le message change et pas la condition, la boucle
 * repart, en silence, un dimanche.
 *
 * Cette garde les compare, en partant du message (la source), et vérifie les DEUX freins :
 * la condition de job (qui évite de payer la suite entière) et celle du step qui pousse
 * (qui, elle, est ce qui empêche réellement la boucle).
 *
 * Usage :
 *   node scripts/check-skip-ci-marker.mjs
 *   node scripts/check-skip-ci-marker.mjs --report
 *   node scripts/check-skip-ci-marker.mjs --tete origin/dev
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = process.argv.includes('--report');
const WORKFLOWS = join(ROOT, '.github', 'workflows');
const API_CI_REL = '.github/workflows/api-ci.yml';

const iTete = process.argv.indexOf('--tete');
const TETE_DEMANDEE = iTete !== -1 ? process.argv[iTete + 1] : null;

const erreurs = [];
const notes = [];

// ──────────────────────────────────────────────────────────────────────────────────────────
// LES FORMES QUE GITHUB RECONNAÎT
//
// Source : docs GitHub « Skipping workflow runs ». Elles sont insensibles à la casse et
// cherchées dans le message ENTIER (sujet et corps), guillemets inverses compris.
//
// ⚠ La liste est écrite ici parce qu'elle ne se déduit d'aucun fichier du dépôt. Si GitHub
// en ajoute une, cette garde ne le saura pas — elle rend un plancher, pas une preuve.
// ──────────────────────────────────────────────────────────────────────────────────────────
const FORMES = [
  /\[\s*skip[ _-]+ci\s*\]/i,
  /\[\s*ci[ _-]+skip\s*\]/i,
  /\[\s*no[ _-]+ci\s*\]/i,
  /\[\s*skip[ _-]+actions\s*\]/i,
  /\[\s*actions[ _-]+skip\s*\]/i,
  /\*\*\*\s*NO_CI\s*\*\*\*/i,
  // Le trailer : `skip-checks: true` sur sa propre ligne, dans le corps.
  /^\s*skip-checks\s*:\s*true\s*$/im,
];

const porteLeMarqueur = (message) => FORMES.filter((re) => re.test(message));

// ──────────────────────────────────────────────────────────────────────────────────────────
// L'AUTO-ÉPREUVE — elle tourne à chaque invocation, avant tout scan.
//
// Le mode d'échec d'une garde à expressions régulières n'est pas de rougir à tort : c'est de
// CESSER DE MATCHER, et de sortir en 0 pour toujours avec l'air de travailler. Les cas
// « doit rougir » sont ceux qui ont réellement éteint la CI de ce dépôt, plus leurs
// variantes de casse et de position.
// ──────────────────────────────────────────────────────────────────────────────────────────
function autoEpreuve() {
  const doitRougir = [
    'chore(tests): régénérer la carte [skip ci]',
    'fix: quelque chose [ci skip]',
    'chore: [SKIP CI] en majuscules',
    'chore: [no ci]',
    'chore: [skip actions]',
    'chore: [actions skip]',
    'chore: ***NO_CI***',
    // Le cas qui a coûté le plus cher : une MENTION dans le corps, entre guillemets
    // inverses, par un commit qui expliquait le mécanisme.
    'fix(ci): documenter le défaut\n\nCause : le job commite en `[skip ci]` après chaque\npush sur `dev`.\n',
    'chore: trailer\n\nskip-checks: true\n',
    'chore: espaces [ skip ci ]',
  ];
  const doitPasser = [
    "chore(tests): régénérer la carte d'impact [carte-impact]",
    'feat(ci): brancher une garde de plus sur la CI',
    'fix: ne plus skip la validation du formulaire',
    // Sans crochets, ce n'est pas une directive — et une garde qui refuserait la phrase
    // rendrait impossible d'écrire ce ticket.
    "docs: expliquer pourquoi on ne veut plus skip ci sur la tête de dev",
    'chore: skip-checks est mentionné mais pas seul sur sa ligne : skip-checks: true dans une phrase',
  ];

  for (const cas of doitRougir) {
    if (porteLeMarqueur(cas).length === 0) {
      throw new Error(`AUTO-ÉPREUVE ÉCHOUÉE — la garde n'attrape plus : ${JSON.stringify(cas)}`);
    }
  }
  for (const cas of doitPasser) {
    const touches = porteLeMarqueur(cas);
    if (touches.length > 0) {
      throw new Error(
        `AUTO-ÉPREUVE ÉCHOUÉE — la garde refuse à tort : ${JSON.stringify(cas)}\n` +
          `  forme(s) déclenchée(s) : ${touches.map(String).join(' · ')}`,
      );
    }
  }
  return doitRougir.length + doitPasser.length;
}

let casEprouves;
try {
  casEprouves = autoEpreuve();
} catch (e) {
  console.error(`✗ ${e.message}`);
  console.error(
    `\n  Une garde à expressions régulières qui ne matche plus sort en 0 en ayant l'air de\n` +
      `  travailler. Corriger les formes, pas l'auto-épreuve.`,
  );
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// CONTRÔLE A — la tête ne porte pas le marqueur global
// ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Quelle tête regarder.
 *
 * ⚠ Sur un événement `pull_request`, `actions/checkout` place l'arbre sur le commit de
 * FUSION (`refs/pull/N/merge`), dont le message est « Merge <sha> into <sha> » : `HEAD` n'est
 * PAS la tête de la PR, et la lire ici mesurerait un commit que GitHub n'a jamais consulté.
 * La tête réelle est dans la charge utile de l'événement.
 */
function refDeLaTete() {
  if (TETE_DEMANDEE) return { ref: TETE_DEMANDEE, origine: 'argument --tete' };

  const chemin = process.env.GITHUB_EVENT_PATH;
  if (process.env.GITHUB_EVENT_NAME === 'pull_request' && chemin && existsSync(chemin)) {
    try {
      const sha = JSON.parse(readFileSync(chemin, 'utf8'))?.pull_request?.head?.sha;
      if (sha) return { ref: sha, origine: 'pull_request.head.sha' };
    } catch {
      /* on retombe sur HEAD, et on le dit dans le rapport */
    }
  }
  return { ref: 'HEAD', origine: 'HEAD local' };
}

const tete = refDeLaTete();
let messageTete = null;
try {
  messageTete = execFileSync('git', ['-C', ROOT, 'log', '-1', '--format=%B', tete.ref], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  // Un clone superficiel, un `--tete` inconnu, ou pas de dépôt du tout. On le DIT plutôt que
  // de rendre un vert qui n'a rien lu — c'est exactement le défaut que ce ticket punit.
  erreurs.push(
    `contrôle A : impossible de lire le message de « ${tete.ref} » (${tete.origine}).\n` +
      `      ${String(e.message).split('\n')[0]}`,
  );
}

if (messageTete !== null) {
  const touches = porteLeMarqueur(messageTete);
  if (touches.length > 0) {
    const sujet = messageTete.split('\n')[0];
    erreurs.push(
      `contrôle A : le commit de tête (${tete.ref}, ${tete.origine}) porte le marqueur\n` +
        `      d'exclusion global de GitHub — forme(s) : ${touches.map(String).join(' · ')}\n` +
        `      sujet : « ${sujet} »\n` +
        `      Conséquence : AUCUN workflow ne s'exécutera sur ce commit, ni pour ce push, ni\n` +
        `      pour la PR qui l'aura pour tête, quel que soit son âge — et la PR se présentera\n` +
        `      « CLEAN » sans avoir rien vérifié (TCK-479).\n` +
        `      Remède : réécrire le message (\`git commit --amend\`) SANS la forme entre crochets.\n` +
        `      La citer en prose, sans crochets, ne déclenche rien.`,
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// CONTRÔLE B — les deux côtés de l'anti-boucle d'api-ci.yml
// ──────────────────────────────────────────────────────────────────────────────────────────

const fichiersWorkflow = existsSync(WORKFLOWS)
  ? readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).sort()
  : [];

if (fichiersWorkflow.length === 0) {
  erreurs.push('contrôle B : aucun workflow lu — .github/workflows/ est absent ou vide.');
}

/** Toutes les lignes `git commit … -m "…"` des workflows, avec leur fichier et leur numéro. */
const commitsDeWorkflow = [];
for (const nom of fichiersWorkflow) {
  const lignes = readFileSync(join(WORKFLOWS, nom), 'utf8').split('\n');
  lignes.forEach((ligne, i) => {
    // Les lignes de COMMENTAIRE sont écartées : ce fichier-ci en parle, et api-ci.yml aussi.
    if (/^\s*#/.test(ligne)) return;
    const m = ligne.match(/\bgit\s+commit\b.*?-m\s+(['"])(.*?)\1/);
    if (m) commitsDeWorkflow.push({ fichier: nom, ligne: i + 1, message: m[2], texte: ligne });
  });
}

// B1 — aucun message commité par un workflow ne porte le marqueur global.
for (const c of commitsDeWorkflow) {
  const touches = porteLeMarqueur(c.message);
  if (touches.length > 0) {
    erreurs.push(
      `contrôle B1 : .github/workflows/${c.fichier}:${c.ligne} commite un message qui porte le\n` +
        `      marqueur global (${touches.map(String).join(' · ')}) : « ${c.message} ».\n` +
        `      Ce commit deviendra une tête de branche, et éteindra la CI de la PR suivante.\n` +
        `      Couper la boucle par une condition \`if:\` sur le workflow, pas par ce marqueur.`,
    );
  }
}

// B2 — le frein d'api-ci.yml : le marqueur local du message est lu par les deux `if:`.
const cheminApiCi = join(ROOT, API_CI_REL);
if (!existsSync(cheminApiCi)) {
  erreurs.push(`contrôle B2 : ${API_CI_REL} est introuvable.`);
} else {
  const lignes = readFileSync(cheminApiCi, 'utf8').split('\n');
  const commits = commitsDeWorkflow.filter((c) => c.fichier === 'api-ci.yml');

  if (commits.length !== 1) {
    erreurs.push(
      `contrôle B2 : ${API_CI_REL} porte ${commits.length} \`git commit -m\` (attendu : 1).\n` +
        `      Cette garde ne sait pas apparier plusieurs messages à plusieurs conditions ;\n` +
        `      la corriger fait partie du changement qui en ajoute un second.`,
    );
  } else {
    const { message, ligne: noLigne } = commits[0];
    // Le marqueur LOCAL est ce que le message porte entre crochets — on part du message,
    // parce que c'est lui la source : c'est GitHub qui le lira.
    const marqueurs = [...message.matchAll(/\[[^\]\s][^\]]*\]/g)].map((m) => m[0]);

    if (marqueurs.length !== 1) {
      erreurs.push(
        `contrôle B2 : le message de ${API_CI_REL}:${noLigne} porte ${marqueurs.length} marqueur(s)\n` +
          `      entre crochets (attendu : 1, le frein anti-boucle) : « ${message} ».`,
      );
    } else {
      const marqueur = marqueurs[0];
      const attendu = `contains(github.event.head_commit.message, '${marqueur}')`;

      // Le bloc du job qui porte ce `git commit`, et le bloc du step qui le porte.
      const debutJob = (() => {
        for (let i = noLigne - 1; i >= 0; i--) if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lignes[i])) return i;
        return -1;
      })();
      const finJob = (() => {
        for (let i = noLigne; i < lignes.length; i++) if (/^ {2}[A-Za-z0-9_-]+:\s*$/.test(lignes[i])) return i;
        return lignes.length;
      })();
      const debutStep = (() => {
        for (let i = noLigne - 1; i >= 0; i--) if (/^ {6}- /.test(lignes[i])) return i;
        return -1;
      })();
      const finStep = (() => {
        for (let i = noLigne; i < lignes.length; i++) if (/^ {6}- /.test(lignes[i])) return i;
        return lignes.length;
      })();

      // Un `if:` de JOB est à 4 espaces, un `if:` de STEP à 8. On lit le scalaire et ses
      // continuations (les blocs `>-` de ce fichier tiennent sur trois lignes).
      const conditionA = (lignes_, debut, fin, indent) => {
        const re = new RegExp(`^ {${indent}}if:`);
        for (let i = debut; i < fin && i < lignes_.length; i++) {
          if (debut < 0) break;
          if (!re.test(lignes_[i])) continue;
          let texte = lignes_[i];
          for (let j = i + 1; j < fin; j++) {
            if (lignes_[j].trim() === '') continue;
            const largeur = lignes_[j].length - lignes_[j].trimStart().length;
            if (largeur <= indent) break;
            texte += ' ' + lignes_[j].trim();
          }
          if (texte.includes(marqueur)) return texte;
        }
        return null;
      };

      const condJob = debutJob >= 0 ? conditionA(lignes, debutJob, finJob, 4) : null;
      const condStep = debutStep >= 0 ? conditionA(lignes, debutStep, finStep, 8) : null;

      const nomJob = debutJob >= 0 ? lignes[debutJob].trim().replace(':', '') : '?';

      if (!condJob) {
        erreurs.push(
          `contrôle B2 : le job « ${nomJob} » d'${API_CI_REL} commite « ${marqueur} » mais aucune\n` +
            `      condition \`if:\` de job ne lit ce marqueur.\n` +
            `      Attendu, quelque part dans le \`if:\` du job : ${attendu}\n` +
            `      Sans elle, le push de la carte relance ce workflow, qui régénère, qui repousse.`,
        );
      } else if (!condJob.includes('head_commit')) {
        erreurs.push(
          `contrôle B2 : le \`if:\` du job « ${nomJob} » cite « ${marqueur} » sans lire\n` +
            `      \`github.event.head_commit.message\` — il ne regarde donc pas le commit poussé.`,
        );
      }

      if (!condStep) {
        erreurs.push(
          `contrôle B2 : le step qui pousse la carte (${API_CI_REL}:${noLigne}) n'a pas de \`if:\`\n` +
            `      lisant « ${marqueur} ». C'est le SECOND frein, celui qui tient encore le jour où\n` +
            `      la condition de job est cassée par une refonte.\n` +
            `      Attendu, dans le \`if:\` du step : ${attendu}`,
        );
      }

      if (REPORT && erreurs.length === 0) {
        notes.push(`marqueur local : ${marqueur}`);
        notes.push(`  · message  ${API_CI_REL}:${noLigne} — « ${message} »`);
        notes.push(`  · job      « ${nomJob} » : ${condJob.trim().slice(0, 96)}…`);
        notes.push(`  · step     ${condStep.trim().slice(0, 96)}…`);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────────────────

if (erreurs.length > 0) {
  console.error(`✗ marqueur d'exclusion de CI — ${erreurs.length} écart(s) :`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

if (REPORT) {
  for (const n of notes) console.log(n);
  console.log(
    `auto-épreuve : ${casEprouves} cas, ${FORMES.length} formes reconnues par GitHub.\n` +
      `tête examinée : ${tete.ref} (${tete.origine}).`,
  );
}

console.log(
  "✓ marqueur d'exclusion de CI : la tête ne porte aucune des formes que GitHub reconnaît, et " +
    "le frein anti-boucle d'api-ci.yml est lu des deux côtés.\n" +
    '  ⚠ Le contrôle A est vert par construction quand cette garde tourne en CI (le défaut\n' +
    "    supprime son propre détecteur). Son point d'exécution utile est local, avant le push,\n" +
    '    et sur la tête distante avant une PR d\'intégration :\n' +
    '      git fetch origin dev && node scripts/check-skip-ci-marker.mjs --tete origin/dev',
);
