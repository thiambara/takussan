/**
 * Fidélité au pixel (TCK-2684, ADR-0106) — la logique de comparaison, PURE.
 *
 * Ni système de fichiers, ni navigateur, ni `sharp` : ce module ne reçoit que des relevés (JSON) et
 * rend des lignes d'écarts. C'est lui que le test du dépôt éprouve
 * (`src/__tests__/fidelite-comparer.test.ts`), sur fixtures, sans Chrome — la CI n'a ni
 * l'application servie ni la base de démo (annexe D, § 6.2).
 *
 * Un relevé : `{ appareil, W, H, DPR, rem, spacingPx, noeuds: [...] }`, chaque nœud étant un texte,
 * une boîte ou une icône, avec ses styles calculés en px CSS (`inventaire.mjs`).
 */

/** Tolérances par défaut (annexe D, § 6.3 ; ADR-0106 § 5). */
export const TOLERANCES = Object.freeze({
  /** Position d'une ancre, en px. */
  position: 2,
  /** Dimension d'un élément d'interface, en px. */
  taille: 1,
  /** Marges internes et `gap`, en px. */
  marge: 1,
  /** Couleur, par canal sur 255. */
  couleur: 3,
  /** Opacité. */
  alpha: 0.02,
  /** Interligne, en px (arrondis du moteur sur des fractions de rem). */
  interligne: 0.5,
  /** Espacement des lettres, en px. */
  espacement: 0.1,
  /** Pixels d'une zone à contenu identique, en % (à étalonner sur les trois premiers tickets). */
  zone: 0.5,
});

const COTES = ['haut', 'droite', 'bas', 'gauche'];
/** Les tolérances se lisent bornes comprises : 0,52 − 0,5 vaut 0,020000000000000018 en flottant. */
const EPSILON = 1e-9;

/** Deux couleurs `[r, g, b, a]` (ou `null` pour transparent) égales à la tolérance près. */
export function egalCouleur(p, q, tol = TOLERANCES) {
  if (!p && !q) return true;
  if (!p || !q) return false;
  return p.every((v, i) => Math.abs(v - q[i]) <= (i === 3 ? tol.alpha : tol.couleur) + EPSILON);
}

export const formatCouleur = (c) => (c ? (c[3] === 1 ? `rgb(${c.slice(0, 3).join(',')})` : `rgba(${c.join(',')})`) : '—');

/**
 * Les écarts d'un nœud de la maquette `m` et de son homologue du produit `p`, propriété par
 * propriété. Les tolérances exactes (police, taille, graisse, rayon, bordure, ombre, icône) sont des
 * jetons discrets : toute différence est une autre classe.
 */
/** Le trait d'une icône, sans unité : `1.5px` et `1.5` se valent ; une valeur illisible reste telle quelle. */
const traitDe = (t) => (Number.isFinite(parseFloat(t)) ? String(parseFloat(t)) : String(t));

