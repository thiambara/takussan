#!/usr/bin/env node
/**
 * Fidélité au pixel (TCK-2684, ADR-0106, annexe D) — l'écran réel de `/app` est-il la maquette retenue ?
 *
 *   node scripts/fidelite/fidelite.mjs <commande> [options]      (depuis takussan-web/)
 *
 *   releve   relève un écran : styles calculés de chaque nœud (texte, boîte, icône) + capture
 *            --maquette <page> --a <approche> --e <écran>          une maquette (visionneuse, `?cadre=1`)
 *            --url /app/… --persona <nom>                           ou une page du produit, connectée
 *            --device mobile|desktop  [--largeur 1440|1280|1024]    390×844 · 1440×900 · 1280×900 · 1024×900, DPR 2
 *            [--persona aucune]              une page publique, sans compte ni preuve de disposition
 *            [--police-navigateur 20]        taille de police du navigateur (profil), pas le zoom
 *            --out <préfixe>                                        écrit <préfixe>.json et <préfixe>.png
 *            [--base http://localhost:3100]  le front qui sert le PRODUIT (un worktree) ; défaut :3000
 *            [--base-maquettes <url>]        le front qui sert les maquettes (arbre principal) ; défaut :3000
 *            [--defiler <px>] [--perturber <script>] [--bloquer <motifs d'URL>] [--rem 14.4] [--attente <ms>] [--sans-attente-donnees]
 *            [--disposition <persona de coque>]  exige cette disposition (défaut : celle du compte)
 *            [--via visionneuse [--fenetre 1800x1300]]  relève DANS l'iframe de la visionneuse
 *   compare  maquette (référence gelée ou relevé) contre produit
 *            --maquette <réf.json|préfixe> --produit <préfixe> --out <dossier> [--roles <fiche.json>]
 *            [--image-maquette <png>]   sinon à côté du JSON, ou sous .fidelite/references/
 *   geler    gèle les références des pages retenues (docs/qa/audit-ux-2026-11/fidelite/references/)
 *            --page <page> | --toutes   [--appareils telephone,bureau-1440,bureau-1280] [--force]
 *            [--budget <s>]  s'arrête proprement avant ce délai (défaut 480 : une commande < 9 min)
 *            [--sans-attente-donnees]  relève sans attendre la fin d'un chargement (comme `releve`)
 *            Un écran de maquette qui charge encore après 15 s est un état DESSINÉ : relevé tel quel,
 *            `meta.chargementDessine`, et `"etat": "chargement"` dans gel.json.
 *   journal  régénère references/JOURNAL.md depuis les références présentes
 *   jetons   frappe les jetons des personas (hors du dépôt, 0600) [--renouveler]
 *   balayer  débord, coupe nette, ellipse, à plusieurs largeurs
 *            (--maquette … --a … [--e …] | --url … --persona …) [--largeurs 390,768,1024,1280,1440]
 *
 * Les jetons ne sont JAMAIS imprimés, ni écrits dans un relevé, un rapport ou une URL : ils vivent
 * dans `~/.takussan-fidelite/jetons.json` (0600) ou `$FIDELITE_JETONS`. Mode d'emploi complet :
 * docs/qa/audit-ux-2026-11/fidelite/README.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { comparerReleves, extraireLibelles, fusionnerRoles, ligneResumee, motifsDeDisposition, motifsDeRejet, rapportMarkdown } from './comparer.mjs';
import { BALAYAGE, CHARGE, DEFILER, ETAT, FEUILLE_DETERMINISME, INVENTAIRE, LIENS_VISIBLES, SANS_BUREAU, injecterFeuille } from './inventaire.mjs';
import { dormir, evaluer, ouvrirChrome } from './navigateur.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(ICI, '../..');
const RACINE = resolve(WEB, '..');
const REFERENCES = join(RACINE, 'docs/qa/audit-ux-2026-11/fidelite/references');
const IMAGES_REFERENCES = join(WEB, '.fidelite/references');
const PERSONAS = JSON.parse(readFileSync(join(ICI, 'personas.json'), 'utf8'));
const FICHIER_JETONS = process.env.FIDELITE_JETONS ?? join(homedir(), '.takussan-fidelite', 'jetons.json');
const DPR = 2;
const BASE_MAQUETTES = (process.env.FIDELITE_BASE_MAQUETTES ?? 'http://localhost:3000').replace(/\/$/, '');

const [commande, ...args] = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const drapeau = (n) => args.includes(`--${n}`);

/* ───────────────────────────── appareils ───────────────────────────── */

/**
 * `mobile`/`telephone` → 390×844 ; `desktop`/`bureau` → 1440×900, ou 1280×900 / 1024×900 avec
 * `--largeur` (1024 : la première largeur du bureau, `lg` — TCK-2692 compare avant/après à 1024).
 */
