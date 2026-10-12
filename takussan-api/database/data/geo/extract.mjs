#!/usr/bin/env node
/**
 * TCK-633 (ADR-0062 §3) — extraction du référentiel géographique du Sénégal depuis OpenStreetMap.
 *
 * Ce script ne s'exécute PAS en CI ni au déploiement : il PRODUIT les fichiers versionnés de
 * `database/data/geo/regions/`, que la personne qui le lance relit avant de les commiter
 * (`relu_par`, `relu_le`, `relu_empreinte` — par `signer.mjs`, au nom de la personne qui a relu).
 * Le chargement en base est l'affaire de `GeoReferentialLoader`.
 *
 *   node database/data/geo/extract.mjs                  # les 14 régions
 *   node database/data/geo/extract.mjs --region=SN-DK   # une seule
 *   node database/data/geo/extract.mjs --brut=/tmp/geo  # garde aussi les réponses brutes d'Overpass
 *   node database/data/geo/extract.mjs --depuis=/tmp/geo  # rejoue sur des réponses brutes gardées
 *
 * Découpage (ADR-0062 §2) : dans les départements de l'agglomération dakaroise, la VILLE est le
 * département et ses communes d'arrondissement sont des QUARTIERS, à côté des lieux nommés
 * d'OSM ; ailleurs, la ville est la commune. Niveaux OSM mesurés le 2026-10-12 sur la région de
 * Dakar : 4 = région, 5 = département, 7 = arrondissement, 8 = commune.
 *
 * ⚠ Overpass refuse (406) une requête sans User-Agent, et rend souvent 504 / 500 sous charge :
 * le script essaie trois serveurs, avec une attente croissante.
 *
 * Données © les contributeurs d'OpenStreetMap, licence ODbL 1.0.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, 'regions');
const CORRECTIONS = join(ICI, 'corrections.json');

const REGIONS = [
  'SN-DK', 'SN-DB', 'SN-FK', 'SN-KA', 'SN-KL', 'SN-KE', 'SN-KD',
  'SN-LG', 'SN-MT', 'SN-SL', 'SN-SE', 'SN-TC', 'SN-TH', 'SN-ZG',
];

/** Les départements où la ville est le département (ADR-0062 §2), par nom OSM débarrassé du préfixe. */
const AGGLOMERATION = new Set(['Dakar', 'Pikine', 'Guédiawaye', 'Keur Massar']);

const SERVEURS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const AGENT = 'takussan-geo-extract/1.0 (+https://www.takussan.com)';
const TENTATIVES = 6;

