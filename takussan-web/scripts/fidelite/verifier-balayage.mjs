/**
 * Auto-vérification du détecteur d'ellipses de BALAYAGE (`inventaire.mjs`) sur un cas ÉPROUVÉ :
 * `fixtures/balayage-ellipses.html`, chaque élément marqué `data-attendu="ellipse|entier"`.
 *
 * Pourquoi : jusqu'au 2026-11-13, le détecteur ne connaissait que l'ellipse d'une ligne
 * (`text-overflow: ellipsis` et débord en largeur). Un `line-clamp-N` garde `text-overflow: clip` et
 * déborde en HAUTEUR : un titre coupé à la 3e ligne passait pour entier au balayage.
 *
 * Usage : node scripts/fidelite/verifier-balayage.mjs — sort en 1 sur tout écart, en nommant le cas.
 * Un Chrome jetable (un créneau de `navigateur.mjs`), une page locale, aucune donnée.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BALAYAGE } from './inventaire.mjs';
import { dormir, evaluer, ouvrirChrome } from './navigateur.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'balayage-ellipses.html');

const { cdp, ecouteurs, fermer } = await ouvrirChrome({ delaiMs: 60_000 });
let echecs = 0;
try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: true });
  let charge = false;
  ecouteurs.push((m) => m.method === 'Page.loadEventFired' && (charge = true));
  await cdp('Page.navigate', { url: pathToFileURL(FIXTURE).href });
  for (const t = Date.now(); !charge && Date.now() - t < 20_000; ) await dormir(100);
  const r = await evaluer(cdp, `(${BALAYAGE})(null)`);
  const cas = await evaluer(cdp, `[...document.querySelectorAll('[data-attendu]')].map((el) => ({ debut: el.innerText.trim().slice(0, 50), attendu: el.dataset.attendu }))`);
  for (const c of cas) {
    const signale = r.ellipses.includes(c.debut);
    const ok = signale === (c.attendu === 'ellipse');
    if (!ok) echecs++;
    console.log(`${ok ? 'ok   ' : 'ÉCART'} ${c.attendu.padEnd(7)} ${signale ? 'signalé ' : 'non signalé'} — ${c.debut.split(' ')[0]}`);
  }
  if (r.debord !== 0 || r.coupes.length) {
    echecs++;
    console.log(`ÉCART débord ${r.debord}, coupes ${JSON.stringify(r.coupes)} (attendus : 0, [])`);
  }
} finally {
  fermer();
}
console.log(echecs ? `échec — ${echecs} écart(s)` : 'ok — le détecteur signale les deux ellipses et elles seules');
process.exit(echecs ? 1 : 0);
