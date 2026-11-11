/**
 * Fidélité au pixel (TCK-2684) — ce qui s'évalue DANS la page relevée (chaînes passées à CDP
 * `Runtime.evaluate`). Rien ici n'est importé par la page : ce sont des expressions.
 */

/**
 * L'inventaire : les nœuds visibles dans le rectangle [0,W]×[0,H] de la racine, coordonnées
 * relatives à elle, styles calculés en px CSS.
 * - texte (élément qui porte un nœud texte) : police, taille, graisse, interligne, espacement,
 *   couleur, casse, chiffres ;
 * - boîte (fond, bordure, ombre, contour, ou `img`) : rectangle, fond, bordures, couleur de bordure,
 *   rayons, ombre, marges internes, `gap`, `data-slot`, `data-fid` ;
 * - icône (`svg`) : classe lucide, taille, couleur, `stroke-width`.
 * Chaque nœud porte ses boîtes ancêtres (`dans`) : l'appartenance se lit dans le DOM, pas dans la
 * géométrie (un texte passé SOUS la barre d'onglets ne doit pas s'y compter).
 */
export const INVENTAIRE = String.raw`(racineSel, W, H) => {
  const racine = racineSel ? document.querySelector(racineSel) : document.documentElement;
  const o = racineSel ? racine.getBoundingClientRect() : { left: 0, top: 0 };
  const cv = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = (c) => { if (!c || c === 'transparent') return null; cv.clearRect(0,0,1,1); cv.fillStyle = '#000'; cv.fillStyle = c; cv.fillRect(0,0,1,1); const d = cv.getImageData(0,0,1,1).data; return d[3] === 0 ? null : [d[0],d[1],d[2],+(d[3]/255).toFixed(2)]; };
  const px = (v) => Math.round(parseFloat(v) * 10) / 10;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: px(r.left - o.left), y: px(r.top - o.top), w: px(r.width), h: px(r.height) }; };
  const visible = (el, r) => { const s = getComputedStyle(el); return r.w > 0 && r.h > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0 && r.x < W && r.y < H && r.x + r.w > 0 && r.y + r.h > 0; };
  const norm = (t) => t.replace(/\s+/g, ' ').trim();
  const texteDirect = (el) => norm([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
  const out = [];
  const idBoite = new WeakMap();
  const ancetres = (el) => { const l = []; for (let n = el.parentElement; n && n !== racine; n = n.parentElement) if (idBoite.has(n)) l.push(idBoite.get(n)); return l; };
  for (const el of racine.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const r = rect(el);
    if (!visible(el, r)) continue;
    const s = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();
    if (tag === 'svg') {
      const cls = String(el.getAttribute('class') || '').split(/\s+/).find((c) => c.startsWith('lucide-') && c !== 'lucide-icon');
      out.push({ type: 'icone', cle: cls || 'svg', r, dans: ancetres(el), couleur: rgba(s.color), trait: el.getAttribute('stroke-width') || s.strokeWidth, texteParent: norm(el.parentElement?.innerText || '').slice(0, 40) });
      continue;
    }
    const bg = rgba(s.backgroundColor);
    const bords = [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].map(px);
    const ombre = s.boxShadow !== 'none' ? s.boxShadow : null;
    const rayon = [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomRightRadius, s.borderBottomLeftRadius].map(px);
    const td = texteDirect(el);
    const estBoite = tag === 'img' || bg || bords.some((b) => b > 0) || ombre || (s.outlineStyle !== 'none' && px(s.outlineWidth) > 0);
    if (td) {
      out.push({ type: 'texte', cle: td.slice(0, 80), tag, r, dans: ancetres(el).concat(estBoite ? [out.length + 1] : []),
        police: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), taille: px(s.fontSize), graisse: +s.fontWeight,
        interligne: s.lineHeight === 'normal' ? 'normal' : px(s.lineHeight), espacement: s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing),
        couleur: rgba(s.color), casse: s.textTransform, chiffres: s.fontVariantNumeric });
    }
    if (estBoite) {
      idBoite.set(el, out.length);
      out.push({ id: out.length, type: 'boite', dans: ancetres(el), cle: norm(el.innerText || el.getAttribute('aria-label') || '').slice(0, 80), tag, r, slot: el.dataset.slot || null, fid: el.closest('[data-fid]')?.dataset.fid || null,
        fond: bg, bords, couleurBord: bords.some((b) => b > 0) ? rgba(s.borderTopColor) || rgba(s.borderBottomColor) : null, rayon, ombre,
        marges: [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(px), ecart: s.gap === 'normal' ? 0 : px(s.gap) });
    }
  }
  return out;
}`;

