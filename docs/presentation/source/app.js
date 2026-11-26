"use strict";
/* ======================================================================
   Takussan — le dossier. Moteur de rendu (vanilla JS, sans build).
   Données : D (relevé du dépôt) ; textes éditoriaux : COPY.
   ====================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const arr = x => Array.isArray(x) ? x : (x == null ? [] : [x]);
const uniq = a => [...new Set(a)];
const fmt = n => typeof n === 'number' ? n.toLocaleString('fr-FR') : esc(n);
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { } }
};

/* ---------------------------------------------------------------- index */
const ARCH = D.arch || {};
const DM = D.dm || { domains: [], tables: [], relations: [] };
const TABLES = {}; DM.tables.forEach(t => TABLES[t.name] = t);
const DOMAINS = {}; DM.domains.forEach((d, i) => { d.idx = i; d.color = `var(--d${i % 10})`; d.slug = slug(d.id); DOMAINS[d.id] = d; });
const TABLE_DOMAIN = {};
DM.domains.forEach(d => arr(d.tables).forEach(t => TABLE_DOMAIN[t] = d.id));
DM.tables.forEach(t => { if (!TABLE_DOMAIN[t.name] && t.domain) TABLE_DOMAIN[t.name] = t.domain; });
const tColor = n => (DOMAINS[TABLE_DOMAIN[n]] || {}).color || 'var(--ink-3)';
const tSlug = n => 'table-' + slug(n);
const TABLE_BY_SLUG = {}; DM.tables.forEach(t => TABLE_BY_SLUG[slug(t.name)] = t.name);

/* arêtes normalisées : parent (le « un ») -> enfant (le « plusieurs ») */
const EDGES = [];
(DM.relations || []).forEach(r => {
  const type = String(r.type || '').toLowerCase();
  const push = (parent, child, kind) => { if (TABLES[parent] && TABLES[child] && parent !== child) EDGES.push({ parent, child, kind, via: r.via || '', label: r.label || '' }); };
  if (type === 'morph' || type.startsWith('morph')) {
    const targets = arr(r.targets).length ? r.targets : (r.to && r.to !== '*' ? [r.to] : []);
    targets.forEach(t => push(t, r.from, 'morph'));
  } else if (type === 'n-n' || type === 'm-n' || type === 'n-m') push(r.to, r.from, 'nn');
  else if (type === '1-n' || type === '1-*') push(r.from, r.to, 'one');
  else if (type === '1-1') push(r.to, r.from, 'oneone');
  else push(r.to, r.from, 'one'); /* n-1 par défaut */
});
const EDGE_SEEN = new Set();
for (let i = EDGES.length - 1; i >= 0; i--) { const e = EDGES[i], k = e.parent + '|' + e.child + '|' + e.via; if (EDGE_SEEN.has(k)) EDGES.splice(i, 1); else EDGE_SEEN.add(k); }
const NEIGH = {};
EDGES.forEach(e => { (NEIGH[e.parent] ||= new Set()).add(e.child); (NEIGH[e.child] ||= new Set()).add(e.parent); });

const ACTOR_ORDER = COPY.actorOrder;
const ACTORS = ACTOR_ORDER.map(id => (D.actors || []).find(a => a.id === id)).filter(Boolean);
(D.actors || []).forEach(a => { if (!ACTORS.includes(a)) ACTORS.push(a); });
const ACTOR = {}; const FEAT = {}; const TABLE_USES = {};
ACTORS.forEach((a, i) => {
  a.slug = slug(a.id); a.meta = COPY.actors[a.id] || { color: `var(--d${i})`, icon: 'user', short: a.name };
  ACTOR[a.slug] = a;
  const seen = new Set();
  arr(a.features).forEach(f => {
    let fid = slug(f.id || f.title); if (fid.startsWith(a.slug + '-')) fid = fid.slice(a.slug.length + 1); let k = a.slug + '-' + fid; while (seen.has(k)) k += '-b'; seen.add(k);
    f.key = k; f.actor = a; FEAT[k] = f;
    f.status = normStatus(f.status);
    arr(f.tables).forEach(t => { const n = typeof t === 'string' ? t : t.name; (TABLE_USES[n] ||= []).push({ f, access: typeof t === 'string' ? '' : t.access, why: typeof t === 'string' ? '' : t.why }); });
  });
});
function normStatus(s) { s = slug(s); if (s.startsWith('livr')) return 'livre'; if (s.startsWith('part')) return 'partiel'; if (s.startsWith('prev')) return 'prevu'; return s || 'livre'; }
const STATUS_LABEL = { livre: 'Livré', partiel: 'Partiel', prevu: 'Prévu' };
const ALL_FEATS = Object.values(FEAT);
function accClass(a) { a = slug(a); if (a.startsWith('cr')) return 'acc-cree'; if (a.startsWith('lit') || a.startsWith('lec')) return 'acc-lit'; if (a.startsWith('supp')) return 'acc-supprime'; return 'acc-ecrit'; }
function accLabel(a) { return a ? esc(a) : 'utilise'; }

/* ---------------------------------------------------------------- icônes */
const ICONS = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M16 7l3 3M14 9l2 2"/>',
  house: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L4 12l-1-1 6-6 1 1-1.3 1.3a4 4 0 0 0 5-1Z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};
const icon = (n, size = 18, sw = 1.8) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.user}</svg>`;

/* ---------------------------------------------------------------- liens */
const link = {
  actor: a => '#acteur-' + a.slug,
  feat: f => '#f-' + f.key,
  table: n => '#' + tSlug(n),
  domain: d => '#domaine-' + d.slug
};
const tableChip = (n, acc) => TABLES[n]
  ? `<a class="chip mono" href="${link.table(n)}"><span class="sw" style="background:${tColor(n)}"></span>${esc(n)}${acc ? ` <span class="acc ${accClass(acc)}">${esc(acc)}</span>` : ''}</a>`
  : `<span class="chip mono" title="Table absente du relevé du modèle de données">${esc(n)}</span>`;
const statusChip = s => `<span class="chip st-${s}">${STATUS_LABEL[s] || esc(s)}</span>`;
const prioChip = p => p ? `<span class="chip pr pr-${esc(p)}">${esc(p)}</span>` : '';
function routeLine(r) {
  const m = String(r).match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|ANY)\s+(.*)$/i);
  return m ? `<li><span class="verb verb-${m[1].toUpperCase()}">${m[1].toUpperCase()}</span><span>${esc(m[2])}</span></li>` : `<li><span>${esc(r)}</span></li>`;
}

/* ==================================================================== ERD */
const MONO_W = 6.75;
function erd(names, opts = {}) {
  const ghost = new Set(opts.ghost || []);
  const set = uniq(names).filter(n => TABLES[n]);
  if (!set.length) return `<p class="empty">Aucune table du relevé à dessiner.</p>`;
  const inSet = new Set(set);
  const edges = EDGES.filter(e => inSet.has(e.parent) && inSet.has(e.child));
  const nodes = set.map(n => {
    const t = TABLES[n]; const isGhost = ghost.has(n);
    let cols = arr(t.columns);
    const keys = cols.filter(c => c.k);
    const rest = cols.filter(c => !c.k);
    let shown = isGhost ? [] : opts.compact ? keys.slice(0, 7) : [...keys, ...rest].slice(0, opts.maxCols || 14);
    const hidden = isGhost ? 0 : cols.length - shown.length;
    const title = n, model = t.model || '';
    const acc = opts.access && opts.access[n];
    let w = Math.max(150, title.length * 7.6 + 34 + (acc ? 70 : 0), model.length * 6.4 + 34);
    shown.forEach(c => { w = Math.max(w, 46 + String(c.n).length * MONO_W + Math.min(String(c.t || '').length, 16) * 6.1 + 22); });
    w = Math.min(Math.round(w), 330);
    const h = 40 + shown.length * 19 + (hidden > 0 ? 19 : 0) + (shown.length || hidden ? 8 : 0);
    return { n, t, w, h, shown, hidden, model, isGhost, acc };
  });
  const N = Object.fromEntries(nodes.map(x => [x.n, x]));
  let W, H, paths = [];
  if (window.dagre) {
    const g = new dagre.graphlib.Graph({ multigraph: true });
    g.setGraph({ rankdir: opts.rankdir || 'LR', nodesep: 22, ranksep: opts.ranksep || 70, edgesep: 10, marginx: 26, marginy: 26 });
    g.setDefaultEdgeLabel(() => ({}));
    nodes.forEach(x => g.setNode(x.n, { width: x.w, height: x.h }));
    edges.forEach((e, i) => g.setEdge(e.parent, e.child, {}, 'e' + i));
    dagre.layout(g);
    nodes.forEach(x => { const p = g.node(x.n); x.x = p.x - x.w / 2; x.y = p.y - x.h / 2; });
    edges.forEach((e, i) => { const ed = g.edge({ v: e.parent, w: e.child, name: 'e' + i }); paths.push({ e, pts: ed ? ed.points : [] }); });
    W = Math.ceil(g.graph().width); H = Math.ceil(g.graph().height);
  } else {
    const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length * 1.6)));
    const sorted = [...nodes].sort((a, b) => (NEIGH[b.n]?.size || 0) - (NEIGH[a.n]?.size || 0));
    let x = 26, y = 26, rowH = 0, c = 0; W = 0;
    sorted.forEach(nd => { if (c === cols) { c = 0; x = 26; y += rowH + 46; rowH = 0; } nd.x = x; nd.y = y; x += nd.w + 56; rowH = Math.max(rowH, nd.h); W = Math.max(W, x); c++; });
    H = y + rowH + 26;
    edges.forEach(e => { const a = N[e.parent], b = N[e.child]; paths.push({ e, pts: [{ x: a.x + a.w / 2, y: a.y + a.h / 2 }, { x: b.x + b.w / 2, y: b.y + b.h / 2 }] }); });
  }
  const uid = 'm' + Math.random().toString(36).slice(2, 8);
  const defs = `<defs>
    <marker id="${uid}c" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="13" markerHeight="13" orient="auto-start-reverse"><path d="M13 7 1 1M13 7H1M13 7 1 13" fill="none" style="stroke:var(--ink-3)" stroke-width="1.4"/></marker>
    <marker id="${uid}o" viewBox="0 0 14 14" refX="2" refY="7" markerWidth="13" markerHeight="13" orient="auto-start-reverse"><path d="M5 1v12" fill="none" style="stroke:var(--ink-3)" stroke-width="1.6"/></marker>
    <marker id="${uid}d" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8"><circle cx="5" cy="5" r="3.2" style="fill:var(--surface);stroke:var(--ink-3)" stroke-width="1.4"/></marker>
  </defs>`;
  const ep = paths.map(({ e, pts }) => {
    if (!pts.length) return '';
    let d = `M${pts[0].x},${pts[0].y}`;
    if (pts.length === 2) d += ` L${pts[1].x},${pts[1].y}`;
    else { for (let i = 1; i < pts.length - 1; i++) { const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 }; d += ` Q${pts[i].x},${pts[i].y} ${i === pts.length - 2 ? pts[i + 1].x : m.x},${i === pts.length - 2 ? pts[i + 1].y : m.y}`; } }
    const dash = e.kind === 'morph' ? 'stroke-dasharray="6 5"' : e.kind === 'nn' ? 'stroke-dasharray="2 4"' : '';
    const ms = e.kind === 'morph' || e.kind === 'nn' ? `marker-start="url(#${uid}d)" marker-end="url(#${uid}d)"` : e.kind === 'oneone' ? `marker-start="url(#${uid}o)" marker-end="url(#${uid}o)"` : `marker-start="url(#${uid}o)" marker-end="url(#${uid}c)"`;
    const tip = `${e.parent} → ${e.child}${e.via ? ' · ' + e.via : ''}${e.label ? ' · ' + e.label : ''}${e.kind === 'morph' ? ' (polymorphe)' : e.kind === 'nn' ? ' (plusieurs à plusieurs)' : ''}`;
    let lbl = '';
    if (opts.labels && e.via && pts.length) { const mid = pts[Math.floor(pts.length / 2)]; lbl = `<text x="${mid.x}" y="${mid.y - 5}" text-anchor="middle" class="t-mono" font-size="9.5" style="fill:var(--ink-3);paint-order:stroke;stroke:var(--sunk-2);stroke-width:4px">${esc(e.via)}</text>`; }
    return `<g class="erd-edge" data-a="${esc(e.parent)}" data-b="${esc(e.child)}"><path d="${d}" fill="none" style="stroke:var(--ink-3)" stroke-width="1.3" ${dash} ${ms}/><path d="${d}" fill="none" stroke="transparent" stroke-width="10"><title>${esc(tip)}</title></path>${lbl}</g>`;
  }).join('');
  const nd = nodes.map(x => {
    const col = tColor(x.n);
    let rows = '';
    x.shown.forEach((c, i) => {
      const y = 46 + i * 19 + 11;
      const key = c.k === 'pk' ? 'PK' : c.k === 'fk' ? 'FK' : c.k === 'morph' ? 'MO' : c.k ? String(c.k).toUpperCase().slice(0, 2) : '';
      const keyCol = c.k === 'pk' ? 'var(--ochre)' : c.k ? 'var(--info)' : 'var(--ink-3)';
      const tt = String(c.t || '').slice(0, 16);
      rows += `<text x="10" y="${y}" font-size="8.5" font-weight="700" class="t-mono" style="fill:${keyCol}">${key}</text>`;
      rows += `<text x="32" y="${y}" font-size="11" class="t-mono" style="fill:var(--ink)">${esc(c.n)}<title>${esc(c.n)} : ${esc(c.t || '')}${c.ref ? ' → ' + esc(c.ref) : ''}${c.enum ? ' [' + esc(arr(c.enum).join(', ')) + ']' : ''}${c.note ? ' — ' + esc(c.note) : ''}</title></text>`;
      rows += `<text x="${x.w - 10}" y="${y}" font-size="10" text-anchor="end" class="t-mono" style="fill:var(--ink-3)">${esc(tt)}</text>`;
    });
    if (x.hidden > 0) rows += `<text x="32" y="${46 + x.shown.length * 19 + 11}" font-size="10" style="fill:var(--ink-3)">+ ${x.hidden} colonne${x.hidden > 1 ? 's' : ''}</text>`;
    const accB = x.acc ? `<g transform="translate(${x.w - 8},14)"><rect x="${-x.acc.length * 6 - 10}" y="-9" width="${x.acc.length * 6 + 10}" height="16" rx="4" style="fill:var(--surface);stroke:${col}"/><text x="-5" y="3" text-anchor="end" font-size="9.5" font-weight="700" style="fill:${col}">${esc(x.acc.toUpperCase())}</text></g>` : '';
    const strong = opts.focus === x.n;
    return `<g class="erd-node" data-node="${esc(x.n)}" transform="translate(${x.x},${x.y})" tabindex="0" role="link" aria-label="Table ${esc(x.n)}">
      <rect class="box" width="${x.w}" height="${x.h}" rx="8" style="fill:var(--surface);stroke:${strong ? 'var(--terra)' : 'var(--line-2)'}" stroke-width="${strong ? 2.4 : 1}" ${x.isGhost ? 'stroke-dasharray="4 3" opacity=".8"' : ''}/>
      <path d="M0 8a8 8 0 0 1 8-8h${x.w - 16}a8 8 0 0 1 8 8v28H0Z" style="fill:${col}" opacity="${x.isGhost ? .1 : .16}"/>
      <rect width="4" height="36" rx="2" style="fill:${col}"/>
      <text x="12" y="17" font-size="12.5" font-weight="700" class="t-mono" style="fill:var(--ink)">${esc(x.n)}</text>
      <text x="12" y="31" font-size="10" style="fill:var(--ink-2)">${esc(x.model || (x.isGhost ? 'autre domaine' : 'table pivot'))}</text>
      ${accB}${rows}</g>`;
  }).join('');
  return diagramFrame(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-w="${W}" data-h="${H}" role="img" aria-label="Schéma des tables ${esc(set.join(', '))}">${defs}${ep}${nd}</svg>`, 'erd');
}
function diagramFrame(svg, kind) {
  return `<div class="diagram" data-kind="${kind}"><div class="zoom"><button data-z="-1" aria-label="Dézoomer">−</button><button data-z="0" aria-label="Taille d'origine">1:1</button><button data-z="1" aria-label="Zoomer">+</button></div>${svg}</div>`;
}
const erdLegend = () => `<div class="legend tech"><span><i></i> clé étrangère (un → plusieurs)</span><span><i class="dash"></i> relation polymorphe</span><span><i class="dash" style="border-top-style:dotted"></i> plusieurs à plusieurs</span><span><b class="mono" style="color:var(--ochre)">PK</b> clé primaire</span><span><b class="mono" style="color:var(--info)">FK</b> clé étrangère</span><span>Survolez une table pour isoler ses liens, cliquez pour l'ouvrir.</span></div>`;

