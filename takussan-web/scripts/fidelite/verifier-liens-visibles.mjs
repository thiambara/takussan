/**
 * Auto-vérification de LIENS_VISIBLES (`inventaire.mjs`) sur des cas ÉPROUVÉS :
 * `fixtures/liens-visibles.html`, chaque lien marqué `data-attendu="visible|cache"`.
 *
 * Pourquoi : jusqu'au 2026-11-13, un lien comptait dès que SA boîte avait une taille et tombait dans
 * la fenêtre. Le panneau « Plus » replié de la barre latérale reste monté à hauteur 0 sous un
 * `overflow: hidden` : ses liens gardaient leur boîte, et le relevé du client au bureau était REFUSÉ
 * (« lien visible vers /app/payments, qui n'en fait pas partie ») — un faux positif (TCK-2625, a-5).
 *
 * Usage : node scripts/fidelite/verifier-liens-visibles.mjs — sort en 1 sur tout écart, en nommant le
 * cas. Un Chrome jetable (un créneau de `navigateur.mjs`), une page locale, aucune donnée.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LIENS_VISIBLES } from './inventaire.mjs';
import { dormir, evaluer, ouvrirChrome } from './navigateur.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'liens-visibles.html');

const { cdp, ecouteurs, fermer } = await ouvrirChrome({ delaiMs: 60_000 });
let echecs = 0;
try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  let charge = false;
  ecouteurs.push((m) => m.method === 'Page.loadEventFired' && (charge = true));
  await cdp('Page.navigate', { url: pathToFileURL(FIXTURE).href });
  for (const t = Date.now(); !charge && Date.now() - t < 20_000; ) await dormir(100);
  // Les liens d'une page file:// se résolvent en file:///cas/… : `pathname` rend /cas/…, comme sur l'app.
  const vus = await evaluer(cdp, LIENS_VISIBLES);
  const cas = await evaluer(cdp, `[...document.querySelectorAll('a[data-attendu]')].map((a) => ({ chemin: new URL(a.href).pathname, attendu: a.dataset.attendu }))`);
  if (cas.length < 12) {
    echecs++;
    console.log(`ÉCART : ${cas.length} cas lus dans la fixture (12 attendus)`);
  }
  for (const c of cas) {
    const compte = vus.includes(c.chemin);
    const ok = compte === (c.attendu === 'visible');
    if (!ok) echecs++;
    console.log(`${ok ? 'ok   ' : 'ÉCART'} ${c.attendu.padEnd(7)} ${compte ? 'compté    ' : 'non compté'} — ${c.chemin}`);
  }
} finally {
  fermer();
}
console.log(echecs ? `échec — ${echecs} écart(s)` : 'ok — LIENS_VISIBLES compte les liens visibles de nav, et eux seuls');
process.exit(echecs ? 1 : 0);
