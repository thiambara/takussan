import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  SEGMENTS_NON_LOCALISES,
  analyserAcceptLanguage,
  cheminLocalise,
  decouperLocale,
  estCheminLocalisable,
  localeDeRepli,
} from '../routing';

/**
 * Le schéma d'URL de la langue — ADR-0026, TCK-434.
 *
 * ⚠ Ces cas sont écrits pour ÉCHOUER sur les régressions plausibles, pas pour décrire le code. Les
 * trois qui comptent, et ce qu'ils attrapent :
 *
 * · `/api/**` localisable → chaque route handler BFF part en 404, console comprise ;
 * · une URL déjà préfixée re-préfixée → `/fr/fr/properties`, un 404 sur tout le catalogue ;
 * · `localeDeRepli` qui préfère l'en-tête au cookie → un choix explicite écrasé (AC5).
 */
describe('estCheminLocalisable', () => {
  it('accepte les chemins de la surface publique', () => {
    for (const chemin of ['/', '/properties', '/properties/mon-slug', '/agencies/x', '/agents/y', '/compare']) {
      expect(estCheminLocalisable(chemin), chemin).toBe(true);
    }
  });

  it('refuse toutes les entrées de la liste, une par une', () => {
    // ⚠ Ce test BOUCLE SUR LA CONSTANTE : il ne peut vérifier que les entrées DÉJÀ présentes. Il ne
    // dit donc rien de la COMPLÉTUDE de la liste — c'est le test dérivé plus bas qui s'en charge, et
    // son absence a coûté `verification-indisponible`. Les deux se lisent ensemble.
    for (const segment of SEGMENTS_NON_LOCALISES) {
      expect(estCheminLocalisable(`/${segment}`), `/${segment}`).toBe(false);
      expect(estCheminLocalisable(`/${segment}/quelque/chose`), `/${segment}/…`).toBe(false);
    }
  });

  it('refuse les fichiers servis tels quels — sitemap et robots ne se déclinent pas', () => {
    for (const chemin of ['/robots.txt', '/sitemap.xml', '/favicon.ico', '/og.png']) {
      expect(estCheminLocalisable(chemin), chemin).toBe(false);
    }
  });

  it('ne confond pas un préfixe avec un segment : /application n’est pas /app', () => {
    expect(estCheminLocalisable('/applications')).toBe(true);
    expect(estCheminLocalisable('/apiary')).toBe(true);
  });
});

describe('decouperLocale', () => {
  it('sépare la langue du reste', () => {
    expect(decouperLocale('/en/properties/x')).toEqual({ locale: 'en', chemin: '/properties/x' });
    expect(decouperLocale('/wo')).toEqual({ locale: 'wo', chemin: '/' });
    expect(decouperLocale('/fr/')).toEqual({ locale: 'fr', chemin: '/' });
  });

  it('rend null quand le premier segment n’est pas une langue connue', () => {
    expect(decouperLocale('/properties/x')).toEqual({ locale: null, chemin: '/properties/x' });
    // `zz` ressemble à une langue et n'en est pas une : c'est le cas que le layout transforme en 404.
    expect(decouperLocale('/zz/properties')).toEqual({ locale: null, chemin: '/zz/properties' });
  });
});

describe('cheminLocalise', () => {
  it('préfixe la surface publique, français compris — ADR-0026 §1', () => {
    expect(cheminLocalise('/properties/x', 'fr')).toBe('/fr/properties/x');
    expect(cheminLocalise('/properties/x', 'wo')).toBe('/wo/properties/x');
    expect(cheminLocalise('/', 'en')).toBe('/en');
  });

  it('REMPLACE une langue déjà présente — c’est ce dont dépend le commutateur', () => {
    expect(cheminLocalise('/fr/properties/x', 'en')).toBe('/en/properties/x');
    expect(cheminLocalise('/en', 'wo')).toBe('/wo');
  });

  it('est idempotent pour la même langue', () => {
    expect(cheminLocalise(cheminLocalise('/properties/x', 'en'), 'en')).toBe('/en/properties/x');
  });

  it('laisse les surfaces non localisées EXACTEMENT telles quelles', () => {
    expect(cheminLocalise('/app/overview', 'en')).toBe('/app/overview');
    expect(cheminLocalise('/api/me/profiles', 'wo')).toBe('/api/me/profiles');
    expect(cheminLocalise('/auth/login', 'fr')).toBe('/auth/login');
  });
});

