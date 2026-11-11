/**
 * Fidélité au pixel (TCK-2684) — les images d'une comparaison : différence, superposition,
 * côte-à-côte, rideau. `sharp` est une devDependency explicite (il n'arrivait que par `next`).
 *
 * Le diff est maison : un pixel est « différent » quand la somme de ses écarts RVB dépasse 40 —
 * sous ce seuil, l'anticrénelage (annexe D, § 2 et § 6.3). Les pixels ne se lisent que sur les zones
 * à contenu identique (coque, tête de page, barre de filtres) : sur l'écran entier, les données
 * différentes de la maquette et de la base de démo les rendent illisibles (annexe D, § 3).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

export const SEUIL_RVB = 40;

export async function comparerImages(fichierMaquette, fichierProduit, dossier, zones, dpr = 2) {
  const ma = await sharp(fichierMaquette).metadata();
  const mb = await sharp(fichierProduit).metadata();
  if (ma.width !== mb.width || ma.height !== mb.height) throw new Error(`images de tailles différentes : ${ma.width}×${ma.height} / ${mb.width}×${mb.height}`);
  const { width: L, height: H } = ma;
  const ra = await sharp(fichierMaquette).ensureAlpha().raw().toBuffer();
  const rb = await sharp(fichierProduit).ensureAlpha().raw().toBuffer();
  const diff = Buffer.alloc(L * H * 4);
  const different = new Uint8Array(L * H);
  let n = 0;
  for (let i = 0, k = 0; i < L * H * 4; i += 4, k++) {
    const d = Math.abs(ra[i] - rb[i]) + Math.abs(ra[i + 1] - rb[i + 1]) + Math.abs(ra[i + 2] - rb[i + 2]);
    if (d > SEUIL_RVB) {
      n++;
      different[k] = 1;
      diff.set([230, 30, 60, 255], i);
    } else {
      const gris = Math.round((rb[i] + rb[i + 1] + rb[i + 2]) / 3);
      const pale = 255 - Math.round((255 - gris) * 0.25);
      diff.set([pale, pale, pale, 255], i);
    }
  }
  const pDiff = await sharp(diff, { raw: { width: L, height: H, channels: 4 } }).png().toBuffer();
  writeFileSync(join(dossier, 'difference.png'), pDiff);

  const moitie = Buffer.from(rb);
  for (let i = 3; i < moitie.length; i += 4) moitie[i] = 128;
  await sharp(fichierMaquette)
    .composite([{ input: moitie, raw: { width: L, height: H, channels: 4 }, blend: 'over' }])
    .png()
    .toFile(join(dossier, 'superposition.png'));

  const G = 24;
  await sharp({ create: { width: L * 3 + G * 2, height: H, channels: 4, background: '#1f1b16' } })
    .composite([
      { input: fichierMaquette, left: 0, top: 0 },
      { input: fichierProduit, left: L + G, top: 0 },
      { input: pDiff, left: 2 * (L + G), top: 0 },
    ])
    .png()
    .toFile(join(dossier, 'cote-a-cote.png'));

  const parZone = zones.map((z) => {
    let tot = 0;
    let dz = 0;
    for (let y = Math.max(0, Math.round(z.y * dpr)); y < Math.min(H, Math.round((z.y + z.h) * dpr)); y++)
      for (let x = Math.max(0, Math.round(z.x * dpr)); x < Math.min(L, Math.round((z.x + z.w) * dpr)); x++) {
        tot++;
        dz += different[y * L + x];
      }
    return { zone: z.nom, part: tot ? +((100 * dz) / tot).toFixed(2) : null };
  });
  return { partTotale: +((100 * n) / (L * H)).toFixed(2), parZone };
}

/** Une page locale pour l'œil du porteur : rideau glissant + opacité, aux px CSS. */
export function rideau(W, H, titre) {
  return `<!doctype html><meta charset="utf-8"><title>Rideau — ${titre.replace(/</g, '&lt;')}</title>
<style>body{margin:0;background:#1f1b16;color:#fcf9f3;font:14px system-ui}header{display:flex;flex-wrap:wrap;gap:16px;align-items:center;padding:10px 16px}
.s{position:relative;width:${W}px;height:${H}px;margin:0 16px}.s img{position:absolute;inset:0;width:100%;height:100%}
#p{clip-path:inset(0 0 0 50%)}#l{position:absolute;top:0;bottom:0;left:50%;width:1px;background:#e11d48}</style>
<header><strong>${titre.replace(/</g, '&lt;')}</strong><label>Rideau <input id="r" type="range" min="0" max="100" value="50"></label>
<label>Opacité du produit <input id="o" type="range" min="0" max="100" value="100"></label><span>gauche : maquette · droite : produit</span></header>
<div class="s"><img src="maquette.png" alt="maquette"><img id="p" src="produit.png" alt="produit"><div id="l"></div></div>
<script>r.oninput=()=>{p.style.clipPath='inset(0 0 0 '+r.value+'%)';l.style.left=r.value+'%'};o.oninput=()=>p.style.opacity=o.value/100</script>`;
}