export function appareilDe(device, largeur) {
  if (device === 'mobile' || device === 'telephone') return { appareil: 'telephone', W: 390, H: 844, mobile: true };
  if (device === 'desktop' || device === 'bureau' || device?.startsWith('bureau-')) {
    const W = Number(largeur ?? (device.startsWith('bureau-') ? device.slice(7) : 1440));
    if (![1440, 1280, 1024].includes(W)) throw new Error(`largeur de bureau ${W} : 1440, 1280 ou 1024`);
    return { appareil: `bureau-${W}`, W, H: 900, mobile: false };
  }
  throw new Error(`appareil inconnu « ${device} » : mobile | desktop`);
}

/**
 * Ce que le relevé doit mesurer de lui-même, sinon il échoue (ADR-0106 § 1, ADR-0107) :
 * téléphone rem 16 et densité 1 ; bureau densité ×0,9 — rem 14,4 tant que TCK-2692 n'est pas
 * fusionné, 16 ensuite, au même rendu. `--rem 14.4` relève ce que le porteur a vu (mémoire seule).
 * `police` : la taille de police du navigateur (16 par défaut) — tout se lit à proportion.
 */
export function attendus(app, rem144, police = 16) {
  if (rem144) return { W: app.W, H: app.H, rem: [14.4], spacingPx: 3.6 };
  const p = Number(police);
  const arrondi = (x) => Math.round(x * 1000) / 1000;
  return app.mobile ? { W: app.W, H: app.H, rem: [p], spacingPx: arrondi(p / 4) } : { W: app.W, H: app.H, rem: [arrondi(p * 0.9), p], spacingPx: arrondi(p * 0.225) };
}

/* ───────────────────────────── jetons ───────────────────────────── */

function lireJetons() {
  try {
    return JSON.parse(readFileSync(FICHIER_JETONS, 'utf8'));
  } catch {
    return {};
  }
}

/** Frappe les jetons (tous, ou les personas données). N'imprime que des noms. */
function frapperJetons(noms = Object.keys(PERSONAS.comptes)) {
  const api = process.env.FIDELITE_API_DIR ?? join(RACINE, 'takussan-api');
  if (!existsSync(join(api, 'vendor'))) throw new Error(`API introuvable (${api}/vendor) : posez FIDELITE_API_DIR sur un takussan-api installé`);
  mkdirSync(dirname(FICHIER_JETONS), { recursive: true, mode: 0o700 });
  const comptes = Object.fromEntries(noms.map((n) => [n, PERSONAS.comptes[n]?.email]).filter(([, e]) => e));
  const sortie = execFileSync('php', ['artisan', 'tinker', '--execute', `require '${join(ICI, 'jetons.php')}';`], {
    cwd: api,
    env: { ...process.env, FIDELITE_COMPTES: JSON.stringify(comptes), FIDELITE_SORTIE: FICHIER_JETONS },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  }).toString();
  chmodSync(FICHIER_JETONS, 0o600);
  // jetons.php n'écrit que des noms ; on ne relaie que ses lignes connues, par précaution.
  for (const l of sortie.split('\n')) if (/^(jetons frappés|comptes absents)/.test(l)) console.log(l);
}

function jetonDe(persona) {
  if (!PERSONAS.comptes[persona]) throw new Error(`persona inconnue « ${persona} » (${Object.keys(PERSONAS.comptes).join(', ')})`);
  if (!lireJetons()[persona]?.token) frapperJetons([persona]);
  const j = lireJetons()[persona]?.token;
  if (!j) throw new Error(`aucun jeton pour « ${persona} » : le compte ${PERSONAS.comptes[persona].email} existe-t-il dans la base ?`);
  return j;
}

/* ───────────────────────────── relevé ───────────────────────────── */

