#!/usr/bin/env node
/**
 * Génère `docs/backlog/INDEX.md` depuis les frontmatters de `tickets/*.md`.
 *
 * L'INDEX était maintenu à la main. Il était faux sur **213 de ses 266 entrées (80,1 %)** : il
 * affichait 40 tickets à faire et 177 en review là où les frontmatters en comptaient 3 et 2, et le
 * premier ticket de sa colonne « Todo » — la convention documentée pour « implémente la tâche
 * suivante » — était `done` depuis trois mois.
 *
 * Le document se condamnait lui-même : il déclarait en tête « Vue kanban projetée depuis les
 * frontmatters » puis, deux lignes plus bas, « le maintenir à la main ». C'est exactement l'écart
 * que ce script supprime — *aucune liste maintenue à la main ne reste juste ; seule une liste
 * dérivée le reste.*
 *
 * Usage :
 *   node docs/backlog/gen-index.mjs            # réécrit INDEX.md
 *   node docs/backlog/gen-index.mjs --check    # n'écrit rien ; sort en 1 si INDEX.md est périmé
 *
 * Ce script CASSE sur une source incohérente (statut inconnu, vague inexistante, id dupliqué) —
 * il vaut mieux ne rien générer qu'un index faux. La fraîcheur du contenu, elle, est l'affaire de
 * `check-backlog.mjs` : celui-ci garantit que la SORTIE suit la SOURCE, l'autre que la SOURCE suit
 * la RÉALITÉ. Aucun des deux ne peut voir ce que voit l'autre.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..', '..');
const SORTIE = join(DIR, 'INDEX.md');
const CHECK = process.argv.includes('--check');

/* ─────────────────────────────────────────────────────────── vocabulaire */
// Les valeurs sont celles RÉELLEMENT portées par les tickets, pas celles que l'ancien template
// déclarait : `bug` (40 tickets) et `full` (2) vivaient hors de l'énumération documentée depuis
// des mois. Une énumération qu'on ne tient pas ne garde rien — celle-ci est mesurée.
const STATUTS = {
  todo: { titre: '📋 Todo', ouvert: true },
  doing: { titre: '🚧 Doing', ouvert: true },
  review: { titre: '👀 Review', ouvert: true },
  blocked: { titre: '⛔ Blocked', ouvert: true },
  done: { titre: '✅ Done', ouvert: false },
  obsolete: { titre: '🗑️ Obsolete', ouvert: false },
};
const PHASES = ['P0', 'P1', 'P2', 'P3', 'EF'];
const FAMILLES = ['back', 'front', 'applicatif', 'technique', 'bug', 'full', 'evolution'];
const ESTIMATIONS = ['S', 'M', 'L', 'XL'];

/* ─────────────────────────────────────────────────────────── lecture */
const erreurs = [];

/** Parseur de frontmatter volontairement minimal : ce dépôt n'a pas de dépendance YAML, et le
 *  format des tickets est plat et homogène (mesuré : 12 champs présents dans 265/265). */
