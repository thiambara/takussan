/**
 * Le SEUL lecteur des tickets du backlog (TCK-3003) : `gen-index.mjs`, `check-backlog.mjs` et
 * `ranger-tickets.mjs` listent et lisent par ce module, et par rien d'autre.
 *
 * ─── Pourquoi un seul ──────────────────────────────────────────────────────────────────────────
 *
 * Jusqu'au 2026-11-27, le même format était lu par TROIS lecteurs écrits séparément : deux
 * parseurs de frontmatter (`gen-index`, `check-backlog`) et une regex sur `status:`
 * (`ranger-tickets`). Les deux parseurs ont divergé trois fois, toujours de la même façon — un
 * correctif posé dans l'un, pas dans son jumeau :
 *
 *   1. `wave:` seul sur sa ligne (YAML valide pour `null`) devenait `{}`, TRUTHY : le test
 *      `t.wave && …` passait, la recherche portait sur `VAGUES["[object Object]"]`, et
 *      `gen-index --check` — étape obligatoire de la CI — bloquait tout le pipeline sur un message
 *      qui ne désignait rien ;
 *   2. la sous-clé INLINE de `spec_refs` (`  features: [docs/…]`) ne correspondait à aucune
 *      branche : 26 tickets sur 270 n'avaient AUCUN `spec_refs` vérifié — prouvé par exécution, un
 *      `features: [docs/CE-FICHIER-NEXISTE-PAS.md]` rendait « ✓ backlog cohérent », sortie 0 ;
 *   3. une liste écrite EN BLOC (`depends_on:` puis `  - TCK-…`) restait vide dans `gen-index`
 *      quand `check-backlog` la remplissait.
 *
 * *Deux lecteurs d'un même format finissent toujours par en lire deux.* On ne les confronte plus :
 * on n'en garde qu'un.
 *
 * ─── Ce qu'il lit ──────────────────────────────────────────────────────────────────────────────
 *
 * Volontairement minimal : le dépôt n'a pas de dépendance YAML à la racine, et ne doit pas en
 * gagner. Formes admises (`docs/backlog/_template.md`) — chacune a son test dans
 * `__tests__/tickets.test.mjs` :
 *
 *   - scalaire, guillemets simples ou doubles retirés : `status: done`, `title: "…"` ;
 *   - liste inline : `tags: [a, b]`, `depends_on: []` ;
 *   - liste en bloc : `depends_on:` puis `  - TCK-…` ;
 *   - clé vide : `[]` pour une clé de liste (`LISTES`), `null` pour toute autre — jamais `{}` ;
 *   - sous-clés de `spec_refs`, inline ou en bloc : seuls les CHEMINS sont gardés, à plat, dans
 *     `_spec_paths` (c'est tout ce que `check-backlog` en vérifie).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** La racine du dépôt — `listerTickets` et `lireTickets` la prennent par défaut. */
export const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Le dossier des tickets, relatif à la racine du dépôt. */
export const TICKETS = 'docs/backlog/tickets';

/**
 * Les statuts, dans l'ordre d'affichage. Un dossier `tickets/<statut>/` n'existe que s'il porte au
 * moins un ticket (`ranger-tickets.mjs`).
 */
export const STATUTS = ['todo', 'doing', 'review', 'blocked', 'done', 'obsolete'];
/** Les statuts CLOS ; tous les autres sont ouverts (`blocked` compris). */
export const CLOS = new Set(['done', 'obsolete']);
/** Les clés dont la valeur est une liste : vides, elles valent `[]` et non `null`. */
const LISTES = ['depends_on', 'blocks', 'tags'];