export function ecartsDe(m, p, tol = TOLERANCES) {
  const e = [];
  const num = (propriete, a, b, t, unite = 'px') => {
    if (a === b) return;
    const nombres = typeof a === 'number' && typeof b === 'number';
    if (nombres && Math.abs(a - b) <= t + EPSILON) return;
    e.push({
      propriete,
      maquette: nombres || typeof a === 'number' ? `${a}${unite}` : String(a),
      produit: nombres || typeof b === 'number' ? `${b}${unite}` : String(b),
      delta: nombres ? +(b - a).toFixed(1) : '≠',
    });
  };
  const couleur = (propriete, a, b) => {
    if (!egalCouleur(a, b, tol)) e.push({ propriete, maquette: formatCouleur(a), produit: formatCouleur(b), delta: '≠' });
  };

  const icone = m.type === 'icone';
  num('largeur', m.r.w, p.r.w, icone ? 0 : tol.taille);
  num('hauteur', m.r.h, p.r.h, icone ? 0 : tol.taille);
  num('x', m.r.x, p.r.x, tol.position);
  num('y', m.r.y, p.r.y, tol.position);
  if (m.type === 'texte') {
    num('police', m.police, p.police, 0, '');
    num('taille de police', m.taille, p.taille, 0);
    num('graisse', m.graisse, p.graisse, 0, '');
    num('interligne', m.interligne, p.interligne, tol.interligne);
    num('espacement des lettres', m.espacement, p.espacement, tol.espacement);
    num('casse', m.casse ?? 'none', p.casse ?? 'none', 0, '');
    couleur('couleur', m.couleur, p.couleur);
  }
  if (m.type === 'boite') {
    couleur('fond', m.fond, p.fond);
    num('bordure', m.bords.join(' '), p.bords.join(' '), 0, '');
    couleur('couleur de bordure', m.couleurBord, p.couleurBord);
    num('rayon', m.rayon.join(' '), p.rayon.join(' '), 0, '');
    num('ombre', m.ombre ?? 'aucune', p.ombre ?? 'aucune', 0, '');
    m.marges.forEach((v, i) => num(`marge ${COTES[i]}`, v, p.marges[i], tol.marge));
    num('écart (gap)', m.ecart, p.ecart, tol.marge);
  }
  if (icone) {
    couleur('couleur', m.couleur, p.couleur);
    // TCK-2685 — « 1.5px » (style calculé) et « 1.5 » (attribut, références gelées) sont le même trait.
    num('trait', traitDe(m.trait), traitDe(p.trait), 0, '');
  }
  return e;
}

const lecture = (p, q) => p.r.y - q.r.y || p.r.x - q.r.x;

/** Appariement des ancres d'un type : par clé exacte, puis par ordre de lecture parmi les homonymes. */
export function apparier(a, b, type) {
  const groupe = (l) =>
    [...l]
      .filter((n) => n.type === type && n.cle)
      .sort(lecture)
      .reduce((m, n) => (m.get(n.cle)?.push(n) ?? m.set(n.cle, [n]), m), new Map());
  const ga = groupe(a);
  const gb = groupe(b);
  const paires = [];
  const seulsA = [];
  for (const [cle, la] of ga) {
    const lb = gb.get(cle) ?? [];
    la.forEach((n, i) => (lb[i] ? paires.push([n, lb[i]]) : seulsA.push(n)));
    gb.delete(cle);
  }
  return { paires, seulsA, seulsB: [...gb.values()].flat() };
}

/**
 * Le nœud désigné par un sélecteur de rôle :
 * - `{ boiteDe: "texte", min?, rang? }` : la plus petite boîte qui contient ce texte ;
 * - `{ slot: "card", tag?, rang? }`, `{ fid: "…" }` : par `data-slot` (shadcn) ou `data-fid` ;
 * - `{ zone: { y, h, tol?, wMin? } }` : la première boîte à cette hauteur ;
 * - `{ texte, type?, rang? }` : le premier nœud dont la clé contient ce texte.
 */
export function choisir(noeuds, sel) {
  if (!sel) return null;
  if (sel.boiteDe) {
    const t = noeuds.filter((n) => n.type === 'texte' && n.cle.includes(sel.boiteDe))[sel.rang ?? 0];
    if (!t) return null;
    const dedans = (b) => b.r.x <= t.r.x + 0.5 && b.r.y <= t.r.y + 0.5 && b.r.x + b.r.w >= t.r.x + t.r.w - 0.5 && b.r.y + b.r.h >= t.r.y + t.r.h - 0.5;
    const boites = noeuds.filter((n) => n.type === 'boite' && dedans(n) && (!sel.min || n.r.h >= sel.min)).sort((p, q) => p.r.w * p.r.h - q.r.w * q.r.h);
    return boites[0] ?? null;
  }
  if (sel.slot || sel.fid)
    return noeuds.filter((n) => n.type === 'boite' && (!sel.slot || n.slot === sel.slot) && (!sel.fid || n.fid === sel.fid) && (!sel.tag || n.tag === sel.tag))[sel.rang ?? 0] ?? null;
  if (sel.zone) {
    const t = sel.zone.tol ?? 4;
    return noeuds.filter((n) => n.type === 'boite' && Math.abs(n.r.y - sel.zone.y) <= t && Math.abs(n.r.h - sel.zone.h) <= t && n.r.w >= (sel.zone.wMin ?? 0))[0] ?? null;
  }
  if (sel.texte) return noeuds.filter((n) => (!sel.type || n.type === sel.type) && n.cle.includes(sel.texte))[sel.rang ?? 0] ?? null;
  return null;
}