/**
 * L'état de la page relevée : `rem`, `--spacing` CALCULÉ (en px, par une sonde : la propriété
 * personnalisée se lit « 0.25rem », pas en px), polices, chemin, et — pour une maquette — la
 * géométrie du cadre et l'écran que la visionneuse a réellement résolu (elle retombe en silence sur
 * la première page, la première approche, et borne l'écran).
 */
export const ETAT = String.raw`async (racineSel) => {
  await document.fonts.ready;
  const html = document.documentElement;
  const rem = Math.round(parseFloat(getComputedStyle(html).fontSize) * 100) / 100;
  const sonde = document.createElement('div');
  sonde.style.cssText = 'position:absolute;visibility:hidden;width:calc(var(--spacing) * 100);height:0';
  document.body.appendChild(sonde);
  const spacingPx = Math.round(sonde.getBoundingClientRect().width) / 100;
  sonde.remove();
  const etat = { rem, spacingPx, densite: Math.round((spacingPx / 4) * 1000) / 1000, polices: document.fonts.status, chemin: location.pathname };
  if (!racineSel) Object.assign(etat, { largeur: innerWidth, hauteur: innerHeight, echelle: Math.round((visualViewport?.scale ?? 1) * 1000) / 1000 });
  if (racineSel) {
    const racine = document.querySelector(racineSel);
    if (!racine) return { ...etat, erreur: 'cadre de maquette introuvable (' + racineSel + ')' };
    const r = racine.getBoundingClientRect();
    const q = new URLSearchParams(location.search);
    Object.assign(etat, { largeur: r.width, hauteur: r.height, echelle: racine.offsetWidth ? Math.round((r.width / racine.offsetWidth) * 1000) / 1000 : 0, ecranObtenu: [q.get('p'), q.get('a'), q.get('e')].join('/') });
  }
  return etat;
}`;

/**
 * Les liens VISIBLES de la NAVIGATION de la coque (`nav` : barre d'onglets au téléphone, barre
 * latérale au bureau ; chemin seul), pour prouver la disposition rendue : un compte « locataire »
 * sans bail rend le menu d'un client, et le relevé doit le refuser. Le contenu de la page n'en est
 * pas : le tableau de bord d'un locataire peut lier vers ses favoris.
 */
export const LIENS_VISIBLES = String.raw`(() => {
  const vus = new Set();
  for (const a of document.querySelectorAll('nav a[href]')) {
    const r = a.getBoundingClientRect();
    const s = getComputedStyle(a);
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth || s.visibility === 'hidden') continue;
    try { vus.add(new URL(a.href, location.href).pathname); } catch {}
  }
  return [...vus].sort();
})()`;

/** Une maquette bureau sans version bureau : la visionneuse rend un panneau d'excuse à la place. */
export const SANS_BUREAU = String.raw`(() => {
  const d = document.querySelector('.maquettes-cadre .maquette-defile');
  const c = d && d.children.length === 1 ? d.firstElementChild : null;
  if (!c || !String(c.className).includes('h-[900px]') || c.children.length !== 1 || c.firstElementChild.tagName !== 'P') return null;
  return c.innerText.trim();
})()`;

