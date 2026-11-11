/**
 * Fidélité au pixel (TCK-2684) — un Chrome headless JETABLE, piloté par CDP (WebSocket natif de
 * Node ≥ 22 : aucune dépendance).
 *
 * Deux relevés au plus à la fois sur la machine (le plafond de `capture.mjs` de l'audit : le
 * 2026-11-10, dix agents en parallèle ont porté la charge à 490 et fait tomber Turbopack). Un
 * créneau est un dossier créé atomiquement sous le dossier temporaire du système — partagé par
 * l'arbre principal et les worktrees ; un créneau laissé par un processus mort depuis plus de
 * 3 minutes est repris.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.FIDELITE_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CRENEAUX = join(tmpdir(), 'takussan-fidelite-creneaux');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

const aLaSortie = [];
let sortieBranchee = false;
function brancherSortie() {
  if (sortieBranchee) return;
  sortieBranchee = true;
  process.on('exit', () => aLaSortie.splice(0).forEach((f) => f()));
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGALRM']) process.on(sig, () => process.exit(5));
}

async function prendreCreneau() {
  mkdirSync(CRENEAUX, { recursive: true });
  for (let essai = 0; essai < 480; essai++) {
    for (const n of [1, 2]) {
      const d = join(CRENEAUX, `creneau-${n}`);
      try {
        mkdirSync(d);
        return () => rmSync(d, { recursive: true, force: true });
      } catch {
        try {
          if (Date.now() - statSync(d).mtimeMs > 180_000) rmSync(d, { recursive: true, force: true });
        } catch {
          // créneau rendu entre-temps : on réessaie
        }
      }
    }
    await dormir(500);
  }
  throw new Error('machine occupée : deux relevés en cours depuis 4 min — réessayez dans une minute');
}

/**
 * Ouvre un Chrome jetable et rend `{ cdp, ecouteurs, fermer }`. `cdp(méthode, params, sessionId?)`
 * envoie une commande ; `ecouteurs` reçoit tous les événements. Le délai global (`delaiMs`) coupe
 * le processus avec un message, plutôt qu'un relevé qui pend.
 */
export async function ouvrirChrome({ delaiMs = 150_000 } = {}) {
  brancherSortie();
  const rendreCreneau = await prendreCreneau();
  const profil = mkdtempSync(join(tmpdir(), 'fidelite-chrome-'));
  const chrome = spawn(
    CHROME,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--font-render-hinting=none', '--remote-debugging-port=0', `--user-data-dir=${profil}`, 'about:blank'],
    { stdio: 'ignore' },
  );
  let minuterie;
  const fermer = () => {
    clearTimeout(minuterie);
    try {
      chrome.kill('SIGKILL');
    } catch {
      // déjà fermé
    }
    try {
      // Chrome tué écrit encore quelques fichiers : on réessaie, et un profil qui résiste reste dans
      // le dossier temporaire du système plutôt que de faire échouer un relevé réussi.
      rmSync(profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // abandonné au nettoyage du système
    }
    rendreCreneau();
  };
  aLaSortie.push(fermer);
  // Le délai vaut pour CE navigateur : `geler` en ouvre des dizaines dans le même processus.
  minuterie = setTimeout(() => {
    console.error(`échec — délai global d'un relevé dépassé (${delaiMs / 1000} s)`);
    process.exit(3);
  }, delaiMs);
  minuterie.unref();

  let port;
  for (let i = 0; i < 150 && !port; i++) {
    const f = join(profil, 'DevToolsActivePort');
    if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0];
    if (!port) await dormir(100);
  }
  if (!port) throw new Error('Chrome ne publie pas son port de débogage');
  let cible;
  for (let i = 0; i < 50 && !cible; i++) {
    cible = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    if (!cible) await dormir(100);
  }
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
  let id = 0;
  const attentes = new Map();
  const ecouteurs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && attentes.has(m.id)) {
      const a = attentes.get(m.id);
      attentes.delete(m.id);
      if (m.error) a.rej(new Error(`${a.method} : ${JSON.stringify(m.error)}`));
      else a.res(m.result);
    } else if (m.method) ecouteurs.forEach((f) => f(m));
  };
  const cdp = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      attentes.set(n, { res, rej, method });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return { cdp, ecouteurs, fermer };
}

/** Évalue une expression (promesse attendue) dans la page, ou dans un contexte d'exécution donné. */
export async function evaluer(cdp, expression, contextId) {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

export { dormir };