describe('analyserAcceptLanguage', () => {
  it('trie par facteur q, pas par ordre d’apparition', () => {
    expect(analyserAcceptLanguage('fr;q=0.1, en;q=0.9')).toEqual(['en', 'fr']);
  });

  it('réduit à la sous-étiquette primaire', () => {
    expect(analyserAcceptLanguage('fr-CA,en-GB;q=0.8')).toEqual(['fr', 'en']);
  });
});

describe('localeDeRepli — où envoyer une requête SANS langue dans l’URL', () => {
  it('le cookie l’emporte sur un Accept-Language contradictoire (AC5)', () => {
    expect(localeDeRepli('en', 'fr-FR,fr;q=0.9')).toBe('en');
    expect(localeDeRepli('wo', 'en-US,en;q=0.9')).toBe('wo');
  });

  it('à défaut de cookie, suit Accept-Language', () => {
    expect(localeDeRepli(undefined, 'en-US,en;q=0.9')).toBe('en');
    expect(localeDeRepli(undefined, 'wo')).toBe('wo');
  });

  it('ignore un cookie qui ne nomme pas une langue connue', () => {
    expect(localeDeRepli('zz', 'en')).toBe('en');
  });

  it('sans cookie ni en-tête, rend le français', () => {
    expect(localeDeRepli(undefined, null)).toBe('fr');
    expect(localeDeRepli(undefined, undefined)).toBe('fr');
  });
});


/**
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA COMPLÉTUDE DE LA LISTE — DÉRIVÉE DU ROUTEUR, JAMAIS RELUE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Le test qui manquait, et ce qu'il a coûté.** Toutes les vérifications de ce fichier bouclaient
 * sur `SEGMENTS_NON_LOCALISES` : elles éprouvent ce qui y est écrit, jamais ce qui devrait y être.
 * Une liste écrite à la main gardée par un test qui la relit est une liste sans garde. Mesuré :
 * `verification-indisponible` — la page de secours des gardes fail-closed — en était absente, le
 * proxy la redirigeait vers `/fr/verification-indisponible`, **qui n'existe pas**, et 187 tests sur
 * 187 restaient verts.
 *
 * Ce test-ci ne relit rien : il **énumère le routeur**. Tout premier segment de chemin réellement
 * servi par `src/app` — groupes de routes `(…)` dépliés, puisqu'ils ne créent pas de segment — doit
 * figurer dans la liste, sauf `[locale]` qui EST la surface localisée.
 *
 * *Aucune liste maintenue à la main ne reste juste ; seule une liste dérivée le reste.* Ici la liste
 * ne PEUT pas être dérivée — `src/proxy.ts` tourne sur le runtime edge, sans système de fichiers.
 * Alors c'est sa VÉRIFICATION qu'on dérive.
 */
const APP = join(process.cwd(), 'src/app');

/**
 * Les fichiers de MÉTADONNÉES de Next, et l'URL que chacun sert — mesurée, pas déduite.
 *
 * ⚠️ **La première version de cette garde n'itérait que sur des RÉPERTOIRES, et elle était donc
 * aveugle à toute une famille.** `src/app/icon.tsx` est un FICHIER, à la racine, servi sur `/icon` :
 * poser ce fichier laissait la garde à 18/18 vert pendant que `/icon` partait en 404. *Une garde
 * qui reste verte au moment exact où le défaut naît est pire qu'une absence de garde.*
 *
 * La table dit l'URL de chaque convention, telle que mesurée sur `next dev` proxy neutralisé :
 * quatre servent une URL SANS extension (le piège), trois en portent une (déjà couvertes par la
 * règle du dernier segment).
 */
const METADONNEES_NEXT: Record<string, string> = {
  icon: '/icon',
  'apple-icon': '/apple-icon',
  'opengraph-image': '/opengraph-image',
  'twitter-image': '/twitter-image',
  sitemap: '/sitemap.xml',
  robots: '/robots.txt',
  manifest: '/manifest.webmanifest',
};

/** `icon.tsx`, `icon1.tsx`, `opengraph-image2.tsx`… → la base sans suffixe ni extension. */
function baseMetadonnee(nomFichier: string): string | null {
  const m = nomFichier.match(/^([a-z-]+?)\d*\.(?:tsx?|jsx?)$/);
  return m && m[1]! in METADONNEES_NEXT ? m[1]! : null;
}

/** Un répertoire sert-il une route ? (`page.*` ou `route.*` quelque part en dessous) */
function sertUneRoute(dir: string): boolean {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && /^(page|route)\.(tsx?|jsx?)$/.test(e.name)) return true;
    if (e.isDirectory() && e.name !== '__tests__' && sertUneRoute(join(dir, e.name))) return true;
  }
  return false;
}