function commitCourant() {
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: RACINE, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Un relevé. Rend `{ releve, png }` ; LÈVE (sans rien écrire) si l'écran n'est pas celui demandé, à
 * la bonne taille, à l'échelle 1, au bon rem et à la bonne densité, polices chargées, non vide.
 */
export async function relever(o) {
  const app = appareilDe(o.device, o.largeur);
  const attendu = attendus(app, o.rem === '14.4', o.policeNavigateur ?? 16);
  const t0 = Date.now();
  const { cdp, ecouteurs, fermer } = await ouvrirChrome({ policeNavigateur: o.policeNavigateur });
  try {
    const reseau = new Set();
    const enVol = new Set();
    let dernierMouvement = Date.now();
    let statut = null;
    ecouteurs.push((m) => {
      if (m.method === 'Network.requestWillBeSent') enVol.add(m.params.requestId);
      if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') enVol.delete(m.params.requestId);
      if (m.method.startsWith('Network.')) dernierMouvement = Date.now();
      if (m.method === 'Network.requestWillBeSent' && /\/api\//.test(m.params.request.url)) reseau.add(`${m.params.request.method} ${new URL(m.params.request.url).pathname}`);
      if (m.method === 'Network.responseReceived' && m.params.type === 'Document' && statut === null) statut = m.params.response.status;
    });
    await cdp('Page.enable');
    await cdp('Network.enable');
    // `--bloquer` : des URL que la page ne doit pas atteindre pendant le relevé — un relevé ne
    // DOIT pas écrire en base (ouvrir un fil le marque lu : `PUT /api/conversations/{id}/read`,
    // TCK-2632). Motifs de `Network.setBlockedURLs`, séparés par des virgules ; le relevé les porte.
    const bloquees = o.bloquer ? o.bloquer.split(',').map((m) => m.trim()).filter(Boolean) : [];
    if (bloquees.length) await cdp('Network.setBlockedURLs', { urls: bloquees });
    await cdp('Runtime.enable');
    await cdp('Emulation.setLocaleOverride', { locale: 'fr-FR' });
    await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Africa/Dakar' });
    await cdp('Page.addScriptToEvaluateOnNewDocument', { source: injecterFeuille(FEUILLE_DETERMINISME) });
    if (o.rem === '14.4') await cdp('Page.addScriptToEvaluateOnNewDocument', { source: injecterFeuille('html{font-size:90%!important}') });

    const visionneuse = o.maquette && o.via === 'visionneuse';
    if (visionneuse) {
      const [fw, fh] = (o.fenetre ?? (app.mobile ? '1800x1300' : `${app.W + 1000}x1400`)).split('x').map(Number);
      await cdp('Emulation.setDeviceMetricsOverride', { width: fw, height: fh, deviceScaleFactor: DPR, mobile: false });
    } else {
      await cdp('Emulation.setDeviceMetricsOverride', { width: app.W, height: app.H, deviceScaleFactor: DPR, mobile: app.mobile });
    }
    if (app.mobile) {
      // `hover: none` / `pointer: coarse` DES DEUX CÔTÉS (le produit a une variante `tactile:`).
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
    }

    let url;
    let source;
    let racine = null;
    let chemin = null;
    const baseProduit = (o.base ?? 'http://localhost:3000').replace(/\/$/, '');
    const baseMaquettes = (o.baseMaquettes ?? BASE_MAQUETTES).replace(/\/$/, '');
    if (o.maquette) {
      const e = String(o.e ?? 0);
      const q = new URLSearchParams({ p: o.maquette, a: o.a ?? 'a', e, v: app.mobile ? 'telephone' : 'bureau' });
      if (visionneuse) q.set('l', String(app.W));
      else q.set('cadre', '1');
      url = `${baseMaquettes}/fr/playground/maquettes?${q}`;
      source = { type: 'maquette', page: o.maquette, approche: o.a ?? 'a', ecran: Number(e), ...(o.nom ? { nom: o.nom } : {}) };
      racine = '.maquettes-cadre';
      await cdp('Network.setCookie', { name: 'NEXT_LOCALE', value: 'fr', url: baseMaquettes, path: '/' });
    } else {
      if (!o.url?.startsWith('/')) throw new Error('--url /app/… requis (chemin seul, sans /fr : la console n’est pas localisée)');
      const persona = o.persona ?? 'admin';
      await cdp('Network.setCookie', { name: 'NEXT_LOCALE', value: 'fr', url: baseProduit, path: '/' });
      // `--persona aucune` : une page publique, visitée sans compte (TCK-2692).
      if (persona !== 'aucune') await cdp('Network.setCookie', { name: 'auth_token', value: jetonDe(persona), url: baseProduit, httpOnly: true, path: '/' });
      url = `${baseProduit}${o.url}`;
      chemin = new URL(url).pathname;
      source = { type: 'produit', url: o.url, persona };
    }

    let charge = false;
    ecouteurs.push((m) => m.method === 'Page.loadEventFired' && (charge = true));
    await cdp('Page.navigate', { url });
    for (const t = Date.now(); !charge && Date.now() - t < 90_000; ) await dormir(150);
    if (!charge) throw new Error(`la page ne finit pas de charger : ${o.maquette ? url : o.url}`);

    // Le contexte d'évaluation : la page, ou le document de l'iframe de la visionneuse.
    let contexte;
    let clipOrigine = { x: 0, y: 0 };
    const attendre = async (expr, ms = 30_000) => {
      for (const t = Date.now(); Date.now() - t < ms; ) {
        if (await evaluer(cdp, expr, contexte).catch(() => false)) return true;
        await dormir(150);
      }
      return false;
    };
    if (visionneuse) {
      const voulu = { p: o.maquette, a: o.a ?? 'a', e: String(o.e ?? 0) };
      const cadreDeVisionneuse = `(() => { const f = [...document.querySelectorAll('iframe')].find((i) => { try { const q = new URLSearchParams(i.contentWindow.location.search); return q.get('p') === ${JSON.stringify(voulu.p)} && q.get('a') === ${JSON.stringify(voulu.a)} && q.get('e') === ${JSON.stringify(voulu.e)} && i.contentDocument.querySelector('.maquettes-cadre > :not(style)'); } catch { return false; } }); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.left, y: r.top, echelle: Math.round((r.width / f.offsetWidth) * 1000) / 1000, src: f.contentWindow.location.href }; })()`;
      if (!(await attendre(cadreDeVisionneuse))) throw new Error(`aucune iframe de la visionneuse ne rend ${voulu.p}/${voulu.a}/${voulu.e}`);
      const f = await evaluer(cdp, cadreDeVisionneuse);
      if (f.echelle !== 1) throw new Error(`relevé refusé — cadre de la visionneuse à l'échelle ${f.echelle} (attendu 1) : agrandissez --fenetre`);
      const { frameTree } = await cdp('Page.getFrameTree');
      const enfants = (frameTree.childFrames ?? []).map((c) => c.frame);
      const cible = enfants.find((fr) => fr.url === f.src) ?? enfants.find((fr) => fr.url.includes(`p=${voulu.p}`));
      if (!cible) throw new Error('iframe de la visionneuse introuvable dans l’arbre des cadres');
      contexte = (await cdp('Page.createIsolatedWorld', { frameId: cible.id, worldName: 'fidelite' })).executionContextId;
      clipOrigine = { x: f.x, y: f.y };
    } else if (o.maquette) {
      if (!(await attendre(`!!document.querySelector('.maquettes-cadre > :not(style)')`))) throw new Error('le cadre de la maquette ne se monte pas');
    }
    await evaluer(cdp, 'document.fonts.ready.then(() => document.fonts.status)', contexte);
    // Réseau calme (aucune requête en vol depuis 1 s), puis plus de squelette ni de « Chargement… ».
    for (const t = Date.now(); Date.now() - t < 45_000 && (enVol.size > 0 || Date.now() - dernierMouvement < 1000); ) await dormir(100);
    // Une page du PRODUIT qui charge encore n'est pas l'écran demandé : refus. Une MAQUETTE n'a pas
    // de données à attendre — un état de chargement qui dure y est DESSINÉ (écran « Chargement » d'une
    // maquette) : il est relevé tel quel, et le relevé le dit (`meta.chargementDessine`). L'attente
    // courte couvre le rendu de la visionneuse elle-même.
    let chargementDessine = false;
    if (!o.sansAttenteDonnees && !(await attendre(CHARGE, o.maquette ? 15_000 : 45_000))) {
      if (!o.maquette) throw new Error('relevé refusé — la page charge encore après 45 s (squelette, aria-busy ou « Chargement… » visibles) ; --sans-attente-donnees pour relever cet état');
      chargementDessine = true;
    }
    await dormir(Number(o.attente ?? 1500));

    const etat = await evaluer(cdp, `(${ETAT})(${JSON.stringify(racine)})`, contexte);
    etat.statut = statut;
    const motifs = motifsDeRejet(etat, { ...attendu, chemin, ecran: o.maquette ? `${o.maquette}/${o.a ?? 'a'}/${o.e ?? 0}` : undefined });
    if (!o.maquette && source.persona !== 'aucune') {
      const nom = o.disposition ?? PERSONAS.comptes[source.persona]?.disposition;
      const liens = await evaluer(cdp, LIENS_VISIBLES);
      motifs.push(...motifsDeDisposition(liens, PERSONAS.dispositions[nom], nom));
    }
    if (motifs.length) throw new Error(`relevé refusé — ${motifs.join(' ; ')}`);

    if (racine) await evaluer(cdp, `document.querySelector('${racine}').setAttribute('data-fid-ecran', '')`, contexte);
    let defilement = null;
    if (o.defiler) {
      defilement = await evaluer(cdp, `(${DEFILER})(${JSON.stringify(racine)}, ${Number(o.defiler)})`, contexte);
      await dormir(500);
    }
    let perturbation = null;
    if (o.perturber) perturbation = await evaluer(cdp, `(async () => { ${readFileSync(o.perturber, 'utf8')} })()`, contexte);
    await dormir(200);

    const noeuds = await evaluer(cdp, `(${INVENTAIRE})(${JSON.stringify(racine)}, ${app.W}, ${app.H})`, contexte);
    const vide = motifsDeRejet({ noeuds: noeuds.length }, { W: app.W, H: app.H });
    if (vide.length) throw new Error(`relevé refusé — ${vide.join(' ; ')}`);
    const shot = await cdp('Page.captureScreenshot', { format: 'png', clip: { ...clipOrigine, width: app.W, height: app.H, scale: 1 } });
    const releve = {
      meta: { outil: 'takussan-web/scripts/fidelite', version: 1, date: new Date().toISOString(), duree_ms: Date.now() - t0, commit: commitCourant(), base: o.maquette ? baseMaquettes : baseProduit, via: visionneuse ? 'visionneuse' : 'cadre', reseau: [...reseau].sort(), ...(bloquees.length ? { bloquees } : {}), ...(chargementDessine ? { chargementDessine: true } : {}) },
      source,
      ...(o.policeNavigateur ? { policeNavigateur: Number(o.policeNavigateur) } : {}),
      appareil: app.appareil,
      W: app.W,
      H: app.H,
      DPR,
      rem: etat.rem,
      spacingPx: etat.spacingPx,
      densite: etat.densite,
      ...(defilement ? { defilement } : {}),
      ...(perturbation ? { perturbation } : {}),
      noeuds,
    };
    return { releve, png: Buffer.from(shot.data, 'base64'), etat };
  } finally {
    fermer();
  }
}

/** JSON stable et lisible dans un diff : un nœud par ligne. */
export function serialiser(releve) {
  const { noeuds, ...tete } = releve;
  const t = JSON.stringify(tete, null, 1).replace(/\n}$/, '');
  return `${t},\n "noeuds": [\n${noeuds.map((n) => `  ${JSON.stringify(n)}`).join(',\n')}\n ]\n}\n`;
}

async function cmdReleve() {
  const out = opt('out');
  if (!out) throw new Error('--out <préfixe> requis');
  const o = {
    maquette: opt('maquette'),
    a: opt('a'),
    e: opt('e'),
    url: opt('url'),
    persona: opt('persona'),
    device: opt('device', 'mobile'),
    largeur: opt('largeur'),
    base: opt('base'),
    baseMaquettes: opt('base-maquettes'),
    defiler: opt('defiler'),
    perturber: opt('perturber'),
    bloquer: opt('bloquer'),
    rem: opt('rem'),
    attente: opt('attente'),
    disposition: opt('disposition'),
    via: opt('via'),
    fenetre: opt('fenetre'),
    sansAttenteDonnees: drapeau('sans-attente-donnees'),
    policeNavigateur: opt('police-navigateur'),
  };
  let r;
  try {
    r = await relever(o);
  } catch (e) {
    // Un jeton périmé redirige vers la connexion : on le frappe à nouveau, une fois.
    if (!o.maquette && /redirigé vers \/auth/.test(e.message)) {
      frapperJetons([o.persona ?? 'admin']);
      r = await relever(o);
    } else throw e;
  }
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(`${out}.json`, serialiser(r.releve));
  writeFileSync(`${out}.png`, r.png);
  const extra = [r.releve.defilement && `défilement ${JSON.stringify(r.releve.defilement)}`, r.releve.perturbation && `perturbation ${JSON.stringify(r.releve.perturbation)}`].filter(Boolean);
  console.log(`ok ${out}.json · ${r.releve.appareil} ${r.releve.W}×${r.releve.H} · rem ${r.releve.rem} · densité ×${r.releve.densite} · ${r.releve.noeuds.length} nœuds · ${r.releve.meta.duree_ms} ms${extra.length ? `\n${extra.join('\n')}` : ''}`);
}

/* ───────────────────────────── comparaison ───────────────────────────── */

const fichierJson = (p) => (p.endsWith('.json') ? p : `${p}.json`);

function imageDe(json) {
  const voisine = json.replace(/\.json$/, '.png');
  if (existsSync(voisine)) return voisine;
  const rel = relative(REFERENCES, resolve(json));
  if (!rel.startsWith('..')) {
    const gelee = join(IMAGES_REFERENCES, rel.replace(/\.json$/, '.png'));
    if (existsSync(gelee)) return gelee;
  }
  return null;
}

function lireFiche(f) {
  const fiche = JSON.parse(readFileSync(f, 'utf8'));
  return fiche.etend ? fusionnerRoles(lireFiche(resolve(dirname(f), fiche.etend)), fiche) : fiche;
}

async function cmdCompare() {
  const dossier = opt('out');
  if (!dossier || !opt('maquette') || !opt('produit')) throw new Error('--maquette, --produit et --out requis');
  mkdirSync(dossier, { recursive: true });
  const jm = fichierJson(opt('maquette'));
  const jp = fichierJson(opt('produit'));
  const M = JSON.parse(readFileSync(jm, 'utf8'));
  const P = JSON.parse(readFileSync(jp, 'utf8'));
  const coque = JSON.parse(readFileSync(join(ICI, 'roles-coque.json'), 'utf8'));
  const fiche = opt('roles') ? lireFiche(opt('roles')) : {};
  const roles = fiche.coque === false ? fiche : fusionnerRoles(coque, fiche);
  const libelles = extraireLibelles(JSON.parse(readFileSync(join(WEB, 'src/messages/fr.json'), 'utf8')));
  const resultat = comparerReleves(M, P, { roles, libelles });

  const im = opt('image-maquette') ?? imageDe(jm);
  const ip = imageDe(jp);
  let pixels = null;
  if (im && ip) {
    const { comparerImages, rideau } = await import('./images.mjs');
    pixels = await comparerImages(im, ip, dossier, resultat.zones, M.DPR);
    writeFileSync(join(dossier, 'maquette.png'), readFileSync(im));
    writeFileSync(join(dossier, 'produit.png'), readFileSync(ip));
    writeFileSync(join(dossier, 'rideau.html'), rideau(M.W, M.H, `${basename(jm)} ↔ ${basename(jp)}`));
  } else {
    resultat.avertissements.push(`comparaison STRUCTURELLE seule : image ${im ? 'du produit' : 'de la maquette'} absente (les images gelées vivent sous takussan-web/.fidelite/references/, hors de git)`);
  }
  writeFileSync(join(dossier, 'rapport.md'), rapportMarkdown(M, P, resultat, pixels));
  writeFileSync(join(dossier, 'rapport.json'), `${JSON.stringify({ compte: resultat.compte, pixels, avertissements: resultat.avertissements, lignes: resultat.lignes }, null, 1)}\n`);
  for (const a of resultat.avertissements) console.log(`⚠ ${a}`);
  console.log(`ok ${join(dossier, 'rapport.md')} · ${ligneResumee(resultat, pixels)}`);
}

/* ───────────────────────────── gel ───────────────────────────── */

const RETENUES = () => JSON.parse(readFileSync(join(REFERENCES, 'retenues.json'), 'utf8'));

/** Le recensement des écrans PAR LA VISIONNEUSE : la liste « Écrans » qu'elle rend pour l'approche. */
async function recenser(page, approche) {
  const { cdp, ecouteurs, fermer } = await ouvrirChrome();
  try {
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1800, height: 1300, deviceScaleFactor: 1, mobile: false });
    let charge = false;
    ecouteurs.push((m) => m.method === 'Page.loadEventFired' && (charge = true));
    await cdp('Page.navigate', { url: `${BASE_MAQUETTES}/fr/playground/maquettes?p=${page}&a=${approche}&e=0&v=telephone` });
    for (const t = Date.now(); !charge && Date.now() - t < 90_000; ) await dormir(150);
    const lire = `(() => {
      const q = new URLSearchParams(location.search);
      if (q.get('p') !== ${JSON.stringify(page)} || q.get('a') !== ${JSON.stringify(approche)}) return { erreur: 'la visionneuse rend ' + q.get('p') + '/' + q.get('a') };
      const boutons = [...document.querySelectorAll('[aria-label="Écrans"] button')].map((b) => b.innerText.replace(/^\\s*\\d+\\.\\s*/, '').trim());
      if (boutons.length) return { ecrans: boutons };
      const f = document.querySelector('iframe[title]');
      return f ? { ecrans: [f.title.split(' · ').pop()] } : null;
    })()`;
    for (const t = Date.now(); Date.now() - t < 30_000; ) {
      const r = await evaluer(cdp, lire).catch(() => null);
      if (r?.erreur) throw new Error(r.erreur);
      if (r?.ecrans) return r.ecrans;
      await dormir(250);
    }
    throw new Error(`la visionneuse ne liste aucun écran pour ${page}/${approche}`);
  } finally {
    fermer();
  }
}