function frontmatter(txt, fichier) {
  const m = txt.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) {
    erreurs.push(`${fichier} : aucun frontmatter`);
    return null;
  }
  const out = {};
  let cleCourante = null;
  for (const ligne of m[1].split('\n')) {
    const scalaire = ligne.match(/^([a-z_]+):\s*(.*)$/);
    if (scalaire) {
      cleCourante = scalaire[1];
      let v = scalaire[2].trim();
      if (v === '') {
        // Une clé sans valeur ouvre une liste en bloc, un objet imbriqué… ou vaut NULL.
        //
        // `{}` pour tout le monde était faux dans le dernier cas : `wave:` seul sur sa ligne est
        // du YAML valide pour `null`, et `{}` est TRUTHY. Le test `t.wave && …` passait donc, et
        // la recherche portait sur `VAGUES["[object Object]"]` — la génération s'interrompait sur
        // « vague [object Object] absente de waves.json », un message qui ne désigne rien. Et
        // comme `gen-index --check` est une étape obligatoire de la CI, un ticket écrit `wave:`
        // au lieu de `wave: null` bloquait tout le pipeline.
        //
        // `check-backlog.mjs` traitait déjà ce cas correctement pour ses clés de liste : les deux
        // analyseurs du même format avaient divergé. *Deux lecteurs d'un même format finissent
        // toujours par en lire deux — il faut soit les fusionner, soit les confronter.*
        out[cleCourante] = ['depends_on', 'blocks', 'tags'].includes(cleCourante) ? [] : null;
        continue;
      }
      if (v.startsWith('[') && v.endsWith(']')) {
        out[cleCourante] = v
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        continue;
      }
      out[cleCourante] = v.replace(/^["']|["']$/g, '');
      continue;
    }
    // sous-clé de spec_refs (`  features:` / `    - docs/...`) — on ne garde que les chemins
    // La sous-clé INLINE — `  features: [docs/features.md#…]`.
    //
    // `check-backlog.mjs` a reçu cette branche après qu'on eut mesuré que 26 tickets sur 270
    // l'utilisent et n'étaient donc PAS vérifiés. Son jumeau ne l'a pas reçue. C'est sans effet
    // aujourd'hui — `gen-index` ne lit pas `_spec_paths` — mais les deux fichiers portent la
    // même phrase, « Deux lecteurs d'un même format finissent toujours par en lire deux », et la
    // divergence s'était rouverte un champ plus loin.
    //
    // *Une divergence refermée sur un champ ne l'est pas sur le format.*
    const sousInline = ligne.match(/^\s+([a-z_]+):\s*\[(.*)\]\s*$/);
    if (sousInline) {
      const valeurs = sousInline[2]
        .split(',')
        .map((x) => x.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
      if (cleCourante === 'spec_refs') (out._spec_paths ||= []).push(...valeurs);
      continue;
    }

    const item = ligne.match(/^\s+-\s+(.*)$/);
    if (item && cleCourante === 'spec_refs') {
      (out._spec_paths ||= []).push(item[1].trim().replace(/^["']|["']$/g, ''));
    }
  }
  return out;
}

const tickets = [];
const vus = new Map();
for (const fn of readdirSync(join(DIR, 'tickets')).sort()) {
  if (!fn.endsWith('.md') || fn.startsWith('_')) continue;
  const fm = frontmatter(readFileSync(join(DIR, 'tickets', fn), 'utf8'), fn);
  if (!fm) continue;
  fm._fichier = fn;
  if (!fm.id) {
    erreurs.push(`${fn} : aucun champ "id"`);
    continue;
  }
  if (vus.has(fm.id)) erreurs.push(`${fm.id} : id dupliqué (${vus.get(fm.id)} et ${fn})`);
  vus.set(fm.id, fn);
  if (!STATUTS[fm.status]) erreurs.push(`${fm.id} : statut inconnu "${fm.status}"`);
  if (fm.phase && !PHASES.includes(fm.phase)) erreurs.push(`${fm.id} : phase inconnue "${fm.phase}"`);
  if (fm.family && !FAMILLES.includes(fm.family)) erreurs.push(`${fm.id} : family inconnue "${fm.family}"`);
  if (fm.estimate && !ESTIMATIONS.includes(fm.estimate)) erreurs.push(`${fm.id} : estimate inconnue "${fm.estimate}"`);
  tickets.push(fm);
}

const VAGUES = JSON.parse(readFileSync(join(DIR, 'waves.json'), 'utf8')).waves;
for (const t of tickets) {
  if (t.wave && t.wave !== 'null' && !VAGUES[t.wave]) {
    erreurs.push(`${t.id} : vague ${t.wave} absente de waves.json`);
  }
}

if (erreurs.length) {
  console.error(`✗ source incohérente — ${erreurs.length} erreur(s), rien n'a été généré :\n`);
  for (const e of erreurs) console.error(`  · ${e}`);
  process.exit(1);
}

/* ─────────────────────────────────────────────────────────── rendu */
const num = (t) => parseInt(t.id.replace('TCK-', ''), 10);
const parStatut = (s) => tickets.filter((t) => t.status === s).sort((a, b) => num(a) - num(b));

function ligne(t) {
  const meta = [t.estimate, t.phase, t.family].filter(Boolean).join(' · ');
  const titre = String(t.title || '(sans titre)').replace(/^["']|["']$/g, '');
  return `- [${t.id}](tickets/${t._fichier}) — ${titre} \`${meta}\``;
}

const compte = Object.fromEntries(Object.keys(STATUTS).map((s) => [s, parStatut(s).length]));
const ouverts = Object.entries(STATUTS)
  .filter(([, v]) => v.ouvert)
  .reduce((n, [s]) => n + compte[s], 0);

const L = [];
L.push('# Backlog — Takussan');
L.push('');
L.push('> ⚠️ **FICHIER GÉNÉRÉ — ne pas éditer à la main.**');
L.push('> Source : les frontmatters de `tickets/*.md` et `waves.json`.');
L.push('> Régénérer : `node docs/backlog/gen-index.mjs` · Vérifier : `node docs/backlog/check-backlog.mjs`');
L.push('>');
L.push("> Pour changer ce que montre cet index, éditer le **frontmatter du ticket**, puis régénérer.");
L.push('');
L.push(`**${tickets.length} tickets** — ${ouverts} ouvert${ouverts > 1 ? 's' : ''}, ${compte.done} livré${compte.done > 1 ? 's' : ''}.`);
L.push('');
L.push('| Statut | Nombre |');
L.push('|---|---:|');
for (const [s, v] of Object.entries(STATUTS)) L.push(`| ${v.titre} | ${compte[s]} |`);
L.push('');
L.push('## Légende');
L.push('');
L.push('| Champ | Valeurs |');
L.push('|---|---|');
L.push(`| \`status\` | ${Object.keys(STATUTS).map((s) => `\`${s}\``).join(' · ')} |`);
L.push(`| \`phase\` | ${PHASES.map((p) => `\`${p}\``).join(' · ')} (EF = évolution future) |`);
L.push(`| \`family\` | ${FAMILLES.map((f) => `\`${f}\``).join(' · ')} |`);
L.push('| `estimate` | `S` ≤2j · `M` 3–5j · `L` 6–10j · `XL` >10j |');
L.push('| `wave` | vague de livraison — catalogue dans [`waves.json`](waves.json) |');
L.push('');
L.push('**Template** : [`_template.md`](_template.md) · **Archive** : [`_archive/`](_archive/)');
L.push('');
L.push('---');
L.push('');

// Les statuts OUVERTS d'abord, à plat : c'est la seule partie qu'on lit pour décider quoi faire.
for (const [s, v] of Object.entries(STATUTS)) {
  if (!v.ouvert) continue;
  const lot = parStatut(s);
  L.push(`## ${v.titre}`);
  L.push('');
  if (!lot.length) L.push('_(aucun)_');
  else for (const t of lot) L.push(ligne(t));
  L.push('');
}

L.push('---');
L.push('');

// Les statuts CLOS, groupés par vague : c'est un historique, il se consulte, il ne se scanne pas.
for (const [s, v] of Object.entries(STATUTS)) {
  if (v.ouvert) continue;
  const lot = parStatut(s);
  L.push(`## ${v.titre} — ${lot.length}`);
  L.push('');
  if (!lot.length) {
    L.push('_(aucun)_');
    L.push('');
    continue;
  }
  const groupes = new Map();
  for (const t of lot) {
    const cle = t.wave && t.wave !== 'null' ? Number(t.wave) : null;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(t);
  }
  const cles = [...groupes.keys()].sort((a, b) => (b ?? -1) - (a ?? -1)); // vagues récentes d'abord
  for (const cle of cles) {
    const titre = cle === null ? 'Sans vague' : `Vague ${cle} — ${VAGUES[cle]}`;
    const lot2 = groupes.get(cle);
    L.push('<details>');
    L.push(`<summary><strong>${titre}</strong> — ${lot2.length} ticket${lot2.length > 1 ? 's' : ''}</summary>`);
    L.push('');
    for (const t of lot2) L.push(ligne(t));
    L.push('');
    L.push('</details>');
    L.push('');
  }
}

L.push('---');
L.push('');
L.push('## Règles');
L.push('');
L.push('1. Un ticket décrit un **delta**, jamais la spec — il pointe vers elle via `spec_refs`.');
L.push('2. `depends_on` ne référence que des tickets. Un ticket ne démarre pas tant que ses');
L.push('   dépendances ne sont pas `done`.');
L.push('3. **Le statut vaut pour ce qui est mergé sur `dev`.** Une branche non mergée, c\'est `doing`.');
L.push('4. Après merge d\'un ticket qui modifie une spec : `/sync-specs`.');
L.push('');

const rendu = L.join('\n');

if (CHECK) {
  const actuel = existsSync(SORTIE) ? readFileSync(SORTIE, 'utf8') : '';
  if (actuel === rendu) {
    console.log('✓ INDEX.md est à jour de ses frontmatters.');
    process.exit(0);
  }
  console.error('✗ INDEX.md est périmé — lancer `node docs/backlog/gen-index.mjs`.');
  process.exit(1);
}

writeFileSync(SORTIE, rendu);
console.log(
  `✓ INDEX.md généré — ${tickets.length} tickets (${ouverts} ouverts, ${compte.done} livrés), ` +
    `${Object.keys(VAGUES).length} vagues.`
);