/* ============================================================== séquence */
const LANE_ORDER = ['user', 'Front', 'BFF', 'API', 'File', 'PostgreSQL', 'Meilisearch', 'Redis', 'Reverb'];
const LANE_META = {
  Front: { label: 'Front Next.js', kind: 'navigateur', color: 'var(--d3)' },
  BFF: { label: 'BFF Next.js', kind: 'serveur Next', color: 'var(--d8)' },
  API: { label: 'API Laravel', kind: 'contrôleur', color: 'var(--d1)' },
  File: { label: 'File de jobs', kind: 'table jobs · worker', color: 'var(--d6)' },
  PostgreSQL: { label: 'PostgreSQL', kind: 'base', color: 'var(--d2)' },
  Meilisearch: { label: 'Meilisearch', kind: 'recherche', color: 'var(--d5)' },
  Redis: { label: 'Redis', kind: 'cache', color: 'var(--d6)' },
  Reverb: { label: 'Reverb', kind: 'temps réel', color: 'var(--d9)' }
};
function laneOf(name) {
  const s = String(name || '').trim(); const l = s.toLowerCase();
  if (/^externe/.test(l)) return 'ext:' + s.replace(/^externe\s*:?\s*/i, '');
  if (/bff|route handler|server action|action serveur|serveur next|rsc/.test(l)) return 'BFF';
  if (/front|navigateur|next|page|client|ui/.test(l)) return 'Front';
  if (/meili|recherche|scout/.test(l)) return 'Meilisearch';
  if (/^file|queue|job|worker|horizon/.test(l)) return 'File';
  if (/postgres|base|db|sql|pgvector/.test(l)) return 'PostgreSQL';
  if (/reverb|temps r|websocket|broadcast/.test(l)) return 'Reverb';
  if (/redis|cache/.test(l)) return 'Redis';
  if (/^api|laravel|contr[oô]l|middleware|policy|eloquent|mod[eè]le|service|scheduler|cron/.test(l)) return 'API';
  return 'user:' + s;
}
function wrap(text, max) {
  const words = String(text || '').split(/\s+/); const lines = []; let cur = '';
  words.forEach(w => { if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if (cur) lines.push(cur); return lines.slice(0, 3);
}
function seq(flow, actorColor) {
  flow = arr(flow).filter(m => m && (m.from || m.to));
  if (!flow.length) return '<p class="empty">Séquence non relevée.</p>';
  const lanesSeen = [];
  flow.forEach(m => [laneOf(m.from), laneOf(m.to || m.from)].forEach(l => { if (!lanesSeen.includes(l)) lanesSeen.push(l); }));
  const rank = l => l.startsWith('user:') ? 0 : l.startsWith('ext:') ? 100 : LANE_ORDER.indexOf(l) === -1 ? 50 : LANE_ORDER.indexOf(l);
  const lanes = [...lanesSeen].sort((a, b) => rank(a) - rank(b) || lanesSeen.indexOf(a) - lanesSeen.indexOf(b));
  const GAP = 178, X0 = 96, TOP = 70;
  const xs = Object.fromEntries(lanes.map((l, i) => [l, X0 + i * GAP]));
  let y = TOP + 34; let body = '';
  flow.forEach((m, i) => {
    const a = laneOf(m.from), b = laneOf(m.to || m.from);
    const x1 = xs[a], x2 = xs[b]; const self = a === b;
    const span = self ? GAP - 30 : Math.abs(x2 - x1) - 20;
    const lines = wrap(m.msg || m.label || '', Math.max(14, Math.floor(span / 6.4)));
    const noteLines = m.note ? wrap(m.note, Math.max(16, Math.floor(span / 6))) : [];
    const textH = lines.length * 14 + noteLines.length * 13;
    y += textH + 4;
    const cx = self ? x1 + 12 + (GAP - 30) / 2 : (x1 + x2) / 2;
    let t = lines.map((ln, j) => `<text x="${cx}" y="${y - textH + j * 14 + 6}" text-anchor="middle" font-size="12" style="fill:var(--ink)">${esc(ln)}</text>`).join('');
    t += noteLines.map((ln, j) => `<text x="${cx}" y="${y - noteLines.length * 13 + j * 13 + 6}" text-anchor="middle" font-size="10.5" font-style="italic" style="fill:var(--ink-3)">${esc(ln)}</text>`).join('');
    const back = /^(retour|r[ée]ponse|renvoie|rend|200|201|204|ok\b)/i.test(m.msg || '') || (!self && rank(b) < rank(a) && !b.startsWith('ext:'));
    const col = back ? 'var(--ink-3)' : 'var(--ink-2)';
    let line;
    if (self) { line = `<path d="M${x1} ${y + 2} h34 v16 h-34" fill="none" style="stroke:${col}" stroke-width="1.4" marker-end="url(#sqa)"/>`; y += 16; }
    else line = `<line x1="${x1}" y1="${y + 4}" x2="${x2 + (x2 > x1 ? -4 : 4)}" y2="${y + 4}" style="stroke:${col}" stroke-width="1.4" ${back ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#sqa)"/>`;
    const nx = Math.min(x1, x2) - (self ? 0 : 0);
    const num = `<g transform="translate(${x1 + (self ? -14 : (x2 > x1 ? 12 : -12))},${y + 4})"><circle r="8" style="fill:var(--surface);stroke:${actorColor || 'var(--terra)'}" stroke-width="1.4"/><text y="3.5" text-anchor="middle" font-size="9" font-weight="700" style="fill:${actorColor || 'var(--terra)'}">${i + 1}</text></g>`;
    body += `<g class="seq-msg">${t}${line}${num}</g>`;
    y += 22;
  });
  const H = y + 30, W = X0 * 2 + (lanes.length - 1) * GAP;
  const heads = lanes.map(l => {
    const x = xs[l]; let label, kind, color;
    if (l.startsWith('user:')) { label = l.slice(5); kind = 'utilisateur'; color = actorColor || 'var(--terra)'; }
    else if (l.startsWith('ext:')) { label = l.slice(4) || 'Service externe'; const human = /agence|visiteur|prestataire|admin|invit|participant|destinataire|locataire|propri/i.test(label); kind = human ? 'personne' : 'service externe'; color = human ? 'var(--d4)' : 'var(--d7)'; }
    else ({ label, kind, color } = LANE_META[l] || { label: l, kind: '', color: 'var(--ink-3)' });
    const w = Math.max(116, Math.min(GAP - 14, label.length * 7.4 + 26));
    return `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${H - 14}" style="stroke:var(--line-2)" stroke-dasharray="3 5"/>
      <g transform="translate(${x - w / 2},14)"><rect width="${w}" height="48" rx="9" style="fill:var(--surface);stroke:${color}" stroke-width="1.5"/><rect width="${w}" height="5" rx="2" style="fill:${color}"/>
      <text x="${w / 2}" y="27" text-anchor="middle" font-size="12.5" font-weight="700" style="fill:var(--ink)">${esc(label.length > 22 ? label.slice(0, 21) + '…' : label)}</text>
      <text x="${w / 2}" y="41" text-anchor="middle" font-size="9.5" style="fill:var(--ink-3)">${esc(kind)}</text></g>`;
  }).join('');
  const defs = `<defs><marker id="sqa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 10 5 0 10Z" style="fill:var(--ink-2)"/></marker></defs>`;
  return diagramFrame(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-w="${W}" data-h="${H}" role="img" aria-label="Diagramme de séquence">${defs}${heads}${body}</svg>`, 'seq');
}

/* ============================================================== diagrammes signature */
function constellation() {
  const W = 760, H = 540, cx = W / 2, cy = H / 2 + 10, rx = 292, ry = 186;
  const as = ACTORS;
  const pos = as.map((a, i) => { const ang = -Math.PI / 2 + i * 2 * Math.PI / as.length; return { a, x: cx + rx * Math.cos(ang), y: cy + ry * Math.sin(ang), ang }; });
  let s = '';
  pos.forEach(p => {
    const flow = (COPY.actors[p.a.id] || {}).flow || '';
    const mx = cx + (p.x - cx) * .52, my = cy + (p.y - cy) * .52;
    s += `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" style="stroke:${p.a.meta.color}" stroke-width="1.6" stroke-dasharray="1 5" stroke-linecap="round"/>`;
    if (flow) s += `<text x="${mx}" y="${my}" text-anchor="middle" font-size="11" style="fill:var(--ink-2);paint-order:stroke;stroke:var(--surface);stroke-width:5px">${esc(flow)}</text>`;
  });
  s += `<circle cx="${cx}" cy="${cy}" r="80" style="fill:var(--terra)" opacity=".1"/><circle cx="${cx}" cy="${cy}" r="62" style="fill:var(--terra)"/>
    <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="19" font-weight="800" style="fill:var(--terra-ink);font-family:var(--f-display)">Takussan</text>
    <text x="${cx}" y="${cy + 19}" text-anchor="middle" font-size="9.5" style="fill:var(--terra-ink)" opacity=".85">une plateforme</text>`;
  pos.forEach(p => {
    const lbl = p.a.meta.short || p.a.name;
    s += `<a href="${link.actor(p.a)}"><g class="erd-node" transform="translate(${p.x},${p.y})">
      <circle r="31" style="fill:var(--surface);stroke:${p.a.meta.color}" stroke-width="2"/>
      <g transform="translate(-13,-13)" style="color:${p.a.meta.color}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[p.a.meta.icon] || ICONS.user}</svg></g>
      <text y="${p.y > cy + 10 ? 50 : -56}" text-anchor="middle" font-size="13" font-weight="700" style="fill:var(--ink);font-family:var(--f-display)">${esc(lbl)}</text>
      <text y="${p.y > cy + 10 ? 64 : -42}" text-anchor="middle" font-size="10" style="fill:var(--ink-3)">${esc(arr(p.a.features).length)} fonctionnalités</text>
    </g></a>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:auto" role="img" aria-label="Les acteurs de Takussan autour de la plateforme">${s}</svg>`;
}

function domainMap() {
  const ds = DM.domains.filter(d => d.id !== 'technique' && arr(d.tables).length);
  const W = 1120, H = 700, cx = W / 2, cy = H / 2, R = 250;
  const pos = {}; ds.forEach((d, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / ds.length; pos[d.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a }; });
  const pair = {};
  EDGES.forEach(e => { const A = TABLE_DOMAIN[e.parent], B = TABLE_DOMAIN[e.child]; if (!A || !B || A === B || !pos[A] || !pos[B]) return; const k = [A, B].sort().join('|'); pair[k] = (pair[k] || 0) + 1; });
  const max = Math.max(1, ...Object.values(pair));
  let s = '';
  Object.entries(pair).sort((a, b) => a[1] - b[1]).forEach(([k, n]) => {
    const [A, B] = k.split('|'); const p = pos[A], q = pos[B];
    s += `<path class="erd-edge" data-a="${esc(A)}" data-b="${esc(B)}" d="M${p.x},${p.y} Q${(p.x + q.x) / 4 + cx / 2},${(p.y + q.y) / 4 + cy / 2} ${q.x},${q.y}" fill="none" style="stroke:var(--ink-3)" stroke-width="${1 + 7 * n / max}" stroke-opacity="${.18 + .5 * n / max}" stroke-linecap="round"><title>${esc(DOMAINS[A].name)} ↔ ${esc(DOMAINS[B].name)} : ${n} relation${n > 1 ? 's' : ''}</title></path>`;
  });
  ds.forEach(d => {
    const p = pos[d.id]; const r = 12 + Math.sqrt(arr(d.tables).length) * 6.5;
    const lx = cx + (R + r + 16) * Math.cos(p.a), ly = cy + (R + r + 16) * Math.sin(p.a);
    const anchor = Math.abs(Math.cos(p.a)) < .25 ? 'middle' : Math.cos(p.a) > 0 ? 'start' : 'end';
    s += `<a href="${link.domain(d)}"><g class="erd-node" data-node="${esc(d.id)}"><circle cx="${p.x}" cy="${p.y}" r="${r}" style="fill:${d.color}" opacity=".9"/>
      <text x="${p.x}" y="${p.y + 4}" text-anchor="middle" font-size="12" font-weight="700" style="fill:var(--bg)">${arr(d.tables).length}</text>
      <text x="${lx}" y="${ly + 4}" text-anchor="${anchor}" font-size="12.5" font-weight="600" style="fill:var(--ink);font-family:var(--f-display)">${esc(d.name)}</text></g></a>`;
  });
  return diagramFrame(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-w="${W}" data-h="${H}" role="img" aria-label="Carte des domaines de données">${s}</svg>`, 'dmap');
}

/* ============================================================== graphiques */
function heatmap() {
  const cat = D.catalog; if (!cat || !cat.actors) return '';
  const doms = uniq(cat.actors.flatMap(a => Object.keys(a.byDomain))).sort((a, b) => parseFloat(a.replace(/[^\d.]/g, '')) - parseFloat(b.replace(/[^\d.]/g, '')) || a.localeCompare(b, 'fr', { numeric: true }));
  const max = Math.max(...cat.actors.flatMap(a => Object.values(a.byDomain)));
  const head = cat.actors.map(a => `<th style="text-align:center;min-width:84px">${esc(a.short)}</th>`).join('');
  const rows = doms.map(d => `<tr><td style="white-space:nowrap">${esc(d)}</td>${cat.actors.map(a => { const n = a.byDomain[d] || 0; const p = Math.round(8 + 72 * n / max); return `<td style="text-align:center;font-variant-numeric:tabular-nums;${n ? `background:color-mix(in srgb, var(--terra) ${p}%, var(--surface));color:${p > 45 ? 'var(--terra-ink)' : 'var(--ink)'};font-weight:${p > 45 ? 700 : 500}` : 'color:var(--ink-3)'}">${n || '·'}</td>`; }).join('')}</tr>`).join('');
  const tot = `<tr><td><b>Total</b></td>${cat.actors.map(a => `<td style="text-align:center"><b class="tnum">${a.total}</b></td>`).join('')}</tr>`;
  return `<div class="scroll"><table class="data"><thead><tr><th>Domaine du catalogue</th>${head}</tr></thead><tbody>${rows}${tot}</tbody></table></div>`;
}
function prioBars() {
  const cat = D.catalog; if (!cat || !cat.actors) return '';
  const max = Math.max(...cat.actors.map(a => a.total));
  const col = { P0: 'var(--terra)', P1: 'var(--ochre)', P2: 'var(--info)', P3: 'var(--ink-3)' };
  const rows = cat.actors.map(a => `<div style="display:grid;grid-template-columns:minmax(90px,170px) minmax(0,1fr) 44px;gap:12px;align-items:center">
      <span class="small" style="text-align:right">${esc(a.label)}</span>
      <div style="display:flex;height:18px;width:${100 * a.total / max}%;border-radius:4px;overflow:hidden;gap:1px">${['P0', 'P1', 'P2', 'P3'].map(p => a.byPrio[p] ? `<span title="${p} : ${a.byPrio[p]}" style="flex:${a.byPrio[p]};background:${col[p]}"></span>` : '').join('')}</div>
      <b class="tnum small">${a.total}</b></div>`).join('');
  const leg = `<div class="legend">${Object.entries(col).map(([p, c]) => `<span><span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>${p} · ${esc(COPY.prio[p])}</span>`).join('')}</div>`;
  return `<div class="panel" style="gap:10px">${rows}${leg}</div>`;
}
function statusDonut(feats) {
  const c = { livre: 0, partiel: 0, prevu: 0 }; feats.forEach(f => c[f.status] = (c[f.status] || 0) + 1);
  const tot = feats.length || 1; const col = { livre: 'var(--ok)', partiel: 'var(--warn)', prevu: 'var(--ink-3)' };
  let acc = 0; const R = 34, C = 2 * Math.PI * R;
  const arcs = Object.entries(c).filter(([, n]) => n).map(([k, n]) => { const len = C * n / tot; const s = `<circle r="${R}" fill="none" style="stroke:${col[k]}" stroke-width="11" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90)"><title>${STATUS_LABEL[k]} : ${n}</title></circle>`; acc += len; return s; }).join('');
  return `<div style="display:flex;gap:16px;align-items:center"><svg width="92" height="92" viewBox="-46 -46 92 92" aria-hidden="true"><circle r="${R}" fill="none" style="stroke:var(--sunk)" stroke-width="11"/>${arcs}<text y="6" text-anchor="middle" font-size="17" font-weight="800" style="fill:var(--ink);font-family:var(--f-display)">${feats.length}</text></svg>
    <div class="legend" style="flex-direction:column;gap:4px">${Object.entries(c).map(([k, n]) => `<span><span style="width:10px;height:10px;border-radius:2px;background:${col[k]};display:inline-block"></span>${STATUS_LABEL[k]} · <b class="tnum">${n}</b></span>`).join('')}</div></div>`;
}

/* ============================================================== vues */
const VIEWS = {};
let CURRENT = '';

VIEWS.accueil = () => {
  const C = COPY.home;
  const counts = arr(ARCH.counts);
  const pick = lbls => lbls.map(l => { const c = counts.find(x => String(x.label).startsWith(l.match)); return c && { ...c, short: l.l }; }).filter(Boolean);
  const stats = [
    { v: ACTORS.length, l: 'acteurs, chacun son espace' },
    { v: D.catalog ? D.catalog.unique : ALL_FEATS.length, l: 'fonctionnalités au catalogue' },
    { v: DM.tables.length, l: 'tables en base' },
    ...pick(C.statLabels).map(c => ({ v: c.value, l: c.short || c.label }))
  ].slice(0, 6);
  return `
  <section class="hero">
    <div class="hero-copy">
      <span class="eyebrow">${esc(C.eyebrow)}</span>
      <h1>${C.title}</h1>
      <p class="lede">${esc(C.lede)}</p>
      <div class="cta-row">
        <button class="btn primary" data-tour="business">${icon('house', 17)} Présenter Takussan</button>
        <button class="btn" data-tour="ingenieur">${icon('briefcase', 17)} Parcours ingénieur</button>
      </div>
      <p class="small muted">Le bouton <b>Business</b> en haut masque tout le détail technique. ${esc(C.note)}</p>
    </div>
  </section>

  <section>
    <div class="stats">${stats.map(s => `<div class="stat"><b>${fmt(s.v)}</b><span>${esc(s.l)}</span></div>`).join('')}</div>
    <div class="callout warn">${COPY.livreNote}</div>
  </section>

  <section>
    <div class="sec-head"><span class="eyebrow">En un coup d'œil</span><h2>Qui gravite autour de Takussan</h2><p>Sept acteurs reliés à la même plateforme, chacun avec ce qu'il y fait. Cliquez sur un acteur pour suivre son parcours.</p></div>
    <div class="panel" style="padding:12px">${constellation()}</div>
  </section>

  <section>
    <div class="sec-head"><span class="eyebrow">Le problème</span><h2>${esc(C.problemTitle)}</h2></div>
    <div class="grid g2">${C.problems.map(p => `<div class="card"><h3>${esc(p.t)}</h3><p>${esc(p.d)}</p><p style="color:var(--ink)"><b style="color:var(--terra)">Takussan :</b> ${esc(p.r)}</p></div>`).join('')}</div>
  </section>

  <section>
    <div class="sec-head"><span class="eyebrow">Le fil rouge</span><h2>La vie d'un bien, de bout en bout</h2><p>${esc(C.storyLede)}</p></div>
    <div class="story">${arr(DM.core_story).map((s, i) => `<div class="card"><span class="eyebrow" style="color:var(--terra)">Étape ${i + 1}</span><h4>${esc(s.step)}</h4>${s.detail ? `<p>${esc(s.detail)}</p>` : ''}<div class="chips tech">${arr(s.tables).map(t => tableChip(t)).join('')}</div></div>`).join('')}</div>
  </section>

  <section>
    <div class="sec-head"><span class="eyebrow">Sept portes d'entrée</span><h2>Qui utilise Takussan</h2><p>Chaque acteur entre par une porte différente et voit un espace taillé pour lui. Cliquez pour suivre son parcours complet.</p></div>
    <div class="grid">${ACTORS.map(actorCard).join('')}</div>
  </section>

  <section>
    <div class="sec-head"><span class="eyebrow">Comment ça tient</span><h2>En trois couches</h2></div>
    <div class="grid g3">${C.layers.map(l => `<div class="card"><span class="eyebrow">${esc(l.k)}</span><h3>${esc(l.t)}</h3><p>${esc(l.d)}</p></div>`).join('')}</div>
    <p class="tech"><a href="#architecture">Voir l'architecture complète →</a></p>
  </section>`;
};
function actorCard(a) {
  const n = arr(a.features).length;
  return `<a class="card" href="${link.actor(a)}"><div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="width:40px;height:40px;border-radius:11px;background:${a.meta.color}">${icon(a.meta.icon, 20)}</span><div><h3>${esc(a.name)}</h3><span class="small muted">${n} fonctionnalités relevées</span></div></div><p>${esc(a.pitch)}</p></a>`;
}

VIEWS.acteurs = () => `
  <section class="sec-head"><span class="eyebrow">Les acteurs</span><h1>Sept acteurs, une plateforme</h1><p class="lede">${esc(COPY.actorsLede)}</p></section>
  <section><div class="grid">${ACTORS.map(actorCard).join('')}</div></section>
  <section>
    <div class="sec-head"><h2>Qui fait quoi, domaine par domaine</h2><p>Nombre de fonctionnalités du catalogue (<code>docs/features.md</code>) par acteur et par domaine. Une fonctionnalité portée par plusieurs acteurs compte chez chacun. Plus la case est foncée, plus l'acteur est présent dans le domaine.</p></div>
    ${heatmap()}
  </section>
  <section>
    <div class="sec-head"><h2>Le poids de chaque acteur, par priorité</h2><p>P0 bloque le lancement, P3 relève du futur. L'agent et l'administrateur portent le plus de fonctionnalités : ce sont les utilisateurs quotidiens de l'outil.</p></div>
    ${prioBars()}
  </section>
  <section class="tech">
    <div class="sec-head"><h2>Un rôle est un profil, pas une permission</h2><p>${esc(COPY.profilesLede)}</p></div>
    ${profilesDiagram()}
    <p><a href="#acces">Le détail de l'autorisation →</a></p>
  </section>`;

VIEWS.acteur = (s) => {
  const a = ACTOR[s]; if (!a) return notFound();
  const feats = arr(a.features);
  const doms = uniq(feats.map(f => f.domain).filter(Boolean));
  const usedTables = {}; feats.forEach(f => arr(f.tables).forEach(t => { const n = t.name || t; usedTables[n] = (usedTables[n] || 0) + 1; }));
  const topTables = Object.entries(usedTables).filter(([n]) => TABLES[n]).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([n]) => n);
  const e = a.entry || {};
  const caps = arr(a.capabilities);
  const capGroups = {}; caps.forEach(c => { const k = String(c).split('.')[0]; (capGroups[k] ||= []).push(c); });
  const idx = ACTORS.indexOf(a); const prev = ACTORS[idx - 1], next = ACTORS[idx + 1];
  return `
  <section class="actor-head">
    <span class="avatar" style="background:${a.meta.color}">${icon(a.meta.icon, 38)}</span>
    <div style="display:flex;flex-direction:column;gap:8px;min-width:0"><span class="eyebrow">Acteur ${idx + 1} sur ${ACTORS.length}</span><h1>${esc(a.name)}</h1><p class="lede">${esc(a.pitch)}</p>
    <div class="chips tech">${a.profile_model ? `<span class="chip mono">${esc(a.profile_model)}</span>` : ''}${a.profile_table ? tableChip(a.profile_table) : ''}${caps.length ? `<span class="chip">${caps.length} capacités</span>` : ''}</div></div>
  </section>

  <section class="two">
    <div class="panel"><span class="eyebrow">Ce que Takussan lui apporte</span><ul class="bullets">${arr(a.value).map(v => `<li>${esc(v)}</li>`).join('')}</ul></div>
    <div class="panel"><span class="eyebrow">Ce qu'on lui épargne</span><ul class="bullets">${arr(a.pains).map(v => `<li>${esc(v)}</li>`).join('')}</ul>
      <div style="margin-top:auto">${statusDonut(feats)}</div></div>
  </section>

  ${COPY.entryBiz[a.id] ? `<section class="biz-only"><div class="sec-head"><span class="eyebrow">L'entrée</span><h2>Comment il entre dans Takussan</h2><p>${esc(COPY.entryBiz[a.id].summary)}</p></div>
    <div class="steps">${COPY.entryBiz[a.id].steps.map(([t, d]) => `<div class="step"><h4>${esc(t)}</h4><p>${esc(d)}</p></div>`).join('')}</div></section>` : ''}
  <section class="${COPY.entryBiz[a.id] ? 'tech' : ''}">
    <div class="sec-head"><span class="eyebrow">L'entrée</span><h2>Comment il entre dans Takussan</h2>${COPY.entryBiz[a.id] ? `<p>${esc(COPY.entryBiz[a.id].summary)}</p><details><summary class="small" style="cursor:pointer;color:var(--ink-2)">Le détail technique de l'entrée</summary><p class="small muted" style="margin-top:8px">${esc(e.summary)}</p></details>` : `<p>${esc(e.summary)}</p>`}</div>
    <div class="steps">${arr(e.steps).map(st => `<div class="step"><h4>${esc(st.label)}</h4><p>${esc(st.detail)}</p>
      <div class="tech" style="display:flex;flex-direction:column;gap:6px">${st.page ? `<span class="chip mono" style="align-self:flex-start">${esc(st.page)}</span>` : ''}${arr(st.api).length ? `<ul class="codelist">${arr(st.api).map(routeLine).join('')}</ul>` : ''}${arr(st.tables).length ? `<div class="chips">${arr(st.tables).map(t => tableChip(t)).join('')}</div>` : ''}</div></div>`).join('')}</div>
  </section>

  ${arr(a.journey).length ? `<section><div class="sec-head"><span class="eyebrow">Le parcours</span><h2>Sa vie sur la plateforme</h2></div>
    <div class="journey">${arr(a.journey).map(j => `<div class="jstage"><b>${esc(j.stage)}</b><span>${esc(j.what)}</span></div>`).join('')}</div></section>` : ''}

  ${arr(a.spaces).length ? `<section><div class="sec-head"><span class="eyebrow">Ses écrans</span><h2>Ses espaces</h2></div>
    <div class="grid g3">${arr(a.spaces).map(sp => `<div class="card"><h4>${esc(sp.label)}</h4><p>${esc(sp.what)}</p><span class="chip mono tech" style="align-self:flex-start">${esc(sp.path)}</span></div>`).join('')}</div></section>` : ''}

  <section id="fonctions">
    <div class="sec-head"><span class="eyebrow">Ce qu'il fait</span><h2>Ses fonctionnalités principales</h2><p>${feats.length} fonctionnalités regroupées depuis le catalogue et vérifiées dans le code. Cliquez sur une carte pour voir les écrans, les appels, la séquence et les tables.</p><p class="small muted">${COPY.livreShort}</p></div>
    <div class="toolbar" id="ffilters"><button class="filter" aria-pressed="true" data-fd="">Tous les domaines</button>${doms.map(d => `<button class="filter" aria-pressed="false" data-fd="${esc(d)}">${esc(d.replace(/^§[\d.]+\s*/, ''))}</button>`).join('')}</div>
    <div class="grid g2" id="flist">${feats.map(featCard).join('')}</div>
  </section>

  ${(caps.length || a.capabilities_note) ? `<section class="tech"><div class="sec-head"><span class="eyebrow">Autorisation</span><h2>Ses droits</h2><p>${caps.length ? 'Accordées par <code>MembershipCapabilityResolver</code> pour le couple (utilisateur, agence). Une capacité se lit <code>&lt;domaine&gt;.&lt;verbe&gt;</code>.' : ''}</p>${a.capabilities_note ? `<div class="callout info">${esc(a.capabilities_note)}</div>` : ''}</div>
    <div class="grid g3">${Object.entries(capGroups).map(([k, v]) => `<div class="card"><h4 class="mono">${esc(k)}</h4><div class="chips">${v.map(c => `<span class="chip mono">${esc(String(c).split('.').slice(1).join('.') || c)}</span>`).join('')}</div></div>`).join('')}</div></section>` : ''}

  ${topTables.length ? `<section class="tech"><div class="sec-head"><span class="eyebrow">Ses données</span><h2>Les tables qu'il fait vivre</h2><p>Les ${topTables.length} tables les plus touchées par ses fonctionnalités, avec leurs liens.</p></div>${erd(topTables, { compact: true })}${erdLegend()}</section>` : ''}

  <nav class="pager">${prev ? `<a href="${link.actor(prev)}"><small>← Acteur précédent</small>${esc(prev.name)}</a>` : '<span></span>'}${next ? `<a class="next" href="${link.actor(next)}"><small>Acteur suivant →</small>${esc(next.name)}</a>` : ''}</nav>`;
};
function featCard(f) {
  const tbl = arr(f.tables).map(t => t.name || t);
  return `<a class="card feat" href="${link.feat(f)}" data-domain="${esc(f.domain || '')}"><div class="meta">${statusChip(f.status)}${prioChip(f.priority)}<span class="small muted">${esc(String(f.domain || '').replace(/^§[\d.]+\s*/, ''))}</span></div><h4>${esc(f.title)}</h4><p>${esc(f.business)}</p>${tbl.length ? `<div class="tables tech">${tbl.map(esc).join(' · ')}</div>` : ''}</a>`;
}

VIEWS.f = (k) => {
  const f = FEAT[k]; if (!f) return notFound();
  const a = f.actor; const list = arr(a.features); const i = list.indexOf(f);
  const tbls = arr(f.tables).map(t => typeof t === 'string' ? { name: t } : t);
  const access = Object.fromEntries(tbls.filter(t => t.access).map(t => [t.name, t.access]));
  const names = tbls.map(t => t.name);
  const related = ALL_FEATS.filter(g => g !== f).map(g => ({ g, n: arr(g.tables).map(t => t.name || t).filter(n => names.includes(n)).length })).filter(x => x.n).sort((x, y) => y.n - x.n).slice(0, 6);
  return `
  <section class="sec-head">
    <span class="eyebrow"><a href="${link.actor(a)}" style="color:${a.meta.color};text-decoration:none">${esc(a.name)}</a> · ${esc(f.domain || '')}</span>
    <h1>${esc(f.title)}</h1>
    <div class="chips">${statusChip(f.status)}${prioChip(f.priority)}${f.priority ? `<span class="chip">${esc(COPY.prio[f.priority] || '')}</span>` : ''}</div>
    <p class="lede">${esc(f.business)}</p>
    ${f.status === 'livre' ? `<p class="small muted">${COPY.livreShort}</p>` : ''}
  </section>

  ${arr(f.flow).length ? `<section class="tech"><div class="sec-head"><span class="eyebrow">Ce qui se passe</span><h2>Pas à pas</h2></div>
    <p class="tech small muted">Comment lire : chaque colonne est une pièce du système (l'utilisateur, le front, l'API, la base…). On lit de haut en bas ; une flèche pleine est une demande, une flèche en pointillé une réponse.</p><div class="tech">${seq(f.flow, a.meta.color)}</div>
    <div class="legend tech"><span><i></i> appel</span><span><i class="dash"></i> réponse</span><span>Les flèches sont numérotées dans l'ordre d'exécution.</span></div></section>` : ''}

  <section class="two tech">
    <div class="panel"><span class="eyebrow">Écrans</span>${arr(f.pages).length ? `<ul class="codelist">${arr(f.pages).map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : '<p class="empty">Aucun écran dédié.</p>'}
      <span class="eyebrow" style="margin-top:6px">Appels à l'API</span>${arr(f.api).length ? `<ul class="codelist">${arr(f.api).map(routeLine).join('')}</ul>` : '<p class="empty">Aucun.</p>'}</div>
    <div class="panel"><span class="eyebrow">Côté serveur</span>${arr(f.backend).length ? `<ul class="codelist">${arr(f.backend).map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '<p class="empty">Non relevé.</p>'}</div>
  </section>

  ${tbls.length ? `<section class="tech"><div class="sec-head"><span class="eyebrow">Les données</span><h2>Les tables concernées</h2><p>Ce que la fonctionnalité lit, crée ou modifie en base.</p></div>
    <p class="tech small muted">Comment lire : chaque boîte est une table. L'étiquette en haut à droite dit ce que la fonctionnalité y fait (crée, lit, met à jour). Un trait relie deux tables quand l'une pointe vers l'autre par une clé.</p><div class="tech">${erd(names, { access, compact: false, maxCols: 10 })}${erdLegend()}</div>
    <div class="scroll"><table class="data"><thead><tr><th>Table</th><th>Accès</th><th>Pourquoi</th></tr></thead><tbody>${tbls.map(t => `<tr><td>${tableChip(t.name)}</td><td>${t.access ? `<span class="acc ${accClass(t.access)}">${esc(t.access)}</span>` : ''}</td><td>${esc(t.why || (TABLES[t.name] || {}).purpose || '')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}

  ${(arr(f.rules).length || arr(f.notifications).length) ? `<section class="two tech">
    ${arr(f.rules).length ? `<div class="panel"><span class="eyebrow">Règles</span><ul class="bullets">${arr(f.rules).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    ${arr(f.notifications).length ? `<div class="panel"><span class="eyebrow">Notifications</span><ul class="bullets">${arr(f.notifications).map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
  </section>` : ''}

  ${related.length ? `<section><div class="sec-head"><span class="eyebrow">Sur les mêmes données</span><h2>Fonctionnalités liées</h2><p>Elles partagent au moins une table avec celle-ci : un changement de schéma les touche aussi.</p></div>
    <div class="grid g2">${related.map(({ g, n }) => `<a class="card" href="${link.feat(g)}"><div class="meta" style="display:flex;gap:6px;align-items:center"><span class="chip" style="border-color:${g.actor.meta.color};color:${g.actor.meta.color}">${esc(g.actor.meta.short || g.actor.name)}</span><span class="small muted">${n} table${n > 1 ? 's' : ''} en commun</span></div><h4>${esc(g.title)}</h4></a>`).join('')}</div></section>` : ''}

  <nav class="pager">${list[i - 1] ? `<a href="${link.feat(list[i - 1])}"><small>← Précédente</small>${esc(list[i - 1].title)}</a>` : `<a href="${link.actor(a)}"><small>← Retour</small>${esc(a.name)}</a>`}${list[i + 1] ? `<a class="next" href="${link.feat(list[i + 1])}"><small>Suivante →</small>${esc(list[i + 1].title)}</a>` : ''}</nav>`;
};

VIEWS.donnees = () => {
  const st = DM.stats || {};
  const ds = DM.domains;
  const maxT = Math.max(...ds.map(d => arr(d.tables).length));
  return `
  <section class="sec-head"><span class="eyebrow">Le modèle de données</span><h1>${DM.tables.length} tables, ${ds.length} domaines</h1><p class="lede">${esc(COPY.dataLede)}</p><p class="small muted tech">Le compte est celui des tables qui existent après les ${fmt(st.migrations || 385)} migrations. La page « En chiffres » compte ${fmt((arr(ARCH.counts).find(c => /Schema::create/.test(c.label)) || {}).value || '…')} créations de table : quelques tables ont été supprimées depuis, dont celles du courtier (ADR-0030).</p></section>
  <section><div class="stats">
    <div class="stat"><b>${DM.tables.length}</b><span>tables relevées</span></div>
    <div class="stat"><b>${EDGES.length}</b><span>liens entre tables</span></div>
    ${st.models ? `<div class="stat"><b>${st.models}</b><span>modèles Eloquent</span></div>` : ''}
    ${st.pivots != null ? `<div class="stat"><b>${st.pivots}</b><span>tables pivots</span></div>` : ''}
    ${st.morph_relations != null ? `<div class="stat"><b>${st.morph_relations}</b><span>relations polymorphes</span></div>` : ''}
  </div></section>
  <section><div class="sec-head"><h2>La carte des domaines</h2><p>Chaque disque est un domaine ; sa taille suit son nombre de tables. L'épaisseur d'un trait compte les clés étrangères qui relient deux domaines. Survolez pour isoler, cliquez pour entrer.</p></div>${domainMap()}</section>
  <section><div class="sec-head"><h2>Les domaines</h2></div>
    <div class="grid g2">${ds.map(d => `<a class="card" href="${link.domain(d)}"><div style="display:flex;align-items:center;gap:10px"><span style="width:12px;height:12px;border-radius:3px;background:${d.color}"></span><h3>${esc(d.name)}</h3><span class="small muted" style="margin-left:auto">${arr(d.tables).length} tables</span></div><p>${esc(d.summary)}</p><div style="height:4px;border-radius:2px;background:var(--sunk)"><div style="height:4px;border-radius:2px;width:${100 * arr(d.tables).length / maxT}%;background:${d.color}"></div></div></a>`).join('')}</div></section>
  <section class="tech"><div class="sec-head"><h2>Le cœur du schéma</h2><p>Les tables les plus reliées, celles par lesquelles passe presque tout.</p></div>
    ${erd(Object.entries(NEIGH).sort((a, b) => b[1].size - a[1].size).slice(0, 16).map(([n]) => n), { compact: true })}${erdLegend()}</section>`;
};

VIEWS.domaine = (s) => {
  const d = DM.domains.find(x => x.slug === s); if (!d) return notFound();
  const own = arr(d.tables).filter(n => TABLES[n]);
  const ext = uniq(own.flatMap(n => EDGES.filter(e => e.child === n && !own.includes(e.parent)).map(e => e.parent))).slice(0, 10);
  const children = uniq(own.flatMap(n => EDGES.filter(e => e.parent === n && !own.includes(e.child)).map(e => e.child)));
  const feats = ALL_FEATS.filter(f => arr(f.tables).some(t => own.includes(t.name || t)));
  return `
  <section class="sec-head"><span class="eyebrow" style="color:${d.color}">Domaine de données</span><h1>${esc(d.name)}</h1><p class="lede">${esc(d.summary)}</p></section>
  <section class="tech"><div class="sec-head"><h2>Le schéma</h2><p>Les ${own.length} tables du domaine avec leurs clés. En pointillé, les tables d'autres domaines dont elles dépendent${ext.length ? ` (${ext.map(esc).join(', ')})` : ''}. Le détail des colonnes est sur la fiche de chaque table.</p></div>
    ${erd([...own, ...ext], { ghost: ext, compact: true })}${children.length ? `<p class="small muted">Dans l'autre sens, ${children.length} tables d'autres domaines pointent vers celui-ci : ${children.slice(0, 30).map(n => `<a href="${link.table(n)}" class="mono">${esc(n)}</a>`).join(', ')}${children.length > 30 ? '…' : ''}.</p>` : ''}${erdLegend()}</section>
  <section class="tech"><div class="sec-head"><h2>Les tables</h2></div>
    <div class="scroll"><table class="data"><thead><tr><th>Table</th><th class="tech">Modèle</th><th>À quoi elle sert</th><th>Utilisée par</th></tr></thead><tbody>${own.map(n => { const t = TABLES[n]; const u = TABLE_USES[n] || []; return `<tr><td>${tableChip(n)}</td><td class="mono tech small">${esc(t.model || '—')}</td><td>${esc(t.purpose)}</td><td class="small tnum">${u.length ? `${u.length} fonctionnalité${u.length > 1 ? 's' : ''}` : '<span class="muted">—</span>'}</td></tr>`; }).join('')}</tbody></table></div></section>
  ${feats.length ? `<section><div class="sec-head"><h2>Les fonctionnalités qui le font vivre</h2></div><div class="grid g2">${feats.slice(0, 24).map(featCardWithActor).join('')}</div></section>` : ''}`;
};
function featCardWithActor(f) {
  return `<a class="card" href="${link.feat(f)}"><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="chip" style="border-color:${f.actor.meta.color};color:${f.actor.meta.color}">${esc(f.actor.meta.short || f.actor.name)}</span>${statusChip(f.status)}</div><h4>${esc(f.title)}</h4><p>${esc(f.business)}</p></a>`;
}

VIEWS.table = (s) => {
  const n = TABLE_BY_SLUG[s]; const t = TABLES[n]; if (!t) return notFound();
  const d = DOMAINS[TABLE_DOMAIN[n]];
  const nb = [...(NEIGH[n] || [])];
  const rels = EDGES.filter(e => e.parent === n || e.child === n);
  const uses = TABLE_USES[n] || [];
  const byActor = {}; uses.forEach(u => (byActor[u.f.actor.id] ||= []).push(u));
  return `
  <section class="sec-head"><span class="eyebrow">${d ? `<a href="${link.domain(d)}" style="color:${d.color};text-decoration:none">${esc(d.name)}</a>` : 'Table'}</span>
    <h1 class="mono" style="font-family:var(--f-mono);font-size:clamp(1.6rem,3.4vw,2.4rem);letter-spacing:-0.03em">${esc(n)}</h1>
    <div class="chips tech">${t.model ? `<span class="chip mono">App\\Models\\${esc(t.model)}</span>` : ''}${t.soft_deletes ? '<span class="chip">suppression douce</span>' : ''}<span class="chip">${arr(t.columns).length} colonnes relevées</span></div>
    <p class="lede">${esc(t.purpose)}</p>${t.notes ? `<div class="callout">${esc(t.notes)}</div>` : ''}</section>
  <section class="tech"><div class="sec-head"><h2>Son voisinage</h2></div>${erd([n, ...nb.slice(0, 16)], { focus: n, labels: nb.length <= 10, ghost: nb, compact: true })}${nb.length > 16 ? `<p class="small muted">Et ${nb.length - 16} autres : ${nb.slice(16).map(x => `<a href="${link.table(x)}" class="mono">${esc(x)}</a>`).join(', ')}.</p>` : ''}${erdLegend()}</section>
  <section class="tech"><div class="sec-head"><h2>Les colonnes</h2></div>
    <div class="scroll"><table class="data"><thead><tr><th>Colonne</th><th>Type</th><th>Clé</th><th>Détail</th></tr></thead><tbody>${arr(t.columns).map(c => `<tr><td class="mono">${esc(c.n)}</td><td class="mono small muted">${esc(c.t)}</td><td>${c.k ? `<span class="chip mono">${esc(String(c.k).toUpperCase())}</span>` : ''}</td><td class="small">${c.ref ? `→ ${tableChip(c.ref)} ` : ''}${c.enum ? `<span class="mono">${arr(c.enum).map(esc).join(' · ')}</span> ` : ''}${esc(c.note || '')}</td></tr>`).join('')}</tbody></table></div>
    ${arr(t.unique).length ? `<p class="small muted">Unicité : ${arr(t.unique).map(u => `<code>${esc(u)}</code>`).join(', ')}</p>` : ''}</section>
  ${rels.length ? `<section class="tech"><div class="sec-head"><h2>Ses relations</h2></div><div class="scroll"><table class="data"><thead><tr><th>Parent</th><th></th><th>Enfant</th><th>Par</th><th>Nature</th></tr></thead><tbody>${rels.map(e => `<tr><td>${tableChip(e.parent)}</td><td class="muted">→</td><td>${tableChip(e.child)}</td><td class="mono small">${esc(e.via)}</td><td class="small">${{ one: 'un → plusieurs', oneone: 'un → un', morph: 'polymorphe', nn: 'plusieurs ↔ plusieurs' }[e.kind]}${e.label ? ' · ' + esc(e.label) : ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  <section><div class="sec-head"><h2>Qui s'en sert</h2><p>${uses.length ? `${uses.length} fonctionnalité${uses.length > 1 ? 's' : ''} relevée${uses.length > 1 ? 's' : ''} touchent cette table.` : 'Aucune fonctionnalité relevée ne la cite directement : elle sert en coulisse.'}</p></div>
    ${Object.entries(byActor).map(([aid, us]) => { const a = ACTORS.find(x => x.id === aid); return `<div class="panel" style="gap:8px"><h4 style="color:${a.meta.color}">${esc(a.name)}</h4><ul class="codelist" style="font-family:var(--f-body)">${us.map(u => `<li style="font-family:var(--f-body);font-size:.9rem">${u.access ? `<span class="acc ${accClass(u.access)}">${esc(u.access)}</span>` : ''}<a href="${link.feat(u.f)}">${esc(u.f.title)}</a>${u.why ? `<span class="muted small"> — ${esc(u.why)}</span>` : ''}</li>`).join('')}</ul></div>`; }).join('')}</section>`;
};

/* ------------------------------------------------------- vues techniques */
function profilesDiagram() {
  const au = ARCH.authorization || {};
  const profs = arr(au.profiles).length ? arr(au.profiles) : ACTORS.filter(a => a.profile_model).map(a => ({ model: a.profile_model, actor: a.name }));
  const W = 920, rowH = 46, H = Math.max(300, 70 + profs.length * rowH);
  const y0 = (H - profs.length * rowH) / 2 + 20;
  const box = (x, y, w, h, title, sub, col) => `<g transform="translate(${x},${y})"><rect width="${w}" height="${h}" rx="10" style="fill:var(--surface);stroke:${col || 'var(--line-2)'}" stroke-width="1.5"/><text x="${w / 2}" y="${sub ? h / 2 - 2 : h / 2 + 5}" text-anchor="middle" font-size="13" font-weight="700" style="fill:var(--ink)">${esc(title)}</text>${sub ? `<text x="${w / 2}" y="${h / 2 + 14}" text-anchor="middle" font-size="10.5" style="fill:var(--ink-3)">${esc(sub)}</text>` : ''}</g>`;
  let s = `<defs><marker id="pa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 10 5 0 10Z" style="fill:var(--ink-3)"/></marker></defs>`;
  const cy = H / 2;
  s += box(20, cy - 32, 140, 64, 'Utilisateur', 'users', 'var(--terra)');
  s += box(200, cy - 32, 150, 64, 'Agence active', 'profil actif résolu', 'var(--d4)');
  s += `<line x1="160" y1="${cy}" x2="198" y2="${cy}" style="stroke:var(--ink-3)" stroke-width="1.4" marker-end="url(#pa)"/>`;
  profs.forEach((p, i) => {
    const y = y0 + i * rowH - 20; const a = ACTORS.find(x => x.profile_model === p.model);
    const sub = String(p.actor || (a ? a.name : '')).replace(/\s*\(.*\)$/, ''); s += box(400, y, 236, 38, p.model, sub.length > 34 ? sub.slice(0, 33) + '…' : sub, a ? a.meta.color : 'var(--line-2)');
    s += `<path d="M350 ${cy} C 375 ${cy}, 375 ${y + 19}, 398 ${y + 19}" fill="none" style="stroke:var(--ink-3)" stroke-width="1.2" marker-end="url(#pa)"/>`;
    s += `<path d="M636 ${y + 19} C 658 ${y + 19}, 658 ${cy}, 678 ${cy}" fill="none" style="stroke:var(--ink-3)" stroke-width="1.2"/>`;
  });
  s += box(680, cy - 40, 220, 80, 'Résolveur de capacités', `OU entre profils · ${au.capability_count || '…'} capacités`, 'var(--sage)');
  s += `<text x="790" y="${cy + 64}" text-anchor="middle" font-size="11" style="fill:var(--ink-2)">« peut-il faire properties.publish</text><text x="790" y="${cy + 78}" text-anchor="middle" font-size="11" style="fill:var(--ink-2)">dans CETTE agence ? »</text>`;
  return diagramFrame(`<svg width="${W}" height="${H + 30}" viewBox="0 0 ${W} ${H + 30}" data-w="${W}" data-h="${H + 30}" role="img" aria-label="Du compte aux capacités">${s}</svg>`, 'prof');
}

function archDiagram() {
  const svc = arr(ARCH.services);
  const W = 960, H = 560;
  const B = (x, y, w, h, t, sub, col, extra = '') => `<g transform="translate(${x},${y})"><rect width="${w}" height="${h}" rx="12" style="fill:var(--surface);stroke:${col}" stroke-width="1.6" ${extra}/><rect x="0" y="0" width="5" height="${h}" rx="2.5" style="fill:${col}"/><text x="18" y="24" font-size="14" font-weight="700" style="fill:var(--ink);font-family:var(--f-display)">${esc(t)}</text>${arr(sub).map((l, i) => `<text x="18" y="${44 + i * 16}" font-size="11" style="fill:var(--ink-2)">${esc(l)}</text>`).join('')}</g>`;
  const A = (x1, y1, x2, y2, lbl, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:var(--ink-3)" stroke-width="1.5" ${dash ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#aa)"/>${lbl ? `<text x="${(x1 + x2) / 2 + 6}" y="${(y1 + y2) / 2}" font-size="10.5" style="fill:var(--ink-3)">${esc(lbl)}</text>` : ''}`;
  const C = COPY.arch;
  let s = `<defs><marker id="aa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 10 5 0 10Z" style="fill:var(--ink-3)"/></marker></defs>`;
  s += B(30, 20, 260, 84, 'Navigateur', C.browser, 'var(--d3)');
  s += B(350, 20, 580, 110, 'takussan-web · Next.js', C.web, 'var(--d8)');
  s += A(290, 62, 348, 62, 'HTTPS');
  s += B(350, 190, 580, 130, 'takussan-api · Laravel', C.api, 'var(--d1)');
  s += A(640, 130, 640, 188, C.webToApi);
  s += B(30, 190, 260, 130, 'Temps réel', C.realtime, 'var(--d9)');
  s += A(348, 260, 292, 260, 'diffuse');
  s += A(160, 188, 160, 106, 'WebSocket', true);
  const dataY = 390;
  const stores = C.stores;
  const sw = (580 - (stores.length - 1) * 14) / stores.length;
  stores.forEach((st, i) => { const x = 350 + i * (sw + 14); s += B(x, dataY, sw, 120, st.t, st.d, `var(--d${st.c})`); s += A(x + sw / 2, 320, x + sw / 2, dataY - 2); });
  s += B(30, dataY, 260, 120, 'Services externes', C.external, 'var(--d7)', 'stroke-dasharray="5 4"');
  s += A(348, 300, 292, dataY + 30, '', true);
  return diagramFrame(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-w="${W}" data-h="${H}" role="img" aria-label="Architecture de Takussan">${s}</svg>`, 'arch');
}

VIEWS.architecture = () => `
  <section class="sec-head"><span class="eyebrow">Technique</span><h1>L'architecture</h1><p class="lede">${esc(COPY.archLede)}</p></section>
  <section>${archDiagram()}</section>
  <section><div class="sec-head"><h2>La pile, couche par couche</h2></div>
    <div class="grid g2">${arr(ARCH.stack).map(l => `<div class="card"><span class="eyebrow">${esc(l.layer)}</span><h3>${esc(l.tech)}</h3><p>${esc(l.role)}</p>${arr(l.details).length ? `<ul class="small bullets" style="color:var(--ink-2)">${arr(l.details).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div></section>
  ${arr(ARCH.services).length ? `<section><div class="sec-head"><h2>Les services de développement</h2><p><code>docker-compose.yml</code> les sert ; <code>./dev.sh</code> démarre tout et <code>./dev.sh doctor</code> dit qui manque. Les ports sont décalés d'un cran pour cohabiter avec les services brew.</p></div>
    <div class="scroll"><table class="data"><thead><tr><th>Service</th><th>Port (dev)</th><th>Pourquoi</th></tr></thead><tbody>${arr(ARCH.services).map(s => `<tr><td><b>${esc(s.name)}</b></td><td class="mono tnum">${esc(s.port_dev ?? '')}</td><td>${esc(s.why)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  ${ARCH.search ? `<section class="two"><div class="panel"><span class="eyebrow">Recherche</span><p>${esc(ARCH.search)}</p></div>${ARCH.ai ? `<div class="panel"><span class="eyebrow">Socle IA</span><p>${esc(ARCH.ai)}</p></div>` : ''}</section>` : ''}
  ${arr(ARCH.integrations).length ? `<section><div class="sec-head"><h2>Les intégrations</h2><p>Ce qui parle au monde extérieur, et dans quel état.</p></div>
    <div class="scroll"><table class="data"><thead><tr><th>Intégration</th><th>Nature</th><th>État</th><th>Ce qu'elle fait</th></tr></thead><tbody>${arr(ARCH.integrations).map(x => `<tr><td><b>${esc(x.name)}</b>${arr(x.files).length ? `<div class="mono small muted">${arr(x.files).slice(0, 2).map(esc).join('<br>')}</div>` : ''}</td><td>${esc(x.kind)}</td><td><span class="chip ${/branch/.test(slug(x.status)) ? 'st-livre' : /prevu/.test(slug(x.status)) ? 'st-prevu' : 'st-partiel'}">${esc(x.status)}</span></td><td class="small">${esc(x.what)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;

function pipeline(steps) {
  const groups = [];
  steps.forEach((st, i) => { const l = laneOf(st.actor); const g = groups[groups.length - 1]; if (g && g.lane === l && g.actor === st.actor) g.items.push([i + 1, st]); else groups.push({ lane: l, actor: st.actor, items: [[i + 1, st]] }); });
  const short = t => { t = String(t || ''); const c = t.split(/ : |\. /)[0]; return c.length > 96 ? c.slice(0, 95) + '…' : c; };
  return `<div class="pipe">${groups.map((g, gi) => { const m = LANE_META[g.lane] || { color: 'var(--terra)', kind: '' };
    return `${gi ? '<span class="pipe-arrow" aria-hidden="true">→</span>' : ''}<div class="pipe-card" style="border-top-color:${m.color}"><span class="eyebrow">${esc(m.kind || 'étape')}</span><h4>${esc(g.actor.replace(/\s*\(.*\)$/, ''))}</h4><ol>${g.items.map(([n, st]) => `<li value="${n}">${esc(short(st.action))}</li>`).join('')}</ol></div>`; }).join('')}</div>`;
}
VIEWS.requete = () => {
  const rl = ARCH.request_lifecycle || {};
  const steps = arr(rl.steps);
  return `
  <section class="sec-head"><span class="eyebrow">Technique</span><h1>La vie d'une requête</h1><p class="lede">${esc(rl.summary || '')}</p></section>
  <section><div class="sec-head"><h2>Le trajet, couche par couche</h2><p>Une page de l'espace /app qui affiche une liste de baux. Chaque bloc est une couche traversée, dans l'ordre ; les numéros renvoient au tableau détaillé.</p></div>${pipeline(steps)}</section>
  <section><div class="sec-head"><h2>Étape par étape, avec les fichiers</h2></div>
    <div class="scroll"><table class="data"><thead><tr><th>#</th><th>Où</th><th>Ce qui se passe</th><th>Fichier</th></tr></thead><tbody>${steps.map((st, i) => `<tr><td class="tnum muted">${i + 1}</td><td><b>${esc(st.actor)}</b></td><td>${esc(st.action)}</td><td class="mono small">${esc(st.file || '')}</td></tr>`).join('')}</tbody></table></div></section>
  ${(arr(COPY.queryExamples).length) ? `<section><div class="sec-head"><h2>Lire une liste : les paramètres de requête</h2><p>Toute lecture depuis le front choisit ses colonnes, filtre côté serveur et charge ses relations par <code>include</code>. C'est une règle, pas une option.</p></div>
    <div class="panel"><ul class="codelist">${COPY.queryExamples.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div></section>` : ''}`;
};

VIEWS.acces = () => {
  const au = ARCH.authorization || {}; const at = ARCH.auth || {};
  return `
  <section class="sec-head"><span class="eyebrow">Technique</span><h1>Identité, profils et capacités</h1><p class="lede">${esc(au.summary || COPY.profilesLede)}</p></section>
  <section>${profilesDiagram()}</section>
  <section class="two"><div class="panel"><span class="eyebrow">Le résolveur</span><p>${esc(au.resolver || '')}</p></div><div class="panel"><span class="eyebrow">Rôles d'agence</span><p>${esc(au.agency_roles || '')}</p></div></section>
  ${arr(au.profiles).length ? `<section><div class="sec-head"><h2>Les profils</h2></div><div class="scroll"><table class="data"><thead><tr><th>Modèle</th><th>Acteur</th><th>Table</th><th>Notes</th></tr></thead><tbody>${arr(au.profiles).map(p => `<tr><td class="mono">${esc(p.model)}</td><td>${esc(p.actor)}</td><td>${p.table ? tableChip(p.table) : ''}</td><td class="small">${esc(p.notes || '')}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  ${arr(au.capability_domains).length ? `<section><div class="sec-head"><h2>Le vocabulaire des capacités</h2><p>${au.capability_count ? `${au.capability_count} cas dans ` : ''}<code>${esc(au.capability_enum_file || 'App\\Enums\\Capability')}</code>, de la forme <code>&lt;domaine&gt;.&lt;verbe&gt;</code>.</p></div>
    <div class="grid g3">${arr(au.capability_domains).map(c => `<div class="card"><h4 class="mono">${esc(c.domain)}</h4><div class="chips">${arr(c.verbs).map(v => `<span class="chip mono">${esc(v)}</span>`).join('')}</div></div>`).join('')}</div></section>` : ''}
  <section><div class="sec-head"><h2>L'authentification</h2><p>${esc(at.summary || '')}</p></div>
    <div class="grid g2">${arr(at.mechanisms).map(m => `<div class="card"><h4>${esc(m.name)}</h4><p>${esc(m.how)}</p>${arr(m.files).length ? `<div class="mono small muted" style="overflow-wrap:anywhere">${arr(m.files).map(esc).join('<br>')}</div>` : ''}</div>`).join('')}</div></section>`;
};

VIEWS.asynchrone = () => {
  const as = ARCH.async || {};
  return `
  <section class="sec-head"><span class="eyebrow">Technique</span><h1>Asynchrone et temps réel</h1><p class="lede">${esc(COPY.asyncLede)}</p></section>
  ${arr(as.queues).length ? `<section><div class="sec-head"><h2>Les files</h2></div><div class="chips">${arr(as.queues).map(q => `<span class="chip mono">${esc(typeof q === 'string' ? q : q.name || JSON.stringify(q))}</span>`).join('')}</div></section>` : ''}
  ${arr(as.jobs_examples).length ? `<section><div class="sec-head"><h2>Des tâches de fond</h2></div><div class="grid g2">${arr(as.jobs_examples).map(j => `<div class="card"><h4 class="mono" style="font-size:.86rem">${esc(j.name)}</h4><p>${esc(j.what)}</p></div>`).join('')}</div></section>` : ''}
  ${arr(as.scheduler).length ? `<section><div class="sec-head"><h2>Le planificateur</h2><p>Ce que le serveur fait seul, à heure fixe.</p></div><div class="scroll"><table class="data"><thead><tr><th>Commande</th><th>Quand</th><th>Ce qu'elle fait</th></tr></thead><tbody>${arr(as.scheduler).map(x => `<tr><td class="mono small">${esc(x.command)}</td><td class="small" style="white-space:nowrap">${esc(x.when)}</td><td class="small">${esc(x.what)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  ${as.realtime ? `<section><div class="callout info"><b>Temps réel.</b> ${esc(as.realtime)}</div></section>` : ''}`;
};

VIEWS.deploiement = () => {
  const dp = ARCH.deploy || {}; const ci = ARCH.ci || {};
  const steps = arr(dp.pipeline);
  return `
  <section class="sec-head"><span class="eyebrow">Technique</span><h1>Déploiement et intégration continue</h1><p class="lede">${esc(dp.summary || '')}</p></section>
  ${steps.length ? `<section><div class="sec-head"><h2>Du commit à la préproduction</h2></div><div class="steps">${steps.map(s => `<div class="step"><h4>${esc(s.step)}</h4>${s.workflow ? `<span class="chip mono" style="align-self:flex-start">${esc(s.workflow)}</span>` : ''}</div>`).join('')}</div></section>` : ''}
  ${arr(dp.environments).length ? `<section><div class="sec-head"><h2>Les environnements</h2></div><div class="grid g3">${arr(dp.environments).map(e => `<div class="card"><h4>${esc(e.name)}</h4><span class="chip ${/non|pas|aucun/i.test(e.status) ? 'st-prevu' : 'st-livre'}" style="align-self:flex-start">${esc(e.status)}</span>${e.url ? `<span class="mono small muted">${esc(e.url)}</span>` : ''}</div>`).join('')}</div></section>` : ''}
  ${arr(dp.branches).length ? `<section><div class="sec-head"><h2>Les branches</h2></div><div class="scroll"><table class="data"><tbody>${arr(dp.branches).map(b => `<tr><td class="mono"><b>${esc(b.name)}</b></td><td>${esc(b.role)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  <section><div class="sec-head"><h2>L'intégration continue</h2><p>${ci.guards_count ? `${ci.guards_count} gardes de dépôt, ` : ''}${esc(ci.coverage_ratchet || '')}</p></div>
    <div class="grid g2">${arr(ci.workflows).map(w => `<div class="card"><h4 class="mono" style="font-size:.86rem">${esc(w.file)}</h4><p>${esc(w.what)}</p></div>`).join('')}</div>
    ${arr(ci.notable).length ? `<ul class="bullets">${arr(ci.notable).map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</section>
  ${arr(ARCH.prod_status).length ? `<section><div class="sec-head"><h2>Ce qui est vrai aujourd'hui</h2><p>Relevé daté : un état d'environnement se mesure, il ne se déduit pas d'une configuration.</p></div>
    <div class="scroll"><table class="data"><thead><tr><th>Sujet</th><th>État</th><th>Source</th></tr></thead><tbody>${arr(ARCH.prod_status).map(p => `<tr><td><b>${esc(p.topic)}</b></td><td>${esc(p.state)}</td><td class="mono small muted">${esc(p.source)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}`;
};

VIEWS.ingenieur = () => `
  <section class="sec-head"><span class="eyebrow">Technique</span><h1>Le guide du premier jour</h1><p class="lede">${esc(COPY.engLede)}</p></section>
  <section><div class="sec-head"><h2>Démarrer</h2></div>
    <div class="grid g2">${COPY.commands.map(g => `<div class="panel" style="gap:10px"><span class="eyebrow">${esc(g.t)}</span>${g.c.map(([cmd, d]) => `<div style="display:flex;flex-direction:column;gap:2px"><div style="display:flex;gap:8px;align-items:center"><code style="flex:1;padding:6px 10px;display:block;overflow-x:auto;white-space:nowrap">${esc(cmd)}</code><button class="iconbtn copy" data-copy="${esc(cmd)}" aria-label="Copier la commande" style="width:30px;height:30px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg></button></div><span class="small muted">${esc(d)}</span></div>`).join('')}</div>`).join('')}</div></section>
  ${arr(ARCH.conventions).length ? `<section><div class="sec-head"><h2>Les pièges déjà payés</h2><p>Chacune de ces règles a coûté quelque chose. Les connaître évite de repayer.</p></div>
    <div class="grid g2">${arr(ARCH.conventions).map(c => `<div class="card"><h4>${esc(c.title)}</h4><p style="color:var(--ink)">${esc(c.rule)}</p><p>${esc(c.why)}</p></div>`).join('')}</div></section>` : ''}
  ${arr(ARCH.repo_map).length ? `<section><div class="sec-head"><h2>La carte du dépôt</h2></div><div class="scroll"><table class="data"><tbody>${arr(ARCH.repo_map).map(r => `<tr><td class="mono small" style="white-space:nowrap">${esc(r.path)}</td><td class="small">${esc(r.what)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  ${arr(ARCH.adr_highlights).length ? `<section><div class="sec-head"><h2>Les décisions qui structurent tout</h2><p>Une décision structurelle s'écrit en ADR avant d'être implémentée. Voici celles à lire d'abord, dans <code>docs/adr/</code>.</p></div>
    <div class="grid g2">${arr(ARCH.adr_highlights).map(a => `<div class="card"><span class="eyebrow mono">${esc(a.id)}</span><h4>${esc(a.title)}</h4><p>${esc(a.one_line)}</p></div>`).join('')}</div></section>` : ''}`;

VIEWS.chiffres = () => `
  <section class="sec-head"><span class="eyebrow">Référence</span><h1>Takussan en chiffres</h1><p class="lede">Chaque nombre a été compté sur la branche <code>${esc(D.meta.branch)}</code> au commit <code>${esc(D.meta.sha)}</code>, le ${esc(D.meta.date)}. La commande qui l'a produit est à côté : relancez-la plutôt que de recopier le chiffre.</p></section>
  <section><div class="stats">${arr(ARCH.counts).slice(0, 8).map(c => `<div class="stat"><b>${fmt(c.value)}</b><span>${esc(c.label)}</span></div>`).join('')}</div></section>
  <section><div class="scroll"><table class="data"><thead><tr><th>Mesure</th><th style="text-align:right">Valeur</th><th>Côté</th><th>Commande</th></tr></thead><tbody>${arr(ARCH.counts).map(c => `<tr><td>${esc(c.label)}</td><td style="text-align:right" class="tnum"><b>${fmt(c.value)}</b></td><td class="small muted">${esc(c.side || '')}</td><td class="mono small" style="overflow-wrap:anywhere">${esc(c.command || '')}</td></tr>`).join('')}</tbody></table></div></section>
  <section><div class="sec-head"><h2>Les tables par domaine</h2></div>
    <div class="panel" style="gap:8px">${[...DM.domains].sort((a, b) => arr(b.tables).length - arr(a.tables).length).map(d => { const n = arr(d.tables).length, m = Math.max(...DM.domains.map(x => arr(x.tables).length)); return `<a href="${link.domain(d)}" style="display:grid;grid-template-columns:minmax(100px,220px) minmax(0,1fr) 34px;gap:12px;align-items:center;text-decoration:none;color:var(--ink)"><span class="small" style="text-align:right">${esc(d.name)}</span><span style="height:14px;border-radius:3px;background:${d.color};width:${100 * n / m}%"></span><b class="small tnum">${n}</b></a>`; }).join('')}</div></section>`;

VIEWS.glossaire = () => `
  <section class="sec-head"><span class="eyebrow">Référence</span><h1>Le glossaire</h1><p class="lede">Les mots de Takussan, ceux du métier et ceux du code. Tapez pour filtrer.</p></section>
  <section><input id="gfilter" type="search" placeholder="Filtrer : bail, capacité, Radar…" aria-label="Filtrer le glossaire" style="font:inherit;padding:10px 14px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface);color:var(--ink);max-width:420px">
    <dl id="glist" class="grid g2" style="margin:0">${[...arr(ARCH.glossary)].sort((a, b) => a.term.localeCompare(b.term, 'fr')).map(g => `<div class="card" data-g="${esc(slug(g.term + ' ' + g.def))}"><dt><h4>${esc(g.term)}</h4></dt><dd style="margin:0;color:var(--ink-2);font-size:.92rem">${esc(g.def)}</dd></div>`).join('')}</dl></section>`;

function notFound() { return `<section class="sec-head"><h1>Page introuvable</h1><p><a href="#accueil">Revenir à l'accueil</a></p></section>`; }

/* ============================================================== navigation */
function buildNav() {
  const g = (title, items, cls = '') => `<nav class="nav-group ${cls}"><span class="eyebrow">${title}</span>${items.join('')}</nav>`;
  const L = (h, t, extra = '', cls = '') => `<a class="nav-link ${cls}" href="#${h}" data-h="${h}">${extra}${esc(t)}</a>`;
  $('#side').innerHTML = `
    <a class="brand" href="#accueil"><span class="brand-mark">T</span><span><b>Takussan</b><span>le dossier · ${esc(D.meta.date)}</span></span></a>
    ${g('Comprendre', [L('accueil', "Takussan en 5 minutes"), L('acteurs', 'Les acteurs'), L('parcours', 'Visites guidées')])}
    ${g('Acteurs', ACTORS.map(a => L('acteur-' + a.slug, a.name, `<span class="dot" style="background:${a.meta.color}"></span>`, '').replace('</a>', `<span class="count">${arr(a.features).length}</span></a>`)))}
    ${g('Données', [L('donnees', 'Carte des domaines'), `<div class="nav-sub">${DM.domains.map(d => L('domaine-' + d.slug, d.name, `<span class="dot" style="background:${d.color}"></span>`).replace('</a>', `<span class="count">${arr(d.tables).length}</span></a>`)).join('')}</div>`])}
    ${g('Technique', [L('architecture', 'Architecture'), L('requete', "La vie d'une requête"), L('acces', 'Profils et capacités'), L('asynchrone', 'Asynchrone et temps réel'), L('deploiement', 'Déploiement et CI'), L('ingenieur', 'Guide du premier jour')], 'tech')}
    ${g('Référence', [L('chiffres', 'En chiffres'), L('glossaire', 'Glossaire')])}
    <div class="side-foot">Relevé sur <code>${esc(D.meta.branch)}@${esc(D.meta.sha)}</code>. Les sources de vérité restent <code>docs/features.md</code>, <code>docs/models-spec.md</code> et le code.</div>`;
}
VIEWS.parcours = () => `
  <section class="sec-head"><span class="eyebrow">Visites guidées</span><h1>Choisissez votre visite</h1><p class="lede">Une visite enchaîne les pages dans le bon ordre. Une barre en bas de l'écran vous fait avancer ; les flèches du clavier aussi.</p></section>
  <section class="grid g2">${Object.entries(COPY.tours).map(([k, t]) => `<div class="card"><span class="eyebrow">${t.steps.length} étapes · ${esc(t.duration)}</span><h3>${esc(t.title)}</h3><p>${esc(t.desc)}</p><ol class="small" style="color:var(--ink-2);padding-left:1.2em">${t.steps.map(s => `<li>${esc(s.label)}</li>`).join('')}</ol><button class="btn primary" data-tour="${k}" style="align-self:flex-start">Commencer</button></div>`).join('')}</section>`;

function crumbsFor(h) {
  const parts = [['accueil', 'Takussan']];
  const [k, ...r] = h.split('-'); const rest = r.join('-');
  if (k === 'acteur' && ACTOR[rest]) parts.push(['acteurs', 'Acteurs'], [h, ACTOR[rest].name]);
  else if (k === 'f' && FEAT[rest]) { const f = FEAT[rest]; parts.push(['acteur-' + f.actor.slug, f.actor.name], [h, f.title]); }
  else if (k === 'domaine') { const d = DM.domains.find(x => x.slug === rest); parts.push(['donnees', 'Données'], [h, d ? d.name : rest]); }
  else if (k === 'table') { const n = TABLE_BY_SLUG[rest]; const d = DOMAINS[TABLE_DOMAIN[n]]; parts.push(['donnees', 'Données']); if (d) parts.push(['domaine-' + d.slug, d.name]); parts.push([h, n || rest]); }
  else if (h !== 'accueil') parts.push([h, (COPY.titles[h] || h)]);
  return parts.map(([hh, t], i) => i === parts.length - 1 ? `<span>${esc(t)}</span>` : `<a href="#${hh}">${esc(t)}</a><span class="sep">/</span>`).join('');
}

function route() {
  let h = decodeURIComponent(location.hash.slice(1)) || 'accueil';
  let html;
  if (VIEWS[h]) html = VIEWS[h]();
  else {
    const m = h.match(/^(acteur|f|domaine|table)-(.+)$/);
    html = m ? VIEWS[m[1]](m[2]) : notFound();
  }
  const v = $('#view'); v.innerHTML = html; CURRENT = h;
  $('#crumbs').innerHTML = crumbsFor(h);
  $$('.nav-link').forEach(a => a.toggleAttribute('aria-current', a.dataset.h === h) || a.removeAttribute('aria-current'));
  $$('.nav-link').forEach(a => { if (a.dataset.h === h) a.setAttribute('aria-current', 'page'); });
  const navActive = $(`.nav-link[data-h="${CSS.escape(h)}"]`); if (navActive) navActive.scrollIntoView({ block: 'nearest' });
  document.title = (h === 'accueil' ? 'Takussan, le dossier' : ($('#view h1')?.textContent || h) + ' · Takussan');
  document.body.classList.remove('nav-open');
  window.scrollTo(0, 0);
  wireView();
  renderTour();
}

function wireView() {
  const v = $('#view');
  $$('.diagram', v).forEach(dg => {
    const svg = $('svg', dg); if (!svg || !svg.dataset.w) return;
    const w0 = +svg.dataset.w, h0 = +svg.dataset.h; let z = 1;
    const avail = dg.clientWidth - 2; if (w0 > avail && avail > 200) { z = Math.max(.7, avail / w0); }
    const apply = () => { svg.setAttribute('width', Math.round(w0 * z)); svg.setAttribute('height', Math.round(h0 * z)); };
    apply();
    $$('.zoom button', dg).forEach(b => b.onclick = () => { const s = +b.dataset.z; z = s === 0 ? 1 : Math.min(2.2, Math.max(.3, z * (s > 0 ? 1.2 : 1 / 1.2))); apply(); });
    $$('.erd-node[data-node]', dg).forEach(nd => {
      const n = nd.dataset.node;
      nd.addEventListener('mouseenter', () => { dg.classList.add('focusing'); nd.classList.add('hot'); $$('.erd-edge', dg).forEach(e => { if (e.dataset.a === n || e.dataset.b === n) { e.classList.add('hot'); const o = e.dataset.a === n ? e.dataset.b : e.dataset.a; $$(`.erd-node[data-node="${CSS.escape(o)}"]`, dg).forEach(x => x.classList.add('hot')); } }); });
      nd.addEventListener('mouseleave', () => { dg.classList.remove('focusing'); $$('.hot', dg).forEach(x => x.classList.remove('hot')); });
      if (dg.dataset.kind !== 'dmap' && TABLES[n]) { const go = () => location.hash = tSlug(n); nd.addEventListener('click', go); nd.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); }
    });
  });
  const ff = $('#ffilters', v);
  if (ff) ff.addEventListener('click', e => { const b = e.target.closest('.filter'); if (!b) return; $$('.filter', ff).forEach(x => x.setAttribute('aria-pressed', x === b)); $$('#flist .feat', v).forEach(c => c.hidden = !!b.dataset.fd && c.dataset.domain !== b.dataset.fd); });
  const gf = $('#gfilter', v);
  if (gf) gf.addEventListener('input', () => { const q = slug(gf.value); $$('#glist [data-g]', v).forEach(c => c.hidden = q && !c.dataset.g.includes(q)); });
  $$('.copy', v).forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy).then(() => { b.style.color = 'var(--ok)'; setTimeout(() => b.style.color = '', 900); }).catch(() => { const c = b.previousElementSibling; const r = document.createRange(); r.selectNodeContents(c); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }); });
}

/* ============================================================== visites */
let TOUR = null;
try { TOUR = JSON.parse(sessionStorage.getItem('tk-tour') || 'null'); } catch { }
function startTour(k) { if (COPY.tours[k].mode) setMode(COPY.tours[k].mode); TOUR = { k, i: 0 }; saveTour(); location.hash = COPY.tours[k].steps[0].h; if (location.hash.slice(1) === COPY.tours[k].steps[0].h) route(); }
function saveTour() { try { sessionStorage.setItem('tk-tour', JSON.stringify(TOUR)); } catch { } }
function tourGo(d) { const t = COPY.tours[TOUR.k]; const i = TOUR.i + d; if (i < 0) return; if (i >= t.steps.length) { TOUR = null; saveTour(); renderTour(); return; } TOUR.i = i; saveTour(); location.hash = t.steps[i].h; }
function renderTour() {
  const o = $('#overlay'); const old = $('.tour', o); if (old) old.remove();
  if (!TOUR || !COPY.tours[TOUR.k]) return;
  const t = COPY.tours[TOUR.k]; const st = t.steps[TOUR.i];
  if (CURRENT !== st.h) { const j = t.steps.findIndex(s => s.h === CURRENT); if (j === -1) { return; } TOUR.i = j; saveTour(); }
  const s = t.steps[TOUR.i];
  const el = document.createElement('div'); el.className = 'tour'; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Visite guidée');
  el.innerHTML = `<span class="t"><b>${esc(t.title)}</b> · ${TOUR.i + 1}/${t.steps.length} · ${esc(s.note || s.label)}</span><button data-t="-1" ${TOUR.i ? '' : 'disabled style="opacity:.4"'}>←</button><button class="next" data-t="1">${TOUR.i === t.steps.length - 1 ? 'Terminer' : 'Suivant →'}</button><button data-t="x" aria-label="Quitter la visite">✕</button>`;
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.t === 'x') { TOUR = null; saveTour(); renderTour(); } else tourGo(+b.dataset.t); });
  o.appendChild(el);
}

/* ============================================================== recherche */
let INDEX = null;
function buildIndex() {
  const I = [];
  const add = (kind, title, sub, h, extra = '') => I.push({ kind, title, sub, h, hay: slug(title + ' ' + sub + ' ' + extra) });
  Object.entries(COPY.titles).forEach(([h, t]) => add('Page', t, '', h));
  ACTORS.forEach(a => add('Acteur', a.name, a.pitch, 'acteur-' + a.slug));
  ALL_FEATS.forEach(f => add('Fonction', f.title, f.actor.name, 'f-' + f.key, f.business + ' ' + arr(f.api).join(' ') + ' ' + arr(f.pages).join(' ')));
  DM.domains.forEach(d => add('Domaine', d.name, d.summary, 'domaine-' + d.slug));
  DM.tables.forEach(t => add('Table', t.name, t.model || t.purpose || '', tSlug(t.name), t.purpose));
  arr(ARCH.glossary).forEach(g => add('Glossaire', g.term, g.def, 'glossaire'));
  arr(ARCH.adr_highlights).forEach(a => add('ADR', a.id + ' ' + a.title, a.one_line, 'ingenieur'));
  return I;
}
function openSearch() {
  INDEX ||= buildIndex();
  const o = $('#overlay');
  const back = document.createElement('div'); back.className = 'palette-back';
  back.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Recherche"><input id="q" type="search" placeholder="Acteur, fonctionnalité, table, terme…" autocomplete="off" aria-label="Rechercher dans le dossier"><div class="results" id="res" role="listbox"></div></div>`;
  o.appendChild(back);
  const q = $('#q', back), res = $('#res', back); let sel = 0, items = [];
  const close = () => back.remove();
  const draw = () => {
    const terms = slug(q.value).split('-').filter(Boolean);
    items = !terms.length ? INDEX.filter(x => x.kind === 'Acteur' || x.kind === 'Page').slice(0, 16)
      : INDEX.map(x => ({ x, s: terms.every(t => x.hay.includes(t)) ? (slug(x.title).includes(terms.join('-')) ? 3 : slug(x.title).includes(terms[0]) ? 2 : 1) : 0 })).filter(r => r.s).sort((a, b) => b.s - a.s).slice(0, 40).map(r => r.x);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    res.innerHTML = items.length ? items.map((x, i) => `<a class="res" href="#${x.h}" role="option" aria-selected="${i === sel}"><span class="k">${esc(x.kind)}</span><span>${esc(x.title)}</span><span class="s">${esc(x.sub)}</span></a>`).join('') : '<p class="empty" style="padding:14px">Rien ne correspond.</p>';
  };
  q.addEventListener('input', () => { sel = 0; draw(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(); e.preventDefault(); $('[aria-selected="true"]', res)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); $('[aria-selected="true"]', res)?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && items[sel]) { location.hash = items[sel].h; close(); }
    else if (e.key === 'Escape') close();
  });
  res.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  back.addEventListener('click', e => { if (e.target === back) close(); });
  draw(); q.focus();
}

/* ============================================================== réglages */
function setMode(m) {
  document.body.classList.toggle('mode-business', m === 'business');
  document.body.classList.toggle('mode-tech', m !== 'business');
  $('#m-biz').setAttribute('aria-pressed', m === 'business'); $('#m-tech').setAttribute('aria-pressed', m !== 'business');
  store.set('tk-mode', m);
}
function setTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); store.set('tk-theme', t || ''); }

buildNav();
setMode(store.get('tk-mode') || 'tech');
setTheme(store.get('tk-theme') || '');
$('#m-biz').onclick = () => setMode('business');
$('#m-tech').onclick = () => setMode('tech');
$('#themebtn').onclick = () => { const cur = document.documentElement.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); setTheme(cur === 'dark' ? 'light' : 'dark'); };
$('#searchbtn').onclick = openSearch;
$('#menubtn').onclick = () => document.body.classList.toggle('nav-open');
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tour]'); if (b) startTour(b.dataset.tour);
  if (document.body.classList.contains('nav-open') && !e.target.closest('.side') && !e.target.closest('#menubtn')) document.body.classList.remove('nav-open');
});
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName);
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); if (!$('.palette-back')) openSearch(); }
  if (TOUR && !typing && !$('.palette-back')) { if (e.key === 'ArrowRight') tourGo(1); if (e.key === 'ArrowLeft') tourGo(-1); }
});
window.addEventListener('hashchange', route);
route();