/** Les libellés d'interface : toutes les valeurs de `src/messages/fr.json`, sans leurs variables. */
export function extraireLibelles(messages) {
  const valeurs = new Set();
  (function parcourir(o) {
    for (const v of Object.values(o)) {
      if (typeof v === 'string') {
        const t = v.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
        if (t.length > 1) valeurs.add(t);
      } else if (v && typeof v === 'object') parcourir(v);
    }
  })(messages);
  return valeurs;
}

/** Une fiche de rôles étendue d'une autre (`etend`) : les listes s'additionnent, l'objet `alias` se fusionne. */
export function fusionnerRoles(base, ext) {
  return {
    ...base,
    ...ext,
    roles: [...(base.roles ?? []), ...(ext.roles ?? [])],
    zones: [...(base.zones ?? []), ...(ext.zones ?? [])],
    ancres: [...(base.ancres ?? []), ...(ext.ancres ?? [])],
    ignorer: [...(base.ignorer ?? []), ...(ext.ignorer ?? [])],
    alias: { ...(base.alias ?? {}), ...(ext.alias ?? {}) },
  };
}

/** Ce qu'un appareil de la fiche vise : `mobile` vaut pour `telephone`, `desktop` pour tout bureau. */
const vise = (cible, appareil) => !cible || cible === appareil || (cible === 'mobile' && appareil === 'telephone') || (cible === 'desktop' && appareil.startsWith('bureau'));

/**
 * Compare deux relevés. Rend les lignes (`conforme`, `écart`, `absent du produit`, `absent de la
 * maquette`), leur compte, les zones de pixels résolues et les avertissements. Ne modifie pas ses
 * entrées.
 *
 * Erreur si les deux relevés ne sont pas du même appareil ni de la même fenêtre : comparer un
 * téléphone à un bureau ne mesure rien.
 */
