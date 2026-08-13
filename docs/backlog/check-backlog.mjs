#!/usr/bin/env node
/**
 * Garde de FRAÎCHEUR du backlog.
 *
 * `gen-index.mjs` garantit que la SORTIE (`INDEX.md`) suit la SOURCE (les frontmatters). Ça ne dit
 * rien de la question qui compte : **la source dit-elle encore la vérité ?**
 *
 * C'est exactement l'écart qui a produit le défaut de 2026-08-12 : un index dérivé n'aurait pas
 * empêché 174 tickets de rester en `review` pendant trois mois alors que leur code était mergé et
 * qu'**aucune PR n'était ouverte** (`gh pr list --state open` → `[]`). Il aurait juste affiché
 * fidèlement un mensonge.
 *
 * Ce script DÉRIVE ce qui est dérivable — l'existence des fichiers cités, la cohérence des
 * dépendances, l'historique git — et fait rougir l'écart.
 *
 * Usage :
 *   node docs/backlog/check-backlog.mjs            # garde, sort en 1 au moindre écart
 *   node docs/backlog/check-backlog.mjs --report   # + l'état d'avancement
 *
 * **Ce qu'il NE PEUT PAS faire, et qu'il faut savoir** : il ne devine pas qu'un ticket a été
 * implémenté. Il attrape le pointeur pourri, la dépendance incohérente, la date impossible et le
 * statut que git contredit — jamais un ticket qu'on a codé sans le dire.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..', '..');
const REPORT = process.argv.includes('--report');
/**
 * La borne « futur », avec UN JOUR de marge — et cette marge n'est pas de la complaisance.
 *
 * `toISOString()` rend la date en **UTC**, tandis qu'un `created:`/`updated:` de ticket porte la
 * date **locale** de son auteur. Un ticket écrit à 23 h depuis UTC+2 — le fuseau de l'auteur du
 * dépôt en été — porte donc une date que la borne UTC juge « dans le futur », et Repo CI
 * rougissait sur un ticket parfaitement juste, à une heure de la journée et pas à une autre.
 *
 * Un jour de tolérance couvre tous les fuseaux réels (UTC−12 à UTC+14 en tiennent deux, mais une
 * date en avance de deux jours n'est plus un décalage de fuseau : c'est une faute de frappe, et
 * c'est ce qu'on veut encore attraper).
 *
 * *Une garde qui rougit selon l'heure à laquelle on écrit enseigne à ne plus la lire.*
 */
const AUJOURDHUI = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);

const erreurs = [];
const avertissements = [];
const ko = (m) => erreurs.push(m);
const warn = (m) => avertissements.push(m);

const STATUTS = ['todo', 'doing', 'review', 'blocked', 'done', 'obsolete'];
const CLOS = new Set(['done', 'obsolete']);
const REQUIS = ['id', 'title', 'status', 'phase', 'family', 'estimate', 'created', 'updated', 'wave'];

