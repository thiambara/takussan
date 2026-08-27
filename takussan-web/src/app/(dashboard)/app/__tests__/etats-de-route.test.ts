import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Les trois états de route de `/app`, gardés PAR L'ARBRE et non par des exemples (TCK-382).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI « SEGMENT PROPRE » ET NON « SEGMENT OU PARENT »
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'AC1 du ticket demandait « un `loading.tsx` dans son segment OU un segment parent ». Écrit
 * ainsi, le contrôle est **invérifiable** : `app/loading.tsx` est un ancêtre de TOUT `/app`, donc
 * dès qu'il existe, aucune page ne peut jamais manquer de repli et le test est vert quoi qu'on
 * ajoute. Il cocherait l'AC en ne mesurant rien — exactement la régression que la revue adverse
 * cherche.
 *
 * La règle tenue ici est donc plus étroite, et elle dit ce que la direction UX demandait
 * vraiment (*« le squelette a la forme de ce qui arrive »*) : un repli posé trois niveaux plus
 * haut ne peut pas avoir la forme de la page qu'il remplace.
 *
 *   Toute page qui `await` une donnée serveur a un `loading.tsx` dans SON segment,
 *   ou dans un segment ancêtre STRICTEMENT SOUS `app/`.
 *
 * `app/loading.tsx` couvre donc `app/page.tsx` — sa propre page — et rien d'autre. Une page
 * ajoutée demain sous `app/<neuf>/` sans repli rougit ici.
 *
 * Vérifié par ablation le 2026-08-27 : `mv app/bookings/loading.tsx` → 1 page en échec ;
 * `mv app/overview/loading.tsx` → 7 pages en échec.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CES REPLIS COÛTENT — mesuré, assumé, et écrit ici pour ne pas être redécouvert
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un `loading.tsx` ouvre une frontière de suspension : Next envoie la coque **et le code de
 * réponse** avant que la page n'ait rien décidé. Tout ce que la page ferait ensuite au niveau
 * HTTP est donc perdu. Deux effets, tous deux mesurés le 2026-08-27 sur Next 16.3.1 par sondes
 * jetables (`next dev`, pages nues, ablation du seul `loading.tsx`) :
 *
 *     notFound()  sans repli → 404      avec un repli (même segment OU ancêtre) → 200
 *     redirect()  sans repli → 307      avec un repli → 200 + la coque, redirection côté client
 *
 * Dans les DEUX cas l'écran final reste juste : la sonde `notFound` rend bien la page 404, et le
 * navigateur suit bien la redirection portée par le flux RSC. Seul le statut change — et `curl`,
 * lui, s'arrête sur le squelette.
 *
 * **C'est un échange, pas un oubli.** Il est acceptable ICI et nulle part ailleurs, pour trois
 * raisons qui tiennent ensemble : `(dashboard)/layout.tsx` pose `robots: { index: false }` sur
 * tout `/app` (aucun indexeur ne lit ces statuts), l'espace est derrière l'authentification
 * (aucun client sans JS ne l'atteint), et la redirection d'authentification elle-même est
 * **au-dessus** de toute frontière posée ici — vérifié : `GET /app` non authentifié rend 307
 * avec `app/loading.tsx` en place, parce que le `redirect()` vit dans le layout du groupe.
 *
 * ⚠ Sur le catalogue PUBLIC, le même échange est inacceptable et le dépôt l'a déjà payé :
 * TCK-335 a SUPPRIMÉ `properties/[slug]/loading.tsx` pour rendre un vrai 404 à l'indexation, et
 * `(public)/properties/[slug]/__tests__/pas-de-frontiere-de-suspension.test.ts` le garde. Ne pas
 * recopier le patron de ce fichier-ci vers `(public)`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE PROUVE PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il lit des fichiers, il ne rend rien. Il ne peut donc pas voir qu'un squelette est *permanent*
 * (c'est impossible par construction : Next démonte le repli dès que l'enfant résout) ni qu'il
 * ressemble à sa page. La ressemblance est portée par le typage — `RouteSkeleton` n'accepte que
 * cinq variantes — et par la relecture, pas par ce test.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Appels `await` qui ne sont PAS un aller-retour réseau : ils ne justifient aucun repli. */
const AWAITS_SANS_RESEAU = /^(params|searchParams|props|getTranslations|getLocale|getFormatter|cookies|headers)$/;

interface Page {
  /** Chemin absolu du `page.tsx`. */
  readonly fichier: string;
  /** Chemin relatif à `app/`, pour les messages d'échec. */
  readonly rel: string;
  /** Répertoire du segment. */
  readonly segment: string;
  readonly source: string;
  /** Corps de l'export par défaut. */
  readonly corps: string;
}

function pagesDeApp(): Page[] {
  const sortie: Page[] = [];
  const parcours = (dir: string) => {
    for (const entree of readdirSync(dir, { withFileTypes: true })) {
      const chemin = join(dir, entree.name);
      if (entree.isDirectory()) {
        if (entree.name === '__tests__') continue;
        parcours(chemin);
      } else if (entree.name === 'page.tsx') {
        const source = readFileSync(chemin, 'utf8');
        const debut = source.search(/export default (async )?function/);
        sortie.push({
          fichier: chemin,
          rel: relative(APP, chemin),
          segment: dir,
          source,
          corps: debut >= 0 ? source.slice(debut) : '',
        });
      }
    }
  };
  parcours(APP);
  return sortie.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Une page qui ne rend jamais de JSX ne produit aucun document : ni onglet, ni attente. */
function estUneRedirectionSeule(page: Page): boolean {
  const redirige = /\b(permanentRedirect|redirect)\(/.test(page.corps);
  const rendDuJsx = /return\s*\(|return\s*</.test(page.corps);
  return redirige && !rendDuJsx;
}

function attendUneDonneeServeur(page: Page): boolean {
  if (/^\s*['"]use client['"]/m.test(page.source.split('\n').slice(0, 3).join('\n'))) return false;
  const appels = [...page.corps.matchAll(/await\s+([A-Za-z0-9_.$]+)\s*\(/g)].map((m) => m[1]);
  return appels.some((nom) => !AWAITS_SANS_RESEAU.test(nom));
}

const PAGES = pagesDeApp();

describe('TCK-382 — inventaire', () => {
  it('trouve les pages de /app (non-vacuité de tout ce fichier)', () => {
    // Si ce relevé tombait à zéro — un glob cassé, un renommage de répertoire — chacune des
    // assertions ci-dessous passerait au vert en ayant mesuré l'ensemble vide.
    expect(PAGES.length).toBeGreaterThanOrEqual(40);
  });

  it('deux pages seulement ne rendent aucun document, et ce sont des redirections nues', () => {
    // Ratchet : l'exemption des règles « titre » ci-dessous est DÉRIVÉE (aucun JSX rendu), pas
    // écrite. Ce test fige sa taille pour qu'une page muette de plus soit un acte conscient.
    const muettes = PAGES.filter(estUneRedirectionSeule).map((p) => p.rel);
    expect(muettes.sort()).toEqual(['crm/page.tsx', 'overview/page.tsx']);
  });
});

describe('TCK-382 / AC1 — l’attente', () => {
  it('chaque page qui attend une donnée serveur a son propre repli', () => {
    const manquantes: string[] = [];
    for (const page of PAGES) {
      if (!attendUneDonneeServeur(page)) continue;
      let dossier = page.segment;
      let couverte = false;
      // `app/loading.tsx` ne couvre que `app/page.tsx` : la boucle s'arrête AVANT de remonter
      // au-dessus du segment de la page quand ce segment est déjà `app/`.
      for (;;) {
        if (existsSync(join(dossier, 'loading.tsx'))) { couverte = true; break; }
        if (dossier === APP) break;
        dossier = dirname(dossier);
        if (dossier === APP) break; // un repli à la racine ne compte pas pour une page profonde
      }
      if (!couverte) manquantes.push(page.rel);
    }
    expect(manquantes, `pages sans loading.tsx dans leur segment : ${manquantes.join(', ')}`).toEqual([]);
  });

  it('un loading.tsx ne fait ni requête ni lecture de session', () => {
    // Contrainte métier du ticket. Un repli qui `await` se suspend lui-même : Next n'affiche
    // alors RIEN pendant qu'il attend — le contraire exact de sa raison d'être.
    const fautifs: string[] = [];
    const parcours = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') parcours(p); continue; }
        if (e.name !== 'loading.tsx') continue;
        const s = readFileSync(p, 'utf8');
        if (/\bawait\b|getToken|getMeAction|apiRequest|apiFetch|cookies\(/.test(s)) {
          fautifs.push(relative(APP, p));
        }
      }
    };
    parcours(APP);
    expect(fautifs).toEqual([]);
  });
});

describe('TCK-382 / AC4 & AC6 — le titre d’onglet', () => {
  it('aucune page rendant un document n’est dépourvue de generateMetadata', () => {
    const sans: string[] = [];
    for (const page of PAGES) {
      if (estUneRedirectionSeule(page)) continue;
      if (/generateMetadata/.test(page.source)) continue;
      // Un module 'use client' ne PEUT PAS exporter generateMetadata : Next l'interdit. Le titre
      // vit alors dans le layout du segment (`payments/return/layout.tsx`).
      const layout = join(page.segment, 'layout.tsx');
      if (existsSync(layout) && /generateMetadata/.test(readFileSync(layout, 'utf8'))) continue;
      sans.push(page.rel);
    }
    expect(sans, `pages sans titre d'onglet : ${sans.join(', ')}`).toEqual([]);
  });

  it('generateMetadata est déclarée APRÈS le dernier import', () => {
    const malPlacees: string[] = [];
    for (const page of PAGES) {
      const lignes = page.source.split('\n');
      const dernierImport = lignes.reduce((acc, l, i) => (/^import\s/.test(l) ? i : acc), -1);
      const declaration = lignes.findIndex((l) =>
        /export\s+(async\s+)?(function|const)\s+generateMetadata/.test(l));
      if (declaration >= 0 && declaration < dernierImport) {
        malPlacees.push(`${page.rel} (l. ${declaration + 1} < import l. ${dernierImport + 1})`);
      }
    }
    expect(malPlacees).toEqual([]);
  });

  it('aucun titre d’onglet n’est écrit en dur', () => {
    // `visits/[id]` rendait `export const metadata = { title: 'Visite' }` et `customers`
    // `{ title: 'Clients (CRM)' }` — deux libellés français dans le code, qu'aucune garde n'a
    // vus : le contrôle B de check-i18n.mjs ne lit pas les propriétés d'objet, et il le dit.
    const fautifs: string[] = [];
    for (const page of PAGES) {
      for (const [i, ligne] of page.source.split('\n').entries()) {
        if (/^\s*\*/.test(ligne)) continue; // docblock
        if (/title:\s*['"`]/.test(ligne)) fautifs.push(`${page.rel}:${i + 1}`);
      }
    }
    expect(fautifs, `titres codés en dur : ${fautifs.join(', ')}`).toEqual([]);
  });
});