export function comparerReleves(maquette, produit, { roles: fiche = {}, libelles = new Set(), tol = TOLERANCES } = {}) {
  if (maquette.appareil !== produit.appareil || maquette.W !== produit.W || maquette.H !== produit.H)
    throw new Error(`relevés incomparables : ${maquette.appareil} ${maquette.W}×${maquette.H} contre ${produit.appareil} ${produit.W}×${produit.H}`);
  const avertissements = [];
  if (maquette.rem !== produit.rem)
    avertissements.push(`rem différent (maquette ${maquette.rem} px, produit ${produit.rem} px) — attendu de part et d'autre de TCK-2692 ; densité ${maquette.densite} / ${produit.densite}`);
  if (maquette.densite !== produit.densite) avertissements.push(`densité différente : maquette ×${maquette.densite}, produit ×${produit.densite}`);

  const appareil = maquette.appareil;
  const roles = (fiche.roles ?? []).filter((r) => vise(r.appareil, appareil));
  const zonesFiche = (fiche.zones ?? []).filter((z) => vise(z.appareil, appareil));
  const alias = fiche.alias ?? {};
  const ancresDeclarees = new Set(fiche.ancres ?? []);
  const ignorer = new Set(fiche.ignorer ?? []);
  const M = maquette.noeuds.map((n) => ({ ...n }));
  const P = produit.noeuds.map((n) => ({ ...n }));

  const lignes = [];
  const ajouter = (origine, nom, m, p) => {
    if (!m || !p) return lignes.push({ origine, nom, statut: !m ? 'absent de la maquette' : 'absent du produit', ecarts: [], m: m?.r ?? null, p: p?.r ?? null });
    const e = ecartsDe(m, p, tol);
    lignes.push({ origine, nom, statut: e.length ? 'écart' : 'conforme', ecarts: e, m: m.r, p: p.r });
  };

  // 1. Rôles déclarés (boîtes de données : ligne, carte…). Leur CONTENU se compare aussi, sans le
  //    texte : textes et icônes de la boîte, appariés par libellé puis par ordre de lecture, sur la
  //    typographie et le retrait depuis le bord gauche de la boîte (indépendants des données).
  const dedans = (b, n) => n.r.x >= b.r.x - 0.5 && n.r.y >= b.r.y - 0.5 && n.r.x + n.r.w <= b.r.x + b.r.w + 0.5 && n.r.y + n.r.h <= b.r.y + b.r.h + 0.5;
  const ordre = (a, b) => (Math.abs(a.r.y - b.r.y) > 4 ? a.r.y - b.r.y : a.r.x - b.r.x);
  for (const r of roles) {
    const m = choisir(M, r.maquette);
    const p = choisir(P, r.produit);
    ajouter('rôle', r.nom, m, p);
    if (!m || !p || r.contenu === false) continue;
    const tm = M.filter((n) => n.type !== 'boite' && (n.dans ? n.dans.includes(m.id) : dedans(m, n))).sort(ordre);
    const tp = P.filter((n) => n.type !== 'boite' && (n.dans ? n.dans.includes(p.id) : dedans(p, n))).sort(ordre);
    const pris = new Set();
    const paire = new Map();
    for (const a of tm) {
      const b = tp.find((n) => !pris.has(n) && n.type === a.type && n.cle === (alias[a.cle] ?? a.cle));
      if (b) {
        pris.add(b);
        paire.set(a, b);
      }
    }
    for (const a of tm) {
      if (paire.has(a)) continue;
      const b = tp.find((n) => !pris.has(n) && n.type === a.type);
      if (b) {
        pris.add(b);
        paire.set(a, b);
      }
    }
    tm.forEach((a, i) => {
      const b = paire.get(a);
      const nom = `${r.nom} › ${a.type} ${i + 1} (« ${a.cle.slice(0, 24)} »)`;
      if (!b) return lignes.push({ origine: 'rôle (contenu)', nom, statut: 'absent du produit', ecarts: [], m: a.r, p: null });
      // Le contenu ne se juge pas sur sa largeur (donnée) : seulement le retrait, et la taille d'une icône.
      const relatif = (n, boite) => ({ ...n, r: { x: +(n.r.x - boite.r.x).toFixed(1), y: 0, w: n.type === 'icone' ? n.r.w : 0, h: n.type === 'icone' ? n.r.h : 0 } });
      const e = ecartsDe(relatif(a, m), relatif(b, p), tol).map((x) => (x.propriete === 'x' ? { ...x, propriete: 'retrait depuis le bord gauche' } : x));
      lignes.push({ origine: 'rôle (contenu)', nom, statut: e.length ? 'écart' : 'conforme', ecarts: e, m: a.r, p: b.r });
    });
  }

  // 2. Ancres automatiques : même libellé d'interface des deux côtés, même icône lucide. Un texte qui
  //    n'est pas un libellé (une valeur de fr.json, ou une ancre déclarée) est une DONNÉE : il diffère
  //    par nature entre la maquette et la base de démo, et n'est pas comparé.
  for (const n of M) if (alias[n.cle]) n.cle = alias[n.cle];
  const estAncre = (n) => n.type === 'icone' || libelles.has(n.cle) || ancresDeclarees.has(n.cle);
  for (const type of ['texte', 'icone', 'boite']) {
    const { paires, seulsA, seulsB } = apparier(M.filter(estAncre), P.filter(estAncre), type);
    for (const [m, p] of paires) if (!ignorer.has(m.cle)) ajouter(`ancre ${type}`, m.cle, m, p);
    for (const m of seulsA) if (!ignorer.has(m.cle)) lignes.push({ origine: `ancre ${type}`, nom: m.cle, statut: 'absent du produit', ecarts: [], m: m.r, p: null });
    for (const p of seulsB) if (!ignorer.has(p.cle)) lignes.push({ origine: `ancre ${type}`, nom: p.cle, statut: 'absent de la maquette', ecarts: [], m: null, p: p.r });
  }

  // 3. Zones de pixels : rectangles donnés, ou la boîte d'un rôle (côté maquette).
  const zones = [];
  for (const z of zonesFiche) {
    if (!z.role) {
      zones.push({ nom: z.nom, x: z.x, y: z.y, w: z.w, h: z.h });
      continue;
    }
    const role = roles.find((r) => r.nom === z.role);
    const n = role ? choisir(M, role.maquette) : null;
    if (n) zones.push({ nom: z.nom, ...n.r });
    else avertissements.push(`zone « ${z.nom} » : rôle « ${z.role} » introuvable dans la maquette`);
  }

  const compte = {
    conformes: lignes.filter((l) => l.statut === 'conforme').length,
    ecarts: lignes.filter((l) => l.statut === 'écart').length,
    absentsDuProduit: lignes.filter((l) => l.statut === 'absent du produit').length,
    absentsDeLaMaquette: lignes.filter((l) => l.statut === 'absent de la maquette').length,
  };
  return { lignes, compte, zones, avertissements };
}