async function estSansBureau(page, approche, e, largeur) {
  const { cdp, ecouteurs, fermer } = await ouvrirChrome();
  try {
    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', { width: largeur, height: 900, deviceScaleFactor: 1, mobile: false });
    let charge = false;
    ecouteurs.push((m) => m.method === 'Page.loadEventFired' && (charge = true));
    await cdp('Page.navigate', { url: `${BASE_MAQUETTES}/fr/playground/maquettes?p=${page}&a=${approche}&e=${e}&v=bureau&cadre=1` });
    for (const t = Date.now(); !charge && Date.now() - t < 90_000; ) await dormir(150);
    for (const t = Date.now(); Date.now() - t < 30_000; ) {
      if (await evaluer(cdp, `!!document.querySelector('.maquettes-cadre .maquette-defile > *')`).catch(() => false)) break;
      await dormir(150);
    }
    await dormir(300);
    return await evaluer(cdp, SANS_BUREAU);
  } finally {
    fermer();
  }
}

async function cmdGeler() {
  const t0 = Date.now();
  const budget = Number(opt('budget', '480')) * 1000;
  const { revue, pages } = RETENUES();
  const choisies = drapeau('toutes') ? pages : pages.filter((p) => p.page === opt('page'));
  if (!choisies.length) throw new Error(`--page <page> (une des ${pages.length} de references/retenues.json) ou --toutes`);
  const voulus = (opt('appareils') ?? 'telephone,bureau-1440,bureau-1280').split(',');
  const force = drapeau('force');
  let faits = 0;
  let sautes = 0;
  const restants = [];
  const echecs = [];
  for (const { page, approche, bureau1280 } of choisies) {
    const dossier = join(REFERENCES, page);
    mkdirSync(dossier, { recursive: true });
    const fGel = join(dossier, 'gel.json');
    let gel = existsSync(fGel) ? JSON.parse(readFileSync(fGel, 'utf8')) : null;
    if (!gel || force || gel.approche !== approche) {
      const noms = await recenser(page, approche);
      gel = { page, approche, revue, ecrans: noms.map((nom, e) => ({ e, nom })) };
      writeFileSync(fGel, `${JSON.stringify(gel, null, 1)}\n`);
    }
    for (const ecran of gel.ecrans) {
      for (const appareil of voulus) {
        if (appareil === 'bureau-1280' && !bureau1280) continue;
        const nomFichier = `${approche}-${ecran.e}-${appareil}`;
        const fJson = join(dossier, `${nomFichier}.json`);
        if (!force && existsSync(fJson)) {
          sautes++;
          continue;
        }
        if (appareil !== 'telephone' && typeof ecran.sansBureau === 'string') continue;
        if (Date.now() - t0 > budget - 25_000) {
          restants.push(`${page}/${nomFichier}`);
          continue;
        }
        if (appareil !== 'telephone' && ecran.sansBureau === undefined) {
          const sans = await estSansBureau(page, approche, ecran.e, Number(appareil.slice(7)));
          ecran.sansBureau = sans;
          writeFileSync(fGel, `${JSON.stringify(gel, null, 1)}\n`);
          if (sans !== null) continue;
        }
        let r;
        try {
          r = await relever({ maquette: page, a: approche, e: ecran.e, nom: ecran.nom, device: appareil === 'telephone' ? 'mobile' : 'desktop', largeur: appareil === 'telephone' ? undefined : appareil.slice(7), baseMaquettes: BASE_MAQUETTES, sansAttenteDonnees: drapeau('sans-attente-donnees') });
        } catch (err) {
          // Un écran refusé n'arrête pas le lot : il est nommé, et le journal le compte manquant.
          echecs.push(`${page}/${nomFichier} : ${err.message}`);
          console.error(`échec ${page}/${nomFichier} — ${err.message}`);
          continue;
        }
        const { releve, png } = r;
        // L'écran dessine un état de chargement (relevé sans attendre de données) : gel.json le dit.
        if (releve.meta.chargementDessine && ecran.etat !== 'chargement') {
          ecran.etat = 'chargement';
          writeFileSync(fGel, `${JSON.stringify(gel, null, 1)}\n`);
        }
        releve.meta.gel = { date: releve.meta.date.slice(0, 10), revue: `${revue.date} — ${revue.citation}` };
        delete releve.meta.reseau;
        writeFileSync(fJson, serialiser(releve));
        mkdirSync(join(IMAGES_REFERENCES, page), { recursive: true });
        writeFileSync(join(IMAGES_REFERENCES, page, `${nomFichier}.png`), png);
        faits++;
        console.log(`gelé ${page}/${nomFichier}.json · ${releve.noeuds.length} nœuds · rem ${releve.rem}`);
      }
    }
    // `null` = l'écran A un bureau : la clé ne sert qu'au journal ; on la garde pour ne pas re-sonder.
  }
  ecrireJournal();
  console.log(`gel : ${faits} relevés écrits, ${sautes} déjà présents${restants.length ? `, ${restants.length} RESTANTS (budget atteint) — relancez la même commande` : ''}${echecs.length ? `, ${echecs.length} ÉCHECS` : ''} · ${Math.round((Date.now() - t0) / 1000)} s`);
  if (echecs.length) process.exitCode = 1;
  else if (restants.length) process.exitCode = 6;
}