/** Les sigles qui restent en capitales quand un nom tout en capitales est remis en casse de titre. */
const SIGLES = new Set(['HLM', 'SICAP', 'SCAT', 'ASECNA', 'SIPRES', 'SICA', 'SONATEL', 'CSE', 'VDN', 'SOFRACO', 'SIDAK', 'JUS', 'UCAD', 'SDE', 'BCEAO', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII']);

const PREFIXES = /^(?:r[ée]gion|d[ée]partement|commune(?: d'arrondissement)?|communaut[ée] rurale|arrondissement)\s+(?:de la |de l'|de l’|des |du |de |d'|d’)?/i;

function requete(code) {
  return `[out:json][timeout:600];
rel["boundary"="administrative"]["admin_level"="4"]["ISO3166-2"="${code}"]->.reg;
.reg out tags center;
.reg map_to_area->.r;
rel(area.r)["boundary"="administrative"]["admin_level"="5"];
foreach->.d(
  .d out tags center;
  .d map_to_area->.da;
  rel(area.da)["boundary"="administrative"]["admin_level"="8"];
  foreach->.c(
    .c out tags center;
    .c map_to_area->.ca;
    nwr(area.ca)["place"~"^(suburb|quarter|neighbourhood)$"]["name"]->.p;
    (.p; - rel.p["admin_level"~"^[1-8]$"];);
    out tags center;
  );
);`;
}

async function overpass(code) {
  for (let essai = 1; essai <= TENTATIVES; essai++) {
    for (const serveur of SERVEURS) {
      try {
        const reponse = await fetch(serveur, {
          method: 'POST',
          headers: { 'User-Agent': AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ data: requete(code) }),
          signal: AbortSignal.timeout(620_000),
        });
        if (reponse.ok) return await reponse.json();
        console.error(`  ${code} · ${serveur} → ${reponse.status}`);
      } catch (erreur) {
        console.error(`  ${code} · ${serveur} → ${erreur.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 20_000 * essai));
  }
  throw new Error(`Overpass n'a pas répondu pour ${code} après ${TENTATIVES} tours.`);
}

export function slug(nom) {
  return nom
    // « Cœur » : la ligature ne se décompose pas en NFD — sans ce remplacement, « c-ur ».
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nomPropre(brut) {
  let nom = brut.trim().replace(/\s+/g, ' ').replace(PREFIXES, '');
  const lettres = nom.replace(/[^\p{L}]/gu, '');
  if (lettres.length > 3 && lettres === lettres.toLocaleUpperCase('fr')) {
    nom = nom
      .split(' ')
      .map((mot) => (SIGLES.has(mot.replace(/[^\p{L}]/gu, '')) ? mot : mot.charAt(0) + mot.slice(1).toLocaleLowerCase('fr')))
      .join(' ');
  }
  return nom.charAt(0).toLocaleUpperCase('fr') + nom.slice(1);
}

function centre(element) {
  const c = element.center ?? { lat: element.lat, lon: element.lon };
  return { latitude: Number(c.lat.toFixed(7)), longitude: Number(c.lon.toFixed(7)) };
}

function osm(element) {
  return `${element.type[0]}${element.id}`;
}

/** Transforme le flux ordonné d'Overpass (région, puis département, commune, lieux…) en arbre. */
export function arbre(code, reponse) {
  const [tete, ...reste] = reponse.elements;
  if (!tete || tete.tags?.admin_level !== '4') throw new Error(`${code} : la réponse ne commence pas par la région.`);

  const region = { code, slug: slug(nomPropre(tete.tags.name)), name: nomPropre(tete.tags.name), ...centre(tete) };
  const villes = new Map();
  let departement = null;
  let commune = null;
  const vus = new Set();

  const ville = (nom, element) => {
    const cle = slug(nom);
    if (!villes.has(cle)) villes.set(cle, { slug: cle, name: nom, ...centre(element), neighborhoods: new Map() });
    return villes.get(cle);
  };
  const quartier = (v, nom, element) => {
    const cle = slug(nom);
    if (cle === '' || cle === v.slug || nom.length > 60 || v.neighborhoods.has(cle)) return;
    v.neighborhoods.set(cle, { slug: cle, name: nom, ...centre(element), osm: osm(element) });
  };

  for (const e of reste) {
    const niveau = e.tags?.boundary === 'administrative' ? e.tags.admin_level : null;
    if (niveau === '5') {
      departement = { nom: nomPropre(e.tags.name), element: e };
      commune = null;
      continue;
    }
    if (niveau === '8') {
      const nom = nomPropre(e.tags.name);
      if (departement && AGGLOMERATION.has(departement.nom)) {
        commune = ville(departement.nom, departement.element);
        quartier(commune, nom, e);
      } else {
        commune = ville(nom, e);
      }
      continue;
    }
    if (!commune || vus.has(osm(e))) continue;
    vus.add(osm(e));
    quartier(commune, nomPropre(e.tags.name), e);
  }

  return { region, villes };
}

export function appliquerCorrections({ region, villes }, corrections) {
  const prefixe = region.code;
  // Regrouper des communes sous la ville que les annonces nomment (« Rufisque » pour Rufisque
  // Est, Nord et Ouest) : chaque commune devient un quartier, ses quartiers suivent.
  for (const groupe of corrections.regrouper ?? []) {
    if (groupe.region !== prefixe) continue;
    const membres = groupe.communes.map((c) => villes.get(c)).filter(Boolean);
    if (membres.length === 0) continue;
    const cle = slug(groupe.ville);
    const cible = villes.get(cle) ?? { slug: cle, name: groupe.ville, latitude: membres[0].latitude, longitude: membres[0].longitude, neighborhoods: new Map() };
    for (const m of membres) {
      if (m === cible) continue;
      if (!cible.neighborhoods.has(m.slug)) {
        cible.neighborhoods.set(m.slug, { slug: m.slug, name: m.name, latitude: m.latitude, longitude: m.longitude, osm: null });
      }
      for (const [k, n] of m.neighborhoods) if (!cible.neighborhoods.has(k)) cible.neighborhoods.set(k, n);
      villes.delete(m.slug);
    }
    villes.set(cle, cible);
  }
  for (const [chemin, champs] of Object.entries(corrections.villes ?? {})) {
    const [c, v] = chemin.split('/');
    if (c === prefixe && villes.has(v)) Object.assign(villes.get(v), champs);
  }
  for (const [chemin, nom] of Object.entries(corrections.renommer ?? {})) {
    const [c, v, q] = chemin.split('/');
    const n = c === prefixe ? villes.get(v)?.neighborhoods.get(q) : undefined;
    if (n) n.name = nom;
  }
  for (const chemin of corrections.retirer ?? []) {
    const [c, v, q] = chemin.split('/');
    if (c === prefixe) villes.get(v)?.neighborhoods.delete(q);
  }
  for (const ajout of corrections.ajouter ?? []) {
    const [c, v] = ajout.chemin.split('/');
    const cible = c === prefixe ? villes.get(v) : undefined;
    if (cible && !cible.neighborhoods.has(slug(ajout.name))) {
      cible.neighborhoods.set(slug(ajout.name), {
        slug: slug(ajout.name), name: ajout.name, latitude: ajout.latitude, longitude: ajout.longitude, osm: null,
      });
    }
  }
}

const parNom = (a, b) => a.name.localeCompare(b.name, 'fr');

export function fichier({ region, villes }, osmBase) {
  return {
    region,
    source: {
      osm_base: osmBase,
      extraite_le: new Date().toISOString().slice(0, 10),
      licence: 'ODbL 1.0 — © les contributeurs d’OpenStreetMap',
      relu_par: null,
      relu_le: null,
      relu_empreinte: null,
    },
    cities: [...villes.values()].sort(parNom).map((v) => ({
      slug: v.slug,
      name: v.name,
      latitude: v.latitude,
      longitude: v.longitude,
      neighborhoods: [...v.neighborhoods.values()].sort(parNom),
    })),
  };
}

async function principal() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const codes = args.region ? [args.region] : REGIONS;
  const corrections = JSON.parse(await readFile(CORRECTIONS, 'utf8').catch(() => '{}'));
  await mkdir(SORTIE, { recursive: true });

  for (const code of codes) {
    console.log(`→ ${code}`);
    const reponse = args.depuis
      ? JSON.parse(await readFile(join(args.depuis, `${code.toLowerCase()}.json`), 'utf8'))
      : await overpass(code);
    if (args.brut) {
      await mkdir(args.brut, { recursive: true });
      await writeFile(join(args.brut, `${code.toLowerCase()}.json`), JSON.stringify(reponse));
    }
    const resultat = arbre(code, reponse);
    appliquerCorrections(resultat, corrections);
    const contenu = fichier(resultat, reponse.osm3s?.timestamp_osm_base ?? null);
    const cible = join(SORTIE, `${code.toLowerCase()}.json`);
    await writeFile(cible, `${JSON.stringify(contenu, null, 2)}\n`);
    const quartiers = contenu.cities.reduce((n, v) => n + v.neighborhoods.length, 0);
    console.log(`  ${contenu.cities.length} villes, ${quartiers} quartiers → ${cible}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