/**
 * Ce qui fait qu'un relevé n'est pas un relevé : l'outil ÉCHOUE plutôt que d'écrire une référence
 * fausse (TCK-2684, « Échec bruyant »). Rend la liste des motifs ; vide = relevé valide.
 *
 * `etat` : ce que la page a mesuré d'elle-même (`inventaire.mjs`, `ETAT`) ;
 * `attendu` : `{ W, H, rem?: number[], spacingPx?: number }`.
 */
export function motifsDeRejet(etat, attendu) {
  const motifs = [];
  if (etat.erreur) motifs.push(etat.erreur);
  if (etat.statut && etat.statut >= 400) motifs.push(`la page a répondu ${etat.statut}`);
  if (etat.chemin && attendu.chemin && etat.chemin !== attendu.chemin) motifs.push(`redirigé vers ${etat.chemin} (attendu ${attendu.chemin}) — jeton périmé, droit manquant ou page absente`);
  if (etat.ecranObtenu && attendu.ecran && etat.ecranObtenu !== attendu.ecran)
    motifs.push(`la visionneuse rend ${etat.ecranObtenu} au lieu de ${attendu.ecran} (page, approche ou écran inconnu)`);
  if (etat.echelle !== undefined && Math.abs(etat.echelle - 1) > 0.001) motifs.push(`cadre à l'échelle ${etat.echelle} (attendu 1)`);
  if (etat.largeur !== undefined && Math.abs(etat.largeur - attendu.W) > 0.5) motifs.push(`écran de ${etat.largeur} px de large (attendu ${attendu.W})`);
  if (etat.hauteur !== undefined && etat.hauteur < attendu.H - 0.5) motifs.push(`écran de ${etat.hauteur} px de haut (attendu ≥ ${attendu.H})`);
  if (attendu.rem && !attendu.rem.includes(etat.rem)) motifs.push(`rem ${etat.rem} px (attendu ${attendu.rem.join(' ou ')})`);
  if (attendu.spacingPx !== undefined && Math.abs(etat.spacingPx - attendu.spacingPx) > 0.01)
    motifs.push(`--spacing calculé ${etat.spacingPx} px (attendu ${attendu.spacingPx}, densité ×${attendu.spacingPx / 4})`);
  if (etat.polices !== undefined && etat.polices !== 'loaded') motifs.push(`polices non chargées (document.fonts.status = ${etat.polices})`);
  if (etat.noeuds !== undefined && etat.noeuds === 0) motifs.push("aucun nœud relevé : un relevé vide n'est pas un relevé conforme");
  return motifs;
}