/** Le journal du gel, DÉRIVÉ des références présentes (jamais tenu à la main). */
function ecrireJournal() {
  const { revue, pages } = RETENUES();
  const l = [
    '# Journal du gel des références de fidélité',
    '',
    '> **Généré** par `node scripts/fidelite/fidelite.mjs journal` (et à la fin de chaque `geler`) depuis les',
    '> fichiers présents : ne pas éditer à la main. Pages et approches : `retenues.json`.',
    '',
    `Revue du porteur qui précède le gel : **${revue.date}** — ${revue.citation} (${revue.source}).`,
    '',
    '| Page | Approche | Écrans (visionneuse) | Sans bureau | Téléphone 390 | Bureau 1440 | Bureau 1280 | Gelé le | Complet |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  const total = { telephone: 0, 'bureau-1440': 0, 'bureau-1280': 0, ecrans: 0 };
  let completes = 0;
  for (const { page, approche, bureau1280 } of pages) {
    const dossier = join(REFERENCES, page);
    const gel = existsSync(join(dossier, 'gel.json')) ? JSON.parse(readFileSync(join(dossier, 'gel.json'), 'utf8')) : null;
    if (!gel) {
      l.push(`| ${page} | ${approche} | — | — | 0 | 0 | ${bureau1280 ? 0 : 'sans objet'} | — | non |`);
      continue;
    }
    const fichiers = readdirSync(dossier).filter((f) => f.startsWith(`${approche}-`) && f.endsWith('.json'));
    const n = (app) => fichiers.filter((f) => f.endsWith(`-${app}.json`)).length;
    const sans = gel.ecrans.filter((x) => typeof x.sansBureau === 'string');
    const inconnus = gel.ecrans.filter((x) => x.sansBureau === undefined).length;
    const attenduBureau = gel.ecrans.length - sans.length;
    const dates = [...new Set(fichiers.map((f) => JSON.parse(readFileSync(join(dossier, f), 'utf8')).meta?.gel?.date).filter(Boolean))].sort();
    const complet = n('telephone') === gel.ecrans.length && inconnus === 0 && n('bureau-1440') === attenduBureau && (!bureau1280 || n('bureau-1280') === attenduBureau);
    completes += complet ? 1 : 0;
    total.ecrans += gel.ecrans.length;
    for (const k of ['telephone', 'bureau-1440', 'bureau-1280']) total[k] += n(k);
    l.push(
      `| ${page} | ${approche} | ${gel.ecrans.length} | ${sans.length ? sans.map((x) => `${x.e}. ${x.nom}`).join(' ; ') : '—'} | ${n('telephone')}/${gel.ecrans.length} | ${n('bureau-1440')}/${attenduBureau} | ${bureau1280 ? `${n('bureau-1280')}/${attenduBureau}` : 'sans objet'} | ${dates.join(', ') || '—'} | ${complet ? 'oui' : 'non'} |`,
    );
  }
  l.push(
    '',
    `**Total** : ${completes}/${pages.length} pages complètes · ${total.ecrans} écrans recensés · ${total.telephone} références téléphone · ${total['bureau-1440']} bureau 1440 · ${total['bureau-1280']} bureau 1280.`,
    '',
  );
  writeFileSync(join(REFERENCES, 'JOURNAL.md'), l.join('\n'));
}

/* ───────────────────────────── balayage ───────────────────────────── */

async function cmdBalayer() {
  const largeurs = (opt('largeurs') ?? '390,768,1024,1280,1440').split(',').map(Number);
  const page = opt('maquette');
  const ecrans = page ? (opt('e') !== undefined ? [Number(opt('e'))] : (await recenser(page, opt('a', 'a'))).map((_, i) => i)) : [null];
  for (const L of largeurs) {
    for (const e of ecrans) {
      const { cdp, ecouteurs, fermer } = await ouvrirChrome();
      try {
        await cdp('Page.enable');
        await cdp('Runtime.enable');
        await cdp('Emulation.setDeviceMetricsOverride', { width: L, height: 900, deviceScaleFactor: 1, mobile: L < 768 });
        let racine = null;
        let url;
        if (page) {
          url = `${BASE_MAQUETTES}/fr/playground/maquettes?p=${page}&a=${opt('a', 'a')}&e=${e}&v=${L < 768 ? 'telephone' : 'bureau'}&cadre=1`;
          racine = L < 768 ? null : '.maquettes-cadre .maquette-defile';
        } else {
          const base = (opt('base') ?? 'http://localhost:3000').replace(/\/$/, '');
          await cdp('Network.setCookie', { name: 'auth_token', value: jetonDe(opt('persona', 'admin')), url: base, httpOnly: true, path: '/' });
          url = `${base}${opt('url')}`;
        }
        let charge = false;
        ecouteurs.push((m) => m.method === 'Page.loadEventFired' && (charge = true));
        await cdp('Page.navigate', { url });
        for (const t = Date.now(); !charge && Date.now() - t < 90_000; ) await dormir(150);
        await dormir(Number(opt('attente', '1500')));
        const r = await evaluer(cdp, `(${BALAYAGE})(${JSON.stringify(racine)})`);
        console.log(JSON.stringify({ cible: page ? `${page}/${opt('a', 'a')}/${e}` : opt('url'), largeur: L, ...r }));
      } finally {
        fermer();
      }
    }
  }
}

/* ───────────────────────────── entrée ───────────────────────────── */

const COMMANDES = {
  releve: cmdReleve,
  compare: cmdCompare,
  geler: cmdGeler,
  journal: async () => (ecrireJournal(), console.log(`ok ${join(REFERENCES, 'JOURNAL.md')}`)),
  jetons: async () => {
    const manquants = drapeau('renouveler') ? Object.keys(PERSONAS.comptes) : Object.keys(PERSONAS.comptes).filter((n) => !lireJetons()[n]?.token);
    if (manquants.length) frapperJetons(manquants);
    else console.log('jetons déjà présents (--renouveler pour les refrapper)');
  },
  balayer: cmdBalayer,
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const f = COMMANDES[commande];
  if (!f) {
    console.error(`commande : ${Object.keys(COMMANDES).join(' | ')} — voir l'en-tête de ${relative(process.cwd(), fileURLToPath(import.meta.url))}`);
    process.exit(2);
  }
  try {
    await f();
    process.exit(process.exitCode ?? 0);
  } catch (e) {
    console.error(`échec — ${e.message}`);
    process.exit(1);
  }
}