/**
 * Les premiers segments de CHEMIN que `src/app` sert réellement.
 *
 * Deux subtilités, et ce sont elles qui font la justesse du relevé :
 * · un groupe `(dashboard)` ne crée AUCUN segment — ses enfants sont à la racine du chemin. C'est
 *   exactement ce qui a caché `verification-indisponible`, enfoui dans `(dashboard)/`.
 * · `actions/` et `__tests__/` ne servent aucune route (pas de `page`/`route`) : `sertUneRoute` les
 *   écarte sans qu'on ait à les nommer — une exception nommée est une exception qui se périme.
 */
function cheminsServisALaRacine(dir = APP): string[] {
  const chemins: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const complet = join(dir, e.name);
    if (e.isDirectory()) {
      if (/^\(.*\)$/.test(e.name)) {
        chemins.push(...cheminsServisALaRacine(complet)); // groupe : transparent au chemin
      } else if (e.name === '[locale]') {
        continue; // LA surface localisée — le seul segment qui doit porter une langue
      } else if (sertUneRoute(complet)) {
        chemins.push(`/${e.name}`);
      }
      continue;
    }
    // ── Les FICHIERS. C'est la moitié qui manquait. ──────────────────────────────────────────────
    const base = baseMetadonnee(e.name);
    if (base) chemins.push(METADONNEES_NEXT[base]!);
  }
  return [...new Set(chemins)].sort();
}

describe('la complétude est DÉRIVÉE du routeur — répertoires ET fichiers', () => {
  it('le relevé trouve bien quelque chose — sans quoi la garde serait verte en n’ayant rien à voir', () => {
    // Refus de vacuité. Un `readdirSync` qui viserait le mauvais dossier rendrait `[]`, et la
    // vérification suivante passerait en n'ayant rien vérifié — le mode d'échec exact que ce dépôt
    // a déjà payé ailleurs.
    const trouves = cheminsServisALaRacine();
    expect(existsSync(APP), `src/app introuvable depuis ${process.cwd()}`).toBe(true);
    expect(trouves.length).toBeGreaterThanOrEqual(6);
    expect(trouves).toEqual(
      expect.arrayContaining(['/api', '/app', '/admin', '/auth', '/super-admin']),
    );
  });

  it('AUCUN chemin servi à la racine par src/app n’est jugé localisable', () => {
    // ⚠ L'assertion porte sur `estCheminLocalisable`, PAS sur l'appartenance à
    // `SEGMENTS_NON_LOCALISES` — parce qu'il y a désormais DEUX mécanismes : la liste, et la règle
    // de forme des métadonnées de Next (`MOTIF_METADONNEES_NEXT`, dont le suffixe numérique est
    // ouvert et qu'aucune liste ne pourrait contenir). Ce qui compte n'est pas PAR QUEL mécanisme
    // un chemin est protégé, c'est qu'il le soit.
    const fautifs = cheminsServisALaRacine().filter((c) => estCheminLocalisable(c));
    expect(
      fautifs,
      `Ces chemins sont servis par src/app à la RACINE et jugés LOCALISABLES : ${fautifs.join(', ')}.\n` +
        `    Le proxy les redirige donc vers /<langue>/…, qui n’est pas une route : ils rendent 404.\n` +
        `    → segment ordinaire : l’ajouter à SEGMENTS_NON_LOCALISES (src/i18n/routing.ts) ;\n` +
        `    → convention de fichier Next : compléter MOTIF_METADONNEES_NEXT et la table\n` +
        `      METADONNEES_NEXT de ce fichier ;\n` +
        `    → route réellement publique : la déplacer sous src/app/[locale]/(public)/.`,
    ).toEqual([]);
  });

  it('un fichier de métadonnées POSÉ à la racine serait vu — la garde n’est plus aveugle aux fichiers', () => {
    // Refus de vacuité ciblé sur la moitié qui manquait : on éprouve le RELEVÉ, sans écrire de
    // fichier. Si `baseMetadonnee` cessait de reconnaître ces noms, ce test rougirait, alors que le
    // précédent resterait vert faute d'avoir quoi que ce soit à trouver.
    for (const nom of ['icon.tsx', 'icon1.tsx', 'apple-icon.tsx', 'opengraph-image.ts', 'twitter-image2.jsx']) {
      expect(baseMetadonnee(nom), nom).not.toBeNull();
      expect(estCheminLocalisable(METADONNEES_NEXT[baseMetadonnee(nom)!]!), nom).toBe(false);
    }
    for (const nom of ['page.tsx', 'layout.tsx', 'icon.png', 'not-found.tsx']) {
      expect(baseMetadonnee(nom), nom).toBeNull();
    }
  });
});
