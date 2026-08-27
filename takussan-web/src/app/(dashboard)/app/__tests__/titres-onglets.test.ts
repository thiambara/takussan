import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';

/**
 * AC4 — « aucune page n'est dépourvue de titre, et deux pages ne rendent pas le même » (TCK-382).
 *
 * ## Pourquoi les TROIS dictionnaires et pas seulement `fr`
 *
 * `src/i18n/request.ts` deep-merge `fr` SOUS toute locale ≠ fr. Une clé posée en français seul
 * s'affiche donc **en français** à un lecteur anglophone, sans erreur ni avertissement — c'est le
 * défaut que `check-i18n.mjs` a été écrit pour attraper, et c'est aussi celui que la page de bail
 * portait en dur pendant tout ce temps. Vérifier `fr` seul reviendrait à vérifier le repli.
 *
 * ⚠ Ce test lit les clés dans la SOURCE des pages. Il ne rend rien : il ne peut donc pas voir
 * qu'un titre est correctement posé sur la balise `<title>`, seulement qu'il existe, qu'il est
 * traduit dans les trois langues et qu'il est unique. Le rendu, lui, est tenu par le typage
 * `Promise<Metadata>` de Next.
 */
const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const DICTIONNAIRES = { fr, en, wo } as Record<string, unknown>;

function resous(dictionnaire: unknown, chemin: string): unknown {
  return chemin.split('.').reduce<unknown>(
    (noeud, cle) =>
      noeud && typeof noeud === 'object' ? (noeud as Record<string, unknown>)[cle] : undefined,
    dictionnaire,
  );
}

interface Titre {
  readonly rel: string;
  /** Toutes les clés que `generateMetadata` peut rendre, dans l'ordre du fichier. */
  readonly cles: readonly string[];
}

/** Les clés `t('…')` d'un bloc `generateMetadata`, préfixées par l'espace de noms qu'il ouvre. */
function clesDeMetadata(source: string): string[] {
  // Les DEUX formes légales sous Next. Ne reconnaître que `function` faisait rougir une page
  // juste écrite `export const generateMetadata = async () => …` avec le message trompeur
  // « ne lit aucune clé » — et `etats-de-route.test.ts` acceptait déjà les deux : deux gardes
  // du même lot n'étaient pas d'accord sur ce qu'est une `generateMetadata`.
  const debut = source.search(/export\s+(async\s+)?(function\s+generateMetadata|const\s+generateMetadata\s*=)/);
  if (debut < 0) return [];
  const bloc = source.slice(debut);
  const fin = bloc.search(/\n\}[;\n]/);
  const corps = fin > 0 ? bloc.slice(0, fin) : bloc;
  const espace = corps.match(/getTranslations\('([^']+)'\)/)?.[1];
  if (!espace) return [];
  return [...corps.matchAll(/\bt\('([^']+)'/g)].map((m) => `${espace}.${m[1]}`);
}

function titresDeApp(): Titre[] {
  const sortie: Titre[] = [];
  const parcours = (dir: string) => {
    for (const entree of readdirSync(dir, { withFileTypes: true })) {
      const chemin = join(dir, entree.name);
      if (entree.isDirectory()) {
        if (entree.name !== '__tests__') parcours(chemin);
        continue;
      }
      if (entree.name !== 'page.tsx') continue;
      const source = readFileSync(chemin, 'utf8');
      const corps = source.slice(Math.max(0, source.search(/export default (async )?function/)));
      const redirectionSeule =
        /\b(permanentRedirect|redirect)\(/.test(corps) && !/return\s*\(|return\s*</.test(corps);
      if (redirectionSeule) continue;
      let cles = clesDeMetadata(source);
      if (cles.length === 0) {
        const layout = join(dir, 'layout.tsx');
        if (existsSync(layout)) cles = clesDeMetadata(readFileSync(layout, 'utf8'));
      }
      sortie.push({ rel: relative(APP, chemin), cles });
    }
  };
  parcours(APP);
  return sortie.sort((a, b) => a.rel.localeCompare(b.rel));
}

const TITRES = titresDeApp();

describe('TCK-382 / AC4 — les titres d’onglet', () => {
  it('couvre toutes les pages qui rendent un document (non-vacuité)', () => {
    expect(TITRES.length).toBeGreaterThanOrEqual(40);
  });

  it('chaque page rend un titre tiré du dictionnaire', () => {
    const sans = TITRES.filter((t) => t.cles.length === 0).map((t) => t.rel);
    expect(sans, `pages dont generateMetadata ne lit aucune clé : ${sans.join(', ')}`).toEqual([]);
  });

  it.each(['fr', 'en', 'wo'])('toutes les clés de titre existent en %s', (langue) => {
    const absentes: string[] = [];
    for (const titre of TITRES) {
      for (const cle of titre.cles) {
        if (typeof resous(DICTIONNAIRES[langue], cle) !== 'string') {
          absentes.push(`${cle} (${titre.rel})`);
        }
      }
    }
    expect(absentes, `clés absentes de ${langue}.json : ${absentes.join(', ')}`).toEqual([]);
  });

  it.each(['fr', 'en', 'wo'])('deux pages ne rendent pas le même titre en %s', (langue) => {
    // TOUS les titres que chaque page peut rendre, pas seulement le premier du fichier.
    // Mesuré sur la version d'origine : `leases/[id]` était éprouvée sur `metaTitleFallback`
    // (« Bail introuvable »), donc jamais sur le titre qu'elle rend dans le cas nominal.
    const vus = new Map<string, string>();
    const doublons: string[] = [];
    for (const titre of TITRES) {
      for (const cle of titre.cles) {
        const valeur = resous(DICTIONNAIRES[langue], cle);
        if (typeof valeur !== 'string') continue;
        const precedent = vus.get(valeur);
        if (precedent && precedent !== titre.rel) {
          doublons.push(`« ${valeur} » : ${precedent} et ${titre.rel}`);
        } else if (!precedent) {
          vus.set(valeur, titre.rel);
        }
      }
    }
    expect(doublons, doublons.join(' | ')).toEqual([]);
  });

  it('le titre du bail ne dépend plus d’un littéral français', () => {
    // Le cas nommé par l'AC5. Avant le correctif, les trois branches de `generateMetadata`
    // rendaient un gabarit interpolé écrit dans le code — un anglophone lisait du français.
    const source = readFileSync(join(APP, 'leases/[id]/page.tsx'), 'utf8');
    expect(source).not.toMatch(/title:\s*[`'"]/);
    for (const cle of ['metaTitleFallback', 'metaTitleWithId', 'metaTitleWithReference']) {
      expect(source).toContain(`t('${cle}'`);
      for (const langue of ['fr', 'en', 'wo']) {
        expect(
          resous(DICTIONNAIRES[langue], `dashboard.pages.leaseDetail.${cle}`),
          `${cle} manque en ${langue}`,
        ).toEqual(expect.any(String));
      }
    }
    // Non-vacuité : les trois libellés diffèrent réellement d'une langue à l'autre.
    const enId = resous(en, 'dashboard.pages.leaseDetail.metaTitleWithId');
    const frId = resous(fr, 'dashboard.pages.leaseDetail.metaTitleWithId');
    expect(enId).not.toEqual(frId);
  });
});
