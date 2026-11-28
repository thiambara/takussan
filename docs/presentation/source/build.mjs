// Assemble le dossier Takussan : gabarit + moteur + textes + relevés -> un seul HTML.
// Usage : node build.mjs <repo> <sortie.html> [--artifact]
// --artifact écrit aussi <sortie>.artifact.html et <sortie>.data.json (la variante publiée sur claude.ai).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = process.argv[2];
const out = process.argv[3];
const J = f => { const p = join(here, 'data', f); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };

// Les relevés (data/*.json) viennent d'agents ; à défaut, on relit les données déjà embarquées dans la page publiée.
let snap = null;
if (!existsSync(join(here, 'data', 'datamodel.json'))) {
  const prev = join(repo, 'docs/presentation/takussan.html');
  const m = readFileSync(prev, 'utf8').match(/<script id="takussan-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Ni data/*.json ni données embarquées dans ' + prev);
  snap = JSON.parse(m[1]);
  console.log('données relues depuis ' + prev);
}
const arch = snap ? snap.arch : (J('architecture.json') || {});
const dm = snap ? snap.dm : J('datamodel.json');
const actors = snap ? snap.actors : ['actors-public-customer.json', 'actors-owner-agent.json', 'actors-admin-provider-platform.json'].flatMap(f => (J(f) || { actors: [] }).actors);
// Rien d'opérationnel dans un document qui se partage : pas d'adresse de console d'administration.
for (const e of arch.deploy?.environments || []) if (/dokploy|administration du serveur/i.test(e.name + ' ' + (e.note || ''))) delete e.url;
const patches = J('patches.json') || {};

// --- corrections ciblées (noms de tables mal relevés, etc.)
const tableNames = new Set(dm.tables.map(t => t.name));
const alias = patches.tableAlias || {};
const fixT = n => alias[n] || n;
const warn = [];
for (const a of actors) {
  for (const s of a.entry?.steps || []) s.tables = (s.tables || []).map(fixT);
  if (a.profile_table) a.profile_table = fixT(a.profile_table);
  for (const f of a.features || []) {
    f.tables = (f.tables || []).map(t => typeof t === 'string' ? { name: fixT(t) } : { ...t, name: fixT(t.name) });
    for (const t of f.tables) if (!tableNames.has(t.name)) warn.push(`${a.id}/${f.id} : table inconnue « ${t.name} »`);
  }
  for (const s of a.entry?.steps || []) for (const t of s.tables) if (!tableNames.has(t)) warn.push(`${a.id}/entrée : table inconnue « ${t} »`);
}
for (const s of dm.core_story || []) s.tables = (s.tables || []).map(fixT);
for (const st of arch.request_lifecycle?.steps || []) if (/^file redis$/i.test(st.actor)) st.actor = 'File de jobs (PostgreSQL)';

// --- catalogue : docs/features-by-actor.md (généré depuis features.md)
const fba = readFileSync(join(repo, 'docs/features-by-actor.md'), 'utf8').split('\n');
const ACT = [
  ['Visiteur anonyme', 'Visiteur', 'Visiteur'], ['Locataire / Acheteur', 'Locataire', 'Locataire / acheteur'], ['Bailleur / Propriétaire', 'Propriétaire', 'Propriétaire'],
  ['Agent immobilier', 'Agent', 'Agent'], ['Prestataire de service', 'Prestataire', 'Prestataire'], ["Admin d'agence / Super-admin", 'Admin', 'Admin d’agence & plateforme'], ['Tous les utilisateurs authentifiés', 'Tous', 'Tout utilisateur connecté']
];
const catalog = { actors: [] };
let cur = null, dom = null;
for (const line of fba) {
  const h2 = line.match(/^## (.+)$/);
  if (h2) { const m = ACT.find(([k]) => h2[1].includes(k)); cur = m ? { key: m[0], short: m[1], label: m[2], total: 0, byDomain: {}, byPrio: {} } : null; if (cur) catalog.actors.push(cur); continue; }
  const h3 = line.match(/^### (§[\d.]+ .+)$/); if (h3) { dom = h3[1].trim(); continue; }
  const row = line.match(/^\| (P[0-3]) \|/);
  if (row && cur && dom) { cur.total++; cur.byDomain[dom] = (cur.byDomain[dom] || 0) + 1; cur.byPrio[row[1]] = (cur.byPrio[row[1]] || 0) + 1; }
}
catalog.unique = readFileSync(join(repo, 'docs/features.md'), 'utf8').split('\n').filter(l => /^\| P[0-3] \|/.test(l)).length;

const git = c => execSync(`git -C ${JSON.stringify(repo)} ${c}`).toString().trim();
const meta = { sha: git('rev-parse --short HEAD'), branch: git('rev-parse --abbrev-ref HEAD'), date: new Date().toISOString().slice(0, 10) };

const D = { meta, arch, dm, actors, catalog };
const json = JSON.stringify(D).replace(/</g, '\\u003c');
let html = readFileSync(join(here, 'template.html'), 'utf8');
html = html.replace('/*__DATA__*/', () => json)
  .replace('/*__COPY__*/', () => readFileSync(join(here, 'copy.js'), 'utf8'))
  .replace('/*__APP__*/', () => readFileSync(join(here, 'app.js'), 'utf8'));
// Variante claude.ai : les données vivent à côté de la page (takussan-data.json), le moteur démarre une fois chargées.
const appSrc = readFileSync(join(here, 'app.js'), 'utf8');
let art = readFileSync(join(here, 'template.html'), 'utf8')
  .replace(/<script id="takussan-data" type="application\/json">\/\*__DATA__\*\/<\/script>\n?/, '')
  .replace("const D = JSON.parse(document.getElementById('takussan-data').textContent);", '')
  .replace('/*__COPY__*/', () => readFileSync(join(here, 'copy.js'), 'utf8'))
  .replace('<main class="view" id="view" tabindex="-1"></main>', '<main class="view" id="view" tabindex="-1"><p class="muted">Chargement du dossier…</p></main>')
  .replace('/*__APP__*/', () => `fetch('takussan-data.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (D) {\n${appSrc}\n}).catch(function () { document.getElementById('view').innerHTML = '<p>Les données du dossier n\\'ont pas pu être chargées. Rechargez la page.</p>'; });`);
if (process.argv.includes('--artifact')) {
  writeFileSync(out.replace(/\.html$/, '.artifact.html'), art);
  writeFileSync(out.replace(/\.html$/, '.data.json'), JSON.stringify(D));
}
const standalone = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${html}
</body>
</html>
`;
writeFileSync(out, standalone);
console.log(`écrit ${out} : ${(html.length / 1024).toFixed(0)} Ko · ${actors.length} acteurs · ${actors.reduce((n, a) => n + (a.features || []).length, 0)} fonctionnalités · ${dm.tables.length} tables · catalogue ${catalog.unique}`);
if (warn.length) { console.log(`\n${warn.length} avertissement(s) :`); console.log([...new Set(warn)].join('\n')); }