/* ─────────────────────────────────────────────────── lecture des frontmatters */
function frontmatter(txt) {
  const m = txt.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  const out = {};
  let cle = null;
  for (const ligne of m[1].split('\n')) {
    const s = ligne.match(/^([a-z_]+):\s*(.*)$/);
    if (s) {
      cle = s[1];
      const v = s[2].trim();
      // Une clé sans valeur ouvre soit une liste en bloc, soit un objet imbriqué, soit elle
      // vaut NULL. On pose un TABLEAU pour les clés dont on sait qu'elles listent — sans ça,
      // `depends_on:` écrit en style bloc (parfaitement valide en YAML) devenait `{}`, et
      // toutes les vérifications de dépendances le traversaient sans rien voir.
      //
      // Pour les autres, `null` et NON `{}` : `{}` est truthy, donc `wave:` seul sur sa ligne —
      // du YAML valide pour null — passait le test `t.wave && …` et faisait chercher
      // `VAGUES["[object Object]"]`. Le même défaut vivait dans `gen-index.mjs`, à la ligne
      // équivalente : deux analyseurs du même format, écrits séparément, ayant divergé au même
      // endroit. *Deux lecteurs d'un même format finissent toujours par en lire deux.*
      if (v === '') out[cle] = ['depends_on', 'blocks', 'tags'].includes(cle) ? [] : null;
      else if (v.startsWith('[') && v.endsWith(']'))
        out[cle] = v.slice(1, -1).split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      else out[cle] = v.replace(/^["']|["']$/g, '');
      continue;
    }
    // Une sous-clé INLINE — `  features: [docs/features.md#…]` — sous une clé imbriquée.
    //
    // Elle ne correspondait à AUCUNE des deux branches : ni au `^([a-z_]+):` du dessus (elle est
    // indentée), ni au motif de liste en bloc juste en dessous. Elle tombait donc dans le vide,
    // `_spec_paths` restait vide, et la vérification « chaque `spec_refs` pointe sur un fichier
    // qui existe » ne vérifiait RIEN pour ces tickets — **26 des 270**. Prouvé par exécution :
    // un `features: [docs/CE-FICHIER-NEXISTE-PAS.md]` rendait « ✓ backlog cohérent, 270 tickets
    // vérifiés », sortie 0.
    //
    // C'est la garde que joue `repo-ci.yml`, et c'est elle que le filtre `docs/**` de ce même
    // fichier invoque pour se justifier. Un pointeur mort écrit dans la forme inline arrivait
    // donc sur `dev` au vert, par les deux chemins à la fois.
    //
    // *Un analyseur qui ne connaît qu'une des écritures d'un format ne mesure pas le format :
    // il mesure l'habitude de celui qui a écrit les exemples.*
    const sousInline = ligne.match(/^\s+([a-z_]+):\s*\[(.*)\]\s*$/);
    if (sousInline) {
      const valeurs = sousInline[2].split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      if (cle === 'spec_refs') (out._spec_paths ||= []).push(...valeurs);
      continue;
    }

    const item = ligne.match(/^\s+-\s+(.*)$/);
    if (!item) continue;
    const valeur = item[1].trim().replace(/^["']|["']$/g, '');
    if (cle === 'spec_refs') (out._spec_paths ||= []).push(valeur);
    else if (Array.isArray(out[cle])) out[cle].push(valeur);
  }
  return out;
}

const tickets = new Map();
for (const fn of readdirSync(join(DIR, 'tickets')).sort()) {
  if (!fn.endsWith('.md') || fn.startsWith('_')) continue;
  const fm = frontmatter(readFileSync(join(DIR, 'tickets', fn), 'utf8'));
  if (!fm) { ko(`${fn} : aucun frontmatter`); continue; }
  fm._fichier = fn;
  if (!fm.id) { ko(`${fn} : aucun champ "id"`); continue; }
  if (tickets.has(fm.id)) ko(`${fm.id} : id dupliqué (${tickets.get(fm.id)._fichier} et ${fn})`);
  tickets.set(fm.id, fm);
}

/* ─────────────────────────────────────────────────── 1. complétude & valeurs */
for (const t of tickets.values()) {
  for (const champ of REQUIS) {
    if (t[champ] === undefined) ko(`${t.id} : champ obligatoire "${champ}" absent`);
  }
  if (t.status && !STATUTS.includes(t.status)) ko(`${t.id} : statut inconnu "${t.status}"`);
  // Le nom de fichier doit porter l'id : sans ça, un lien de l'INDEX pointe à côté sans que rien
  // ne le dise — le fichier existe, il décrit juste un autre ticket.
  if (t._fichier && !t._fichier.startsWith(`${t.id}-`)) {
    ko(`${t.id} : le fichier "${t._fichier}" ne commence pas par son id`);
  }
}

/* ─────────────────────────────────────────────────── 2. vagues */
const VAGUES = JSON.parse(readFileSync(join(DIR, 'waves.json'), 'utf8')).waves;
for (const t of tickets.values()) {
  if (t.wave && t.wave !== 'null' && !VAGUES[t.wave]) ko(`${t.id} : vague ${t.wave} absente de waves.json`);
}

/* ─────────────────────────────────────────────────── 3. pointeurs cités */
// Un chemin cité qui n'existe plus est la dette la plus banale d'un backlog : il ne casse rien,
// il fait juste perdre dix minutes à chaque lecteur, indéfiniment.
for (const t of tickets.values()) {
  for (const ref of t._spec_paths || []) {
    const chemin = ref.split('#')[0];
    if (!chemin) continue;
    if (!existsSync(join(ROOT, chemin))) ko(`${t.id} : spec_refs cite "${chemin}", qui n'existe pas`);
  }
  for (const champ of ['depends_on', 'blocks']) {
    for (const autre of Array.isArray(t[champ]) ? t[champ] : []) {
      if (!tickets.has(autre)) ko(`${t.id} : ${champ} référence "${autre}", qui n'existe pas`);
    }
  }
}

/* ─────────────────────────────────────────────────── 4. cohérence des dépendances */
for (const t of tickets.values()) {
  if (!CLOS.has(t.status)) continue;
  for (const dep of Array.isArray(t.depends_on) ? t.depends_on : []) {
    const d = tickets.get(dep);
    if (d && !CLOS.has(d.status)) {
      ko(`${t.id} est "${t.status}" alors que sa dépendance ${dep} est "${d.status}" (règle n°2)`);
    }
  }
}
// Réciprocité : « A bloque B » et « B dépend de A » sont la même phrase. Une moitié sans l'autre
// rend le graphe faux dans un sens et juste dans l'autre — le pire des deux mondes.
for (const t of tickets.values()) {
  for (const b of Array.isArray(t.blocks) ? t.blocks : []) {
    const autre = tickets.get(b);
    if (autre && !(Array.isArray(autre.depends_on) ? autre.depends_on : []).includes(t.id)) {
      warn(`${t.id} déclare bloquer ${b}, mais ${b} ne le déclare pas dans depends_on`);
    }
  }
}

/* ─────────────────────────────────────────────────── 5. dates */
for (const t of tickets.values()) {
  for (const champ of ['created', 'updated']) {
    const v = t[champ];
    if (!v || typeof v !== 'string') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { ko(`${t.id} : ${champ}="${v}" n'est pas une date ISO`); continue; }
    if (v > AUJOURDHUI) ko(`${t.id} : ${champ}="${v}" est dans le futur`);
  }
  if (t.created && t.updated && t.updated < t.created) {
    ko(`${t.id} : updated (${t.updated}) précède created (${t.created})`);
  }
}

/* ─────────────────────────────────────────────────── 6. ce que git contredit */
// LE détecteur du cimetière. Un ticket en `review` ou `doing` dont le code est déjà sur `dev`
// n'attend rien : c'est un statut que personne n'a refermé. C'est ce défaut-là qui a produit une
// colonne « Review » de 177 entrées face à ZÉRO pull request ouverte.
let git = true;
let shallow = 'true';
try {
  shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim();
} catch { git = false; }

if (!git) {
  warn("historique git indisponible : les statuts n'ont pas été confrontés aux commits.");
} else if (shallow !== 'false') {
  // Jamais en silence : on dit que la vérification n'a PAS eu lieu, et comment la rendre possible.
  ko('historique git superficiel (shallow) : les statuts n\'ont pas pu être confrontés aux commits. '
    + 'En CI, poser "fetch-depth: 0" sur le checkout.');
} else {
  // La référence d'intégration, essayée dans l'ordre. `dev` en premier pour un poste de
  // développement ; `origin/dev` ensuite, et c'est LUI qui sert en CI.
  //
  // Sur un run `pull_request`, actions/checkout extrait `refs/remotes/pull/N/merge` en HEAD
  // détachée et ne crée AUCUNE branche locale — même avec `fetch-depth: 0`. `git log dev`
  // échouait donc sur « unknown revision », le catch posait un simple AVERTISSEMENT, et la
  // garde sortait en 0 sans avoir rien confronté. Elle passait au vert sur chaque PR en ne
  // vérifiant rien : exactement la vacuité qu'elle existe pour dénoncer ailleurs.
  const REFS = ['dev', 'origin/dev', 'refs/remotes/origin/dev'];
  let journal = '';
  let refUtilisee = null;
  for (const ref of REFS) {
    try {
      // Le séparateur est en TÊTE du format, pas en queue. Avec `--name-only`, git émet les
      // chemins APRÈS le message : un séparateur final rattacherait à chaque bloc les fichiers
      // du commit PRÉCÉDENT. Défaut silencieux — la commande sort en 0 et le résultat est
      // simplement décalé d'un cran.
      journal = execFileSync('git', ['log', ref, '--format=%x01%H%x00%s%x00%b', '--name-only'],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
      refUtilisee = ref;
      break;
    } catch { /* on essaie la référence suivante */ }
  }

  if (!refUtilisee) {
    // ERREUR, pas avertissement. Une vérification qui n'a pas eu lieu doit faire rougir :
    // sinon « garde verte » et « garde muette » deviennent indiscernables, et c'est la
    // seconde qui gagne avec le temps.
    ko('aucune des références ' + REFS.join(', ') + " n'est résolvable : les statuts n'ont PAS "
      + 'été confrontés aux commits. En CI, vérifier que le checkout a bien `fetch-depth: 0`.');
    journal = '';
  } else if (REPORT) {
    console.log(`(confrontation des statuts faite sur \`${refUtilisee}\`)`);
  }

  if (journal) {
    // Un ticket est « livré sur dev » si un commit de dev cite son id ET touche du code
    // applicatif. Le second critère écarte les commits qui ne font que déplacer le ticket
    // lui-même d'une colonne à l'autre — sans lui, tout ticket serait déclaré livré par le
    // commit qui l'a écrit.
    const surDev = new Set();
    for (const bloc of journal.split('\x01')) {
      if (!bloc.trim()) continue;
      const [, sujet = '', reste = ''] = bloc.split('\x00');
      const lignes = reste.split('\n');
      // Les ids ne se cherchent QUE dans la prose. Une ligne de chemin en contient aussi — le
      // fichier du ticket lui-même s'appelle `TCK-105-….md` — et les compter reviendrait à
      // déclarer livré tout ticket dont on a seulement édité la fiche.
      const touche = lignes.some((l) => l.startsWith('takussan-api/') || l.startsWith('takussan-web/'));
      if (!touche) continue;

      // On ne retient QUE le ticket que le commit dit implémenter — la convention du dépôt est
      // `feat(api): … (TCK-280)`, en fin de SUJET.
      //
      // La version précédente balayait tout le corps du message. Or citer un autre ticket en
      // prose est parfaitement normal : « suite de TCK-281 », « prépare TCK-279 ». Un commit
      // TCK-280 dont le corps mentionne TCK-281 — `doing`, sans section « Reste sur dev » —
      // faisait alors échouer `repo-ci` sur le push vers `dev` PUIS sur chaque PR suivante, en
      // accusant quelqu'un qui n'avait jamais touché à TCK-281, jusqu'à ce qu'on édite ce
      // ticket. Une garde qui rougit chez le suivant n'est plus une garde : c'est un piège.
      //
      // *Une référence n'est pas une revendication. Ce qu'un commit déclare implémenter, il
      // l'écrit à sa place conventionnelle ; le reste est de la conversation.*
      const revendique = sujet.match(/\((TCK-\d+)\)\s*$/);
      if (revendique) surDev.add(revendique[1]);
    }

    // L'échappatoire, et elle est étroite exprès : un ticket dont une partie est sur `dev` peut
    // légitimement rester ouvert — mais il doit alors ÉCRIRE ce qui reste, dans une section
    // `## Reste sur dev` de son corps. « Partiellement implémenté » sans dire ce qui manque ne
    // vaut pas mieux que `todo` : c'est précisément ce qui a rempli la colonne Review pendant
    // trois mois. La garde n'exige pas un statut, elle exige une PHRASE.
    const RESTE = /^##\s+Reste sur dev\s*$/m;
    for (const t of tickets.values()) {
      if (!(t.status === 'review' || t.status === 'doing') || !surDev.has(t.id)) continue;
      const corps = readFileSync(join(DIR, 'tickets', t._fichier), 'utf8');
      if (RESTE.test(corps)) {
        warn(`${t.id} est "${t.status}" avec du code déjà sur \`dev\` — reste-à-faire documenté (section « Reste sur dev »)`);
        continue;
      }
      ko(`${t.id} est "${t.status}" alors qu'un commit de \`dev\` cite son id et touche du code — `
        + `soit il passe \`done\`, soit son corps porte une section « ## Reste sur dev » qui dit ce qui manque`);
    }

    if (REPORT) {
      const orphelins = [...tickets.values()].filter((t) => t.status === 'done' && !surDev.has(t.id));
      if (orphelins.length) {
        console.log(`\nℹ ${orphelins.length} tickets \`done\` dont aucun commit de \`dev\` ne cite l'id.`);
        console.log('  Ce n\'est pas une faute : le code peut exister sans que le commit cite le ticket.');
        console.log('  C\'est une perte de traçabilité ticket ↔ commit, et elle ne se rattrape pas après coup.');
      }
    }
  }
}

/* ─────────────────────────────────────────────────── rapport */
if (REPORT) {
  const par = {};
  for (const t of tickets.values()) par[t.status] = (par[t.status] || 0) + 1;
  console.log(`\n${tickets.size} tickets`);
  for (const s of STATUTS) if (par[s]) console.log(`  ${s.padEnd(9)} ${par[s]}`);
  const ouverts = [...tickets.values()].filter((t) => !CLOS.has(t.status) && t.status !== 'blocked');
  if (ouverts.length) {
    console.log('\nOuverts :');
    for (const t of ouverts.sort((a, b) => a.id.localeCompare(b.id))) {
      console.log(`  ${t.id}  [${t.status}]  ${String(t.title).slice(0, 62)}`);
    }
  }
}

if (avertissements.length) {
  console.warn(`\n⚠ ${avertissements.length} avertissement(s) :`);
  for (const a of avertissements) console.warn(`  · ${a}`);
}

if (erreurs.length === 0) {
  console.log(`\n✓ backlog cohérent — ${tickets.size} tickets vérifiés.`);
  process.exit(0);
}

console.error(`\n✗ ${erreurs.length} incohérence(s) :\n`);
for (const e of erreurs) console.error(`  · ${e}`);
// `--report` AJOUTE de la sortie, il ne désarme jamais la garde. Une option qui fait
// sortir un contrôle en 0 quoi qu'il arrive est une garde armée qui ne mord pas — et
// c'est le défaut le plus difficile à voir, puisque le pipeline reste vert.
process.exit(1);