const sansGuillemets = (v) => v.trim().replace(/^["']|["']$/g, '');
const listeInline = (v) => v.split(',').map(sansGuillemets).filter(Boolean);

/**
 * Le frontmatter d'un ticket, ou `null` s'il n'en a pas. Les chemins de `spec_refs` sont rendus à
 * plat dans `_spec_paths` ; la clé `spec_refs` elle-même vaut `null` (c'est un objet imbriqué).
 */
export function lireFrontmatter(texte) {
  const m = texte.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  const out = {};
  let cle = null;
  for (const ligne of m[1].split('\n')) {
    const s = ligne.match(/^([a-z_]+):\s*(.*)$/);
    if (s) {
      cle = s[1];
      const v = s[2].trim();
      // Une clé sans valeur ouvre une liste en bloc, un objet imbriqué… ou vaut NULL. Jamais `{}` :
      // c'est la divergence n° 1 de l'en-tête.
      if (v === '') out[cle] = LISTES.includes(cle) ? [] : null;
      else if (v.startsWith('[') && v.endsWith(']')) out[cle] = listeInline(v.slice(1, -1));
      else out[cle] = sansGuillemets(v);
      continue;
    }
    // Sous-clé INLINE sous une clé imbriquée — la divergence n° 2.
    const sousInline = ligne.match(/^\s+([a-z_]+):\s*\[(.*)\]\s*$/);
    if (sousInline) {
      if (cle === 'spec_refs') (out._spec_paths ||= []).push(...listeInline(sousInline[2]));
      continue;
    }
    // Élément de liste en bloc — la divergence n° 3.
    const item = ligne.match(/^\s+-\s+(.*)$/);
    if (!item) continue;
    const valeur = sansGuillemets(item[1]);
    if (cle === 'spec_refs') (out._spec_paths ||= []).push(valeur);
    else if (Array.isArray(out[cle])) out[cle].push(valeur);
  }
  return out;
}

/**
 * Tous les fichiers de ticket, relatifs à `tickets/`, triés : tout `.md` dont le nom ne commence
 * pas par `_`, à toute profondeur — rangés par statut, ou posés à la racine de `tickets/` (un
 * ticket neuf y atterrit).
 *
 * Volontairement LARGE : un fichier mal nommé est listé, pour que `check-backlog` dise qu'il ne
 * commence pas par son id au lieu de l'ignorer. `ranger-tickets` ne range que les noms conformes,
 * et resserre lui-même.
 */
export function listerTickets(racine = RACINE) {
  return readdirSync(join(racine, TICKETS), { recursive: true })
    .map((p) => p.split('\\').join('/'))
    .filter((p) => p.endsWith('.md') && !basename(p).startsWith('_'))
    .sort();
}

/**
 * Les tickets lus et les défauts de STRUCTURE rencontrés en les lisant : sans frontmatter, sans
 * `id`, `id` en double. Les règles de cohérence (statut, vague, dépendances…) restent l'affaire de
 * chaque outil.
 *
 * Chaque ticket est son frontmatter, plus `_fichier` (relatif à `tickets/`), et ses listes sont
 * TOUJOURS des tableaux — `depends_on`, `blocks`, `tags`, `_spec_paths` — absentes, scalaires ou
 * non. Un id
 * en double rend les DEUX tickets : à l'appelant de choisir lequel il garde.
 */
export function lireTickets(racine = RACINE) {
  const tickets = [];
  const erreurs = [];
  const vus = new Map();
  for (const fichier of listerTickets(racine)) {
    const fm = lireFrontmatter(readFileSync(join(racine, TICKETS, fichier), 'utf8'));
    if (!fm) {
      erreurs.push(`${fichier} : aucun frontmatter`);
      continue;
    }
    fm._fichier = fichier;
    if (!fm.id) {
      erreurs.push(`${fichier} : aucun champ "id"`);
      continue;
    }
    if (vus.has(fm.id)) erreurs.push(`${fm.id} : id dupliqué (${vus.get(fm.id)} et ${fichier})`);
    vus.set(fm.id, fichier);
    // Un scalaire (`depends_on: TCK-12`) est une liste d'un élément, pas une liste vide : le
    // tableau vide l'aurait fait traverser toutes les vérifications de dépendances sans un mot.
    for (const cle of [...LISTES, '_spec_paths']) {
      if (typeof fm[cle] === 'string') fm[cle] = [fm[cle]];
      else if (!Array.isArray(fm[cle])) fm[cle] = [];
    }
    tickets.push(fm);
  }
  return { tickets, erreurs };
}