/** Ce que la disposition rendue prouve (liens visibles de la coque) contre ce qu'on attend d'elle. */
export function motifsDeDisposition(liensVisibles, preuve, nom) {
  if (!preuve) return [];
  const vus = new Set(liensVisibles);
  const motifs = [];
  for (const h of preuve.visibles ?? []) if (!vus.has(h)) motifs.push(`disposition « ${nom} » attendue : aucun lien visible vers ${h}`);
  for (const h of preuve.absents ?? []) if (vus.has(h)) motifs.push(`disposition « ${nom} » attendue : lien visible vers ${h}, qui n'en fait pas partie`);
  return motifs;
}

const echapper = (t) => String(t).replace(/\|/g, '/');

/** Le rapport lisible : tableau résumé, pixels par zone, écarts, présents d'un seul côté, conformes. */
export function rapportMarkdown(maquette, produit, resultat, pixels, tol = TOLERANCES) {
  const { lignes, compte, avertissements } = resultat;
  const src = (r) => (r.source?.type === 'maquette' ? `maquette ${r.source.page}/${r.source.approche}/${r.source.ecran}` : r.source?.type === 'produit' ? `${r.source.url} (${r.source.persona})` : '?');
  const md = [];
  md.push(`# Rapport de fidélité — ${src(maquette)} → ${src(produit)}`, '');
  md.push(
    `Appareil : ${maquette.appareil} ${maquette.W}×${maquette.H} (DPR ${maquette.DPR}) · rem ${maquette.rem} / ${produit.rem} px · densité ×${maquette.densite} / ×${produit.densite}.`,
    `Tolérances : position ±${tol.position} px, taille ±${tol.taille} px, marges ±${tol.marge} px, couleur ±${tol.couleur}/255 par canal ; police, taille de police, graisse, rayon, bordure, ombre, icône : exacts.`,
    '',
  );
  for (const a of avertissements) md.push(`> ⚠ ${a}`);
  if (avertissements.length) md.push('');
  md.push('| Conformes | Écarts | Absents du produit | Absents de la maquette | Pixels différents (écran) |', '|---|---|---|---|---|');
  md.push(`| ${compte.conformes} | ${compte.ecarts} | ${compte.absentsDuProduit} | ${compte.absentsDeLaMaquette} | ${pixels ? `${pixels.partTotale} %` : 'non mesuré (pas d’image de référence)'} |`, '');
  if (pixels?.parZone?.length) {
    md.push('## Pixels par zone (contenu identique attendu)', '', `| Zone | Pixels différents | ≤ ${tol.zone} % |`, '|---|---|---|');
    for (const z of pixels.parZone) md.push(`| ${echapper(z.zone)} | ${z.part} % | ${z.part !== null && z.part <= tol.zone ? 'oui' : 'NON'} |`);
    md.push('');
  }
  md.push('## Écarts', '', '| Origine | Élément | Propriété | Maquette | Produit | Δ |', '|---|---|---|---|---|---|');
  for (const l of lignes.filter((x) => x.statut === 'écart'))
    for (const e of l.ecarts) md.push(`| ${l.origine} | ${echapper(l.nom)} | ${e.propriete} | ${echapper(e.maquette)} | ${echapper(e.produit)} | ${e.delta} |`);
  md.push('', '## Présents d’un seul côté', '', '| Origine | Élément | Statut | Position (x,y w×h) |', '|---|---|---|---|');
  for (const l of lignes.filter((x) => x.statut.startsWith('absent'))) {
    const r = l.m ?? l.p;
    md.push(`| ${l.origine} | ${echapper(l.nom)} | ${l.statut} | ${r ? `${r.x},${r.y} ${r.w}×${r.h}` : '—'} |`);
  }
  md.push('', '## Conformes', '', lignes.filter((x) => x.statut === 'conforme').map((l) => `\`${l.nom}\``).join(' · ') || '—', '');
  return md.join('\n');
}

/** La ligne résumée d'AC-F5 : `conformes · écarts · absents · % pixels`. */
export const ligneResumee = ({ compte }, pixels) =>
  `${compte.conformes} conformes · ${compte.ecarts} écarts · ${compte.absentsDuProduit + compte.absentsDeLaMaquette} absents · ${pixels ? `${pixels.partTotale} %` : '— %'} pixels`;
