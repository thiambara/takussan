import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';

import { clefDeRecherche, parametresDeRecherche } from '@/lib/recherche-publique';
import type { SearchResult } from '@/types/search';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-432 — **ce que la PAGE choisit**, et que le rendu ne montre pas.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI IL EST SÉPARÉ
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * `rendu-serveur.test.tsx` éprouve ce que le HTML CONTIENT ; `lib/__tests__/recherche-publique.test.ts`
 * éprouve ce que les fonctions FONT. Entre les deux il restait un trou, et il était large : **la
 * page peut appeler la mauvaise fonction sans qu'aucun des deux ne bronche.**
 *
 * Mesuré par la revue adverse, sur le code livré au premier passage — deux ablations, deux verts :
 *
 * | ablation de la page | tests joués | résultat |
 * |---|---|---|
 * | la clef semée est produite par `requete.toString()` au lieu de `clefDeRecherche(requete)` | les 5 fichiers neufs | **45 verts / 45** |
 * | `parametresDepuisNext` troqué contre `versParametres` | rendu-serveur + recherche-publique | **25 verts / 25** |
 *
 * Or ce sont précisément les deux propriétés que le commit désigne comme portantes. La première
 * décide de l'AC5 : une clef non triée n'est jamais égale à celle que le hook recalcule, donc le
 * client **redemande l'appel que le serveur vient d'honorer** et la grille repasse par `LOADING` au
 * premier battement d'hydratation. La seconde décide de l'AC2 sur un paramètre répété : aucun test
 * du dépôt n'en passait à la page.
 *
 * *Une propriété éprouvée au niveau de la bibliothèque n'est pas éprouvée là où l'appelant
 * choisit.* C'est le même motif que celui payé ailleurs dans ce dépôt sur les listes recopiées :
 * la table est juste, l'appelant lit l'autre.
 *
 * ⚠️ **Le double sur `PropertiesDiscoveryPage` est la raison du fichier séparé.** Il remplace le
 * composant par un capteur qui ne rend rien : les assertions de balisage de `rendu-serveur.test.tsx`
 * ne peuvent pas cohabiter avec lui, et `vi.mock` est hissé pour tout le module.
 */

// ── Le capteur : ce que la page PASSE, plutôt que ce qu'elle affiche ──────────

type Graine = { readonly resultat: SearchResult; readonly clef: string } | null;

let graineVue: Graine = null;
let titreVu: string | undefined;

vi.mock('@/components/property/PropertiesDiscoveryPage', () => ({
  PropertiesDiscoveryPage: (props: { graine?: Graine; titre?: string }) => {
    graineVue = props.graine ?? null;
    titreVu = props.titre;
    return null;
  },
}));

// ── La frontière réseau : les URL réellement demandées ────────────────────────

const urlsDemandees: string[] = [];
let reponsePour: () => unknown = () => RESULTAT;

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiFetch: vi.fn(async (path: string) => {
      urlsDemandees.push(path);
      return reponsePour();
    }),
  };
});

vi.mock('next-intl/server', () => ({
  getLocale: async () => 'fr',
  // Le titre n'est pas le sujet ici : un traducteur qui rend sa clé suffit, et il ne peut pas
  // rendre un test vert par accident — aucune assertion de ce fichier ne porte sur un libellé.
  getTranslations: async (namespace?: string) =>
    Object.assign((cle: string) => `${namespace}.${cle}`, { has: () => true }),
}));

const RESULTAT: SearchResult = {
  data: [{ id: 1, slug: 'un-bien-Ab12', title: 'Un bien' } as PropertyListItem],
  facets: {},
  meta: { current_page: 1, last_page: 1, per_page: 30, total: 1 },
} as SearchResult;

const { default: PageDeLaListe } = await import('../page');

/** Rend la page serveur en flux, sans hydratation — le capteur suffit, rien n'est assert sur le HTML. */
async function rendre(searchParams: Record<string, string | string[]>) {
  const flux = await renderToReadableStream(await PageDeLaListe({
    searchParams: Promise.resolve(searchParams),
  }));
  await flux.allReady;
  const lecteur = flux.getReader();
  for (;;) {
    const { done } = await lecteur.read();
    if (done) break;
  }
}

