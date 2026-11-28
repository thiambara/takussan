/**
 * Le lecteur unique des tickets (TCK-3003) : une forme YAML admise par `_template.md` = un test.
 *
 * Lancer : `node --test docs/backlog/__tests__/` (joué par `repo-ci.yml`).
 *
 * Les tickets fabriqués vivent dans un dossier temporaire, jamais sous le vrai `tickets/`, et leurs
 * ids (TCK-9xxx) n'existent pas : `ranger-tickets --check` relit tout `.mjs` du dépôt à la
 * recherche de chemins de tickets, et un vrai nom cité ici sous le mauvais statut le ferait rougir.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CLOS, STATUTS, TICKETS, lireFrontmatter, lireTickets, listerTickets } from '../tickets.mjs';

const fm = (corps) => `---\n${corps}\n---\n\n## Objectif\n`;

describe('lireFrontmatter — chaque forme admise', () => {
  test('sans frontmatter : null', () => {
    assert.equal(lireFrontmatter('# un titre\n'), null);
  });

  test('scalaire, guillemets simples ou doubles retirés', () => {
    const t = lireFrontmatter(fm(`id: TCK-9001\ntitle: "Un titre : avec deux-points"\nstatus: 'done'`));
    assert.equal(t.id, 'TCK-9001');
    assert.equal(t.title, 'Un titre : avec deux-points');
    assert.equal(t.status, 'done');
  });

  test('liste inline, vide ou non', () => {
    const t = lireFrontmatter(fm(`depends_on: []\ntags: [a, "b", 'c']`));
    assert.deepEqual(t.depends_on, []);
    assert.deepEqual(t.tags, ['a', 'b', 'c']);
  });

  test('liste EN BLOC : ses éléments sont lus (AC2 — l’ancien gen-index la laissait vide)', () => {
    const t = lireFrontmatter(fm(`depends_on:\n  - TCK-9002\n  - "TCK-9003"\nblocks:\n  - TCK-9004\nwave: 3`));
    assert.deepEqual(t.depends_on, ['TCK-9002', 'TCK-9003']);
    assert.deepEqual(t.blocks, ['TCK-9004']);
    assert.equal(t.wave, '3');
  });

  test('clé vide : [] pour une liste, null pour le reste — jamais {} (wave: vide)', () => {
    const t = lireFrontmatter(fm(`depends_on:\nblocks:\ntags:\nwave:\nphase:`));
    assert.deepEqual(t.depends_on, []);
    assert.deepEqual(t.blocks, []);
    assert.deepEqual(t.tags, []);
    assert.equal(t.wave, null);
    assert.equal(t.phase, null);
  });

  test('spec_refs, sous-clés en bloc : les chemins à plat dans _spec_paths', () => {
    const t = lireFrontmatter(fm(`spec_refs:\n  features:\n    - docs/features.md#a\n  models:\n    - 'docs/models-spec.md'\ntags: []`));
    assert.equal(t.spec_refs, null);
    assert.deepEqual(t._spec_paths, ['docs/features.md#a', 'docs/models-spec.md']);
    assert.deepEqual(t.tags, []);
  });

  test('spec_refs, sous-clés INLINE, vides ou non', () => {
    const t = lireFrontmatter(fm(`spec_refs:\n  features: [docs/features.md#a, "docs/b.md"]\n  models: []`));
    assert.deepEqual(t._spec_paths, ['docs/features.md#a', 'docs/b.md']);
  });

  test('une sous-clé inline hors de spec_refs ne fuit pas dans _spec_paths', () => {
    const t = lireFrontmatter(fm(`autre:\n  features: [docs/x.md]\n  - docs/y.md`));
    assert.equal(t._spec_paths, undefined);
  });
});

describe('lireTickets / listerTickets — sur un dépôt fabriqué', () => {
  const racine = mkdtempSync(join(tmpdir(), 'tck3003-'));
  after(() => rmSync(racine, { recursive: true, force: true }));
  const poser = (rel, texte) => {
    const chemin = join(racine, TICKETS, rel);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, texte);
  };

  poser('todo/TCK-9101-bloc.md', fm(`id: TCK-9101\nstatus: todo\ndepends_on:\n  - TCK-9102\nwave:`));
  poser('done/TCK-9102-scalaire.md', fm(`id: TCK-9102\nstatus: done\ndepends_on: TCK-9101`));
  poser('TCK-9103-neuf-a-la-racine.md', fm(`id: TCK-9103\nstatus: todo`));
  poser('todo/mal-nomme.md', fm(`id: TCK-9104\nstatus: todo`));
  poser('todo/TCK-9105-sans-frontmatter.md', '# rien\n');
  poser('todo/TCK-9106-sans-id.md', fm(`status: todo`));
  poser('done/TCK-9107-double-a.md', fm(`id: TCK-9107\nstatus: done`));
  poser('done/TCK-9107-double-b.md', fm(`id: TCK-9107\nstatus: done`));
  poser('todo/_brouillon.md', fm(`id: TCK-9108`));
  poser('todo/notes.txt', 'pas un ticket');

  test('listerTickets : tout .md hors _*, à toute profondeur, trié — un nom mal formé compris', () => {
    assert.deepEqual(listerTickets(racine), [
      'TCK-9103-neuf-a-la-racine.md',
      'done/TCK-9102-scalaire.md',
      'done/TCK-9107-double-a.md',
      'done/TCK-9107-double-b.md',
      'todo/TCK-9101-bloc.md',
      'todo/TCK-9105-sans-frontmatter.md',
      'todo/TCK-9106-sans-id.md',
      'todo/mal-nomme.md',
    ]);
  });

  const { tickets, erreurs } = lireTickets(racine);
  const par = (id) => tickets.find((t) => t.id === id);

  test('une dépendance en liste en bloc est lue (AC2)', () => {
    assert.deepEqual(par('TCK-9101').depends_on, ['TCK-9102']);
    assert.equal(par('TCK-9101').wave, null);
  });

  test('listes normalisées : toujours des tableaux, un scalaire devient une liste d’un élément', () => {
    assert.deepEqual(par('TCK-9102').depends_on, ['TCK-9101']);
    for (const t of tickets) {
      for (const cle of ['depends_on', 'blocks', 'tags', '_spec_paths']) assert.ok(Array.isArray(t[cle]), `${t.id}.${cle}`);
    }
  });

  test('_fichier est relatif à tickets/, et le fichier mal nommé est rendu', () => {
    assert.equal(par('TCK-9101')._fichier, 'todo/TCK-9101-bloc.md');
    assert.equal(par('TCK-9104')._fichier, 'todo/mal-nomme.md');
  });

  test('défauts de structure : sans frontmatter, sans id, id en double — les deux doublons rendus', () => {
    assert.deepEqual(erreurs, [
      'TCK-9107 : id dupliqué (done/TCK-9107-double-a.md et done/TCK-9107-double-b.md)',
      'todo/TCK-9105-sans-frontmatter.md : aucun frontmatter',
      'todo/TCK-9106-sans-id.md : aucun champ "id"',
    ]);
    assert.equal(tickets.filter((t) => t.id === 'TCK-9107').length, 2);
  });
});

describe('le vocabulaire', () => {
  test('les six statuts, dont deux clos', () => {
    assert.deepEqual(STATUTS, ['todo', 'doing', 'review', 'blocked', 'done', 'obsolete']);
    assert.deepEqual([...CLOS], ['done', 'obsolete']);
  });
});

describe('les trois outils ne lisent que par ce module', () => {
  const dossier = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (const outil of ['gen-index.mjs', 'check-backlog.mjs', 'ranger-tickets.mjs']) {
    test(outil, () => {
      const source = readFileSync(join(dossier, outil), 'utf8');
      assert.match(source, /from '\.\/tickets\.mjs'/);
      // Ni parseur de frontmatter à lui, ni parcours du dossier des tickets : la divergence n° 4
      // commencerait exactement là.
      assert.doesNotMatch(source, /function \w*[fF]rontmatter/);
      assert.doesNotMatch(source, /readdirSync/);
      assert.doesNotMatch(source, /\/\^status:/); // l'ancien `statutDe` de ranger-tickets
    });
  }
});