/** Le défilement d'une tranche : le plus grand défileur (conteneur intérieur ou document), décalé de `dy`. */
export const DEFILER = String.raw`(racineSel, dy) => {
  const racine = racineSel ? document.querySelector(racineSel) : document.documentElement;
  let cible = document.scrollingElement, gain = cible.scrollHeight - cible.clientHeight;
  for (const el of racine.querySelectorAll('*')) { const s = getComputedStyle(el); if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight - el.clientHeight > gain) { cible = el; gain = el.scrollHeight - el.clientHeight; } }
  cible.scrollTop = dy;
  return { conteneur: cible === document.scrollingElement ? 'document' : cible.tagName.toLowerCase(), demande: dy, obtenu: Math.round(cible.scrollTop), max: Math.round(gain) };
}`;

/** Déterminisme : ni animation, ni transition, ni curseur ; l'indicateur de Next et les outils de dev masqués. */
export const FEUILLE_DETERMINISME =
  '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition:none!important;caret-color:transparent!important}nextjs-portal,.tsqd-parent-container{display:none!important}';

export const injecterFeuille = (css) =>
  `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})`;

/**
 * Le balayage de dégradation d'une largeur (plan d'implémentation, § Protocole, étape 2) : débord du
 * défileur, éléments qui dépassent la fenêtre hors conteneur qui défile, textes en ellipse (permis
 * pour un texte secondaire) et textes COUPÉS NET par un ancêtre `overflow: hidden|clip` (jamais).
 */
export const BALAYAGE = String.raw`(racineSel) => {
  const W = innerWidth;
  const racine = racineSel ? document.querySelector(racineSel) : document.scrollingElement;
  if (!racine) return { erreur: 'pas de défileur' };
  const debord = racine.scrollWidth - racine.clientWidth;
  const stop = racineSel ? racine : null;
  const defile = (el) => { for (let p = el.parentElement; p && p !== stop; p = p.parentElement) { if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true; } return false; };
  let depasse = 0, pire = 0, exemple = '';
  const ellipses = [];
  for (const el of racine.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden') continue;
    if (r.right > W + 1 && !defile(el)) { depasse++; if (r.right - W > pire) { pire = Math.round(r.right - W); exemple = (el.innerText || el.tagName).trim().slice(0, 40); } }
    if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) ellipses.push((el.innerText || '').trim().slice(0, 50));
  }
  const coupes = [];
  for (const el of racine.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || (s.position === 'absolute' && s.clip !== 'auto')) continue;
    for (let p = el.parentElement; p && p !== stop; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (/(auto|scroll)/.test(ps.overflowX)) break;
      if (/(hidden|clip)/.test(ps.overflowX)) {
        if (ps.textOverflow === 'ellipsis') break;
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 2 && (el.innerText || '').trim() && el.children.length === 0) coupes.push(Math.round(r.right - pr.right) + 'px ' + (el.innerText || '').trim().slice(0, 40));
        break;
      }
    }
  }
  return { debord, depasse, pire, exemple, ellipses, coupes };
}`;

/**
 * La page a-t-elle fini de charger ses DONNÉES ? Aucun squelette (`data-slot="skeleton"`), aucun
 * `aria-busy`, aucun « Chargement… » visibles. Mesuré le 2026-11-11 sous charge : 2,5 s après
 * `load`, `/app/notifications` rendait encore « Chargement… », et deux relevés du bureau
 * différaient par un compteur de la barre latérale arrivé entre les deux.
 */
export const CHARGE = String.raw`(() => {
  const vu = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden'; };
  if ([...document.querySelectorAll('[data-slot="skeleton"], [aria-busy="true"]')].some(vu)) return false;
  const marche = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = marche.nextNode(); n; n = marche.nextNode()) if (/^\s*Chargement…?\s*$/.test(n.textContent) && n.parentElement && vu(n.parentElement)) return false;
  return true;
})()`;