/** La requête envoyée à `/public/properties/search`, telle que le réseau l'a vue. */
const requeteEnvoyee = () =>
  new URLSearchParams(
    urlsDemandees.find((u) => u.includes('/public/properties/search'))!.split('?')[1],
  );

beforeEach(() => {
  urlsDemandees.length = 0;
  graineVue = null;
  titreVu = undefined;
  reponsePour = () => RESULTAT;
});

describe('TCK-432 · AC5 — la page sème la clef que le HOOK recalculera', () => {
  /**
   * ⚠ L'attendu est **recalculé par la même chaîne de fonctions que `useSearch`**, jamais écrit à
   * la main. Une constante littérale gèlerait la sérialisation d'aujourd'hui : le jour où
   * `parametresDeRecherche` ajoute un paramètre par défaut, le test rougirait sans qu'aucune
   * égalité serveur/client ne soit rompue — et on le « corrigerait » en recopiant la nouvelle
   * chaîne, ce qui perdrait la garantie.
   */
  const clefDuHook = (url: string) =>
    clefDeRecherche(parametresDeRecherche(new URLSearchParams(url)));

  it('sur un filtre simple', async () => {
    await rendre({ type: 'villa' });

    expect(graineVue?.clef).toBe(clefDuHook('type=villa'));
  });

  it('sur une URL dont l’ordre des paramètres diffère de celui de l’objet de Next', async () => {
    // Le cas que seul le TRI rattrape : Next rend `{ page, type }`, le navigateur `?type=…&page=…`.
    // Une clef non triée ferait deux chaînes pour une seule requête, donc un rechargement.
    await rendre({ page: '2', type: 'villa' });

    expect(graineVue?.clef).toBe(clefDuHook('type=villa&page=2'));
  });

  it('sur la page nue, où le `per_page` par défaut entre dans la clef', async () => {
    await rendre({});

    expect(graineVue?.clef).toBe(clefDuHook(''));
  });

  it('la clef semée EST celle qui a servi à demander — une seule chaîne pour une seule requête', async () => {
    await rendre({ type: 'villa', page: '2' });

    // La page ne doit pas fabriquer une chaîne pour l'appel et une autre pour la graine : c'est le
    // doublon que `lib/recherche-publique.ts` existe pour interdire, et c'est ce qui rendait
    // l'écart de tri invisible à la relecture.
    expect(urlsDemandees[0]).toBe(`/public/properties/search?${graineVue?.clef}`);
  });

  it('ne sème RIEN quand l’API n’a pas répondu — la graine n’est jamais un mensonge', async () => {
    reponsePour = () => {
      throw new Error('API éteinte');
    };
    await rendre({ type: 'villa' });

    expect(graineVue).toBeNull();
  });
});

describe('TCK-432 · AC2 — la page transmet l’URL ENTIÈRE, valeurs répétées comprises', () => {
  it('`?tags=a&tags=b` part complet — `versParametres` en amputerait la seconde moitié', async () => {
    // ⚠ Le seul cas du dépôt qui distingue `parametresDepuisNext` de `versParametres`
    // (`canonique.ts`), laquelle garde délibérément la PREMIÈRE valeur parce qu'elle lit des clés
    // à valeur unique. Ici l'amputation ne lèverait rien : le serveur demanderait `tags=a` et le
    // client `tags=a&tags=b` — deux listes pour un seul écran, et la seconde remplacerait la
    // première à l'hydratation.
    await rendre({ tags: ['a', 'b'] });

    expect(requeteEnvoyee().getAll('tags')).toEqual(['a', 'b']);
    expect(graineVue?.clef).toContain('tags=a&tags=b');
  });

  it('le filtre de l’URL est dans la requête, et le `per_page` par défaut avec lui', async () => {
    await rendre({ type: 'villa' });

    const q = requeteEnvoyee();
    expect(q.get('type')).toBe('villa');
    expect(q.get('per_page')).toBe('30');
  });
});

describe('TCK-432 · AC3 — la page passe un titre non vide au `<h1>`', () => {
  it('le titre dérivé descend bien en prop', async () => {
    await rendre({});

    expect(titreVu).toBeTruthy();
  });
});
