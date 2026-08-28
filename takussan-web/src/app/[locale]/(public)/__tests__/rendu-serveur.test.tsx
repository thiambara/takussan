import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import { createTranslator, NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/ui/toast';
import React from 'react';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import wo from '@/messages/wo.json';
import { TIMEZONE, type Locale } from '@/i18n/config';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-432 · AC1, AC2, AC3 — **ce que le SERVEUR met dans le HTML**, pour les deux surfaces
 * d'entrée du site.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI `renderToStaticMarkup` ET NON `render` DE TESTING-LIBRARY
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'AC1 le demande en toutes lettres : *« le test s'exécute sans hydratation ; un test qui monte le
 * composant client et attend l'effet cocherait la case sans rien prouver »*. C'est exactement ce
 * qui arriverait avec `render()` : il monte, exécute les `useEffect`, résout les promesses — et le
 * DOM finirait par contenir les biens **par le chemin d'avant TCK-432**, celui qu'on est censé
 * remplacer. Le test serait vert sur le code non corrigé.
 *
 * Le rendu se fait donc **en flux**, par `renderToReadableStream` — le renderer que Next emploie
 * réellement — et le test lit le flux ENTIER, comme un `curl` lit un corps de réponse entier.
 *
 * ⚠️ **`renderToStaticMarkup` a été essayé d'abord, et il ment ici.** Il ne sait pas résoudre une
 * frontière de suspension : il rend le REPLI. Sur `/properties`, qui est enveloppée d'un
 * `<Suspense>` (TCK-335), il rendait donc le squelette et rien d'autre — un test qui aurait
 * conclu « les biens ne sont pas dans le HTML » alors que le serveur de développement, mesuré à
 * la même minute, en servait 27. *Un renderer qui rend le repli ne mesure pas le rendu.*
 *
 * Aucun des deux renderers n'exécute d'effet : c'est la propriété que l'AC1 exige, et elle est
 * intacte. Tout ce qui apparaît dans le flux y est arrivé pendant le rendu, donc par la prop semée
 * par le composant serveur.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI LE DOUBLE EST POSÉ SUR `apiFetch` ET NON SUR LES MODULES DE REQUÊTE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Doubler `@/lib/queries/public-search` rendrait le test vert par construction : le sujet
 * recevrait tout cuit ce qu'on prétend mesurer, et **`parametresDeRecherche` ne serait jamais
 * exécutée** — c'est-à-dire que l'AC2, « le filtre est bien transmis », ne serait pas éprouvée du
 * tout. C'est l'un des quatre verts qui ne prouvent rien.
 *
 * Le double est donc à la **frontière du réseau**. Tout ce qui est entre la page et lui — la
 * lecture des `searchParams`, la normalisation géographique, l'alias `search=`→`q=`, le `per_page`,
 * la mémoïsation — est du code réel. Et il **enregistre les URL demandées**, ce qui est la mesure
 * de l'AC2 : le filtre est dans la requête, ou il n'y est pas.
 */

// ── Dictionnaires ─────────────────────────────────────────────────────────────

const DICTIONNAIRES: Record<Locale, Record<string, unknown>> = {
  fr: fr as Record<string, unknown>,
  en: en as Record<string, unknown>,
  wo: wo as Record<string, unknown>,
};

/** Même deep-merge qu'en production (`src/i18n/request.ts`) : `fr` sert de repli sous les autres. */
function fusionne(base: Record<string, unknown>, surcharge: Record<string, unknown>) {
  const sortie = { ...base };
  for (const [cle, valeur] of Object.entries(surcharge)) {
    const existant = sortie[cle];
    sortie[cle] =
      valeur && typeof valeur === 'object' && !Array.isArray(valeur) &&
      existant && typeof existant === 'object' && !Array.isArray(existant)
        ? fusionne(existant as Record<string, unknown>, valeur as Record<string, unknown>)
        : valeur;
  }
  return sortie;
}

let localeCourante: Locale = 'fr';

const messagesDeLaLocale = () =>
  localeCourante === 'fr'
    ? DICTIONNAIRES.fr
    : fusionne(DICTIONNAIRES.fr, DICTIONNAIRES[localeCourante]);

vi.mock('next-intl/server', () => ({
  getLocale: async () => localeCourante,
  getTranslations: async (namespace?: string) =>
    createTranslator({
      locale: localeCourante,
      messages: messagesDeLaLocale() as never,
      namespace: namespace as never,
      timeZone: TIMEZONE,
    }),
}));

// ── La frontière réseau ───────────────────────────────────────────────────────

/** Toutes les URL passées à `apiFetch`, dans l'ordre. C'est la mesure de l'AC2. */
const urlsDemandees: string[] = [];
let reponsePour: (url: string) => unknown = () => {
  throw new Error('aucune réponse configurée');
};

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiFetch: vi.fn(async (path: string) => {
      urlsDemandees.push(path);
      return reponsePour(path);
    }),
  };
});

// ── `useSearchParams` : le composant client le lit pendant le rendu serveur ───

let parametresCourants = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => parametresCourants,
  usePathname: () => '/properties',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function bien(id: number, titre: string, slug: string, type = 'villa'): PropertyListItem {
  return {
    id,
    title: titre,
    slug,
    price: 100_000,
    currency: 'XOF',
    type: type as PropertyListItem['type'],
    contract_type: 'rent',
    rent_period: 'monthly',
    bedrooms: 3,
    bathrooms: 2,
    area: 120,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: null,
    created_at: '2026-01-01',
    location: { quarter: null, city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
    reference_number: 'REF',
    status: null,
    visibility: null,
  } as PropertyListItem;
}

/**
 * ⚠ Les titres sont des chaînes qu'on ne peut PAS confondre avec autre chose de la page.
 * « Villa » apparaîtrait dans le `<h1>` d'une page filtrée, dans le panneau de filtres et dans le
 * `<title>` : un test qui la chercherait passerait sur une page sans le moindre bien.
 */
const VILLA_A = bien(1, 'Zanzibar Onyx à Ngor', 'zanzibar-onyx-a-ngor-Ab12Cd');
const VILLA_B = bien(2, 'Quetzal Vermillon à Saly', 'quetzal-vermillon-a-saly-Ef34Gh');
const APPART = bien(3, 'Kalimba Turquoise à Pikine', 'kalimba-turquoise-a-pikine-Ij56Kl', 'apartment');

const RESULTAT_VILLA = {
  data: [VILLA_A, VILLA_B],
  facets: {},
  meta: { current_page: 1, last_page: 1, per_page: 30, total: 2 },
};

const RANGEES = {
  data: {
    near: { items: [VILLA_A], city: 'Dakar', requested_city: null, fallback: false },
    rent: { items: [VILLA_B] },
    featured: { items: [APPART] },
    latest: { items: [VILLA_A] },
  },
  meta: { per_row: 12 },
};

// ── Sujets ────────────────────────────────────────────────────────────────────

const { default: PageDeLaListe } = await import('../properties/(liste)/page');
const { default: PageDAccueil } = await import('../page');

/**
 * Rend un composant serveur `async` **en HTML**, sans hydratation et sans effet.
 *
 * Le `NextIntlClientProvider` est indispensable : les composants clients de l'arbre appellent
 * `useTranslations`, qui lit un contexte que le serveur Next fournit en production et que le test
 * doit fournir ici. Il est alimenté par les VRAIS dictionnaires — un libellé absent fait donc
 * rougir plutôt que de rendre sa clé.
 */
/** Ce que React a signalé pendant le dernier rendu — vide sur un rendu sain. */
const erreursDeRendu: Error[] = [];

async function html(element: Promise<React.ReactElement> | React.ReactElement): Promise<string> {
  // ⚠ Les deux fournisseurs ne sont PAS des contournements : ce sont ceux que le layout racine
  // pose en production. La navbar publique porte `SearchAutocomplete` (react-query) et la carte de
  // bien porte `CompareToggleButton` (toasts de Base UI). Sans eux on mesurerait l'absence du
  // layout et non le rendu de la page — et le manque est SILENCIEUX : l'erreur est avalée par la
  // frontière de suspension, qui rend son repli. C'est ce qui est arrivé pendant l'écriture de ce
  // fichier, et c'est le `onError` du flux qui l'a nommé, pas l'assertion.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  const flux = await renderToReadableStream(
    <QueryClientProvider client={client}>
      <ToastProvider>
      <NextIntlClientProvider
        locale={localeCourante}
        messages={messagesDeLaLocale() as never}
        timeZone={TIMEZONE}
      >
        {await element}
      </NextIntlClientProvider>
      </ToastProvider>
    </QueryClientProvider>,
    {
      // ⚠ Une erreur levée SOUS une frontière de suspension ne fait pas échouer le rendu : React
      // émet le repli et continue. Sans ce relais, un défaut de plomberie de test se lit comme
      // « le serveur ne rend pas les biens » — c'est-à-dire comme un défaut du CODE.
      onError: (erreur: unknown) => {
        erreursDeRendu.push(erreur instanceof Error ? erreur : new Error(String(erreur)));
      },
    },
  );

  // `allReady` : on lit le corps ENTIER, y compris ce qui arrive après le repli de suspension —
  // exactement ce qu'un `curl` et un explorateur reçoivent. Lire seulement le premier morceau
  // mesurerait la coque, pas la page.
  await flux.allReady;

  const decodeur = new TextDecoder();
  const lecteur = flux.getReader();
  let markup = '';
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    markup += decodeur.decode(value, { stream: true });
  }
  const complet = markup + decodeur.decode();

  // ⚠ **La garde qui rend ce fichier lisible en cas de panne.** Une erreur sous la frontière de
  // suspension est avalée : React rend le repli et le test échoue plus loin, sur une assertion de
  // contenu, en accusant le code de la page. Ici elle est nommée à l'endroit où elle est arrivée.
  if (erreursDeRendu.length > 0) {
    throw new Error(
      `le rendu serveur a signalé ${erreursDeRendu.length} erreur(s) — la première : ` +
        `${erreursDeRendu[0].message}`,
    );
  }

  return complet;
}

const compteDeH1 = (markup: string) => (markup.match(/<h1[\s>]/g) ?? []).length;

/** Les slugs de fiche réellement liés par le HTML — pas les `<link>` de la tête. */
const slugsLies = (markup: string) => [
  ...new Set(
    [...markup.matchAll(/<a [^>]*href="[^"]*\/properties\/([A-Za-z0-9][A-Za-z0-9-]*)"/g)].map(
      (m) => m[1],
    ),
  ),
];

beforeEach(() => {
  localeCourante = 'fr';
  urlsDemandees.length = 0;
  erreursDeRendu.length = 0;
  parametresCourants = new URLSearchParams();
});

// ── AC1 — l'accueil ───────────────────────────────────────────────────────────

describe('TCK-432 · AC1 — l’accueil porte des biens dans le HTML du serveur', () => {
  beforeEach(() => {
    reponsePour = () => RANGEES;
  });

  it('rend le titre d’au moins un bien et un lien vers sa fiche, sans hydratation', async () => {
    const markup = await html(PageDAccueil());

    expect(markup).toContain(VILLA_A.title);
    expect(slugsLies(markup)).toContain(VILLA_A.slug);
  });

  it('demande les quatre rangées SANS ville — le serveur n’attend aucun fournisseur tiers', async () => {
    await html(PageDAccueil());

    // ⚠ La mesure porte sur ce que le RÉSEAU a reçu, pas sur ce que la page affiche : c'est la
    // seule façon de distinguer « le serveur a demandé sans ville » de « le serveur a attendu ».
    expect(urlsDemandees).toHaveLength(1);
    expect(urlsDemandees[0]).toContain('/public/properties/discovery');
    expect(urlsDemandees[0]).not.toContain('near_city');
  });

  it('reste servable quand l’API tombe — et ne prétend alors rien afficher', async () => {
    reponsePour = () => {
      throw new Error('API éteinte');
    };
    const markup = await html(PageDAccueil());

    // La page existe, son titre aussi ; les biens, eux, ne sont pas inventés.
    expect(compteDeH1(markup)).toBe(1);
    expect(slugsLies(markup)).toHaveLength(0);
  });
});

// ── AC2 — la liste, filtres compris ───────────────────────────────────────────

describe('TCK-432 · AC2 — `/properties?type=villa` porte les biens du FILTRE', () => {
  beforeEach(() => {
    reponsePour = () => RESULTAT_VILLA;
  });

  it('rend les biens de la recherche courante et leurs liens', async () => {
    parametresCourants = new URLSearchParams('type=villa');
    const markup = await html(
      PageDeLaListe({ searchParams: Promise.resolve({ type: 'villa' }) }),
    );

    expect(markup).toContain(VILLA_A.title);
    expect(markup).toContain(VILLA_B.title);
    expect(slugsLies(markup)).toEqual(
      expect.arrayContaining([VILLA_A.slug, VILLA_B.slug]),
    );
  });

  it('transmet le filtre au serveur — un rendu qui servirait le catalogue entier échouerait ici', async () => {
    parametresCourants = new URLSearchParams('type=villa');
    await html(PageDeLaListe({ searchParams: Promise.resolve({ type: 'villa' }) }));

    const recherche = urlsDemandees.find((u) => u.includes('/public/properties/search'));
    expect(recherche).toBeDefined();
    expect(new URLSearchParams(recherche!.split('?')[1]).get('type')).toBe('villa');
  });

  it('applique la MÊME construction de requête que le client — `search=` devient `q=`, `per_page` est posé', async () => {
    // ⚠ Ce cas éprouve `parametresDeRecherche` PAR LA PAGE, et pas en la testant à côté : c'est
    // ce qui prouve que la page l'emprunte réellement plutôt que d'écrire sa propre traduction.
    parametresCourants = new URLSearchParams('search=villa+piscine');
    await html(
      PageDeLaListe({ searchParams: Promise.resolve({ search: 'villa piscine' }) }),
    );

    const recherche = new URLSearchParams(
      urlsDemandees.find((u) => u.includes('/public/properties/search'))!.split('?')[1],
    );
    expect(recherche.get('q')).toBe('villa piscine');
    expect(recherche.get('per_page')).toBe('30');
  });

  it('efface la demi-coordonnée que le serveur rendrait en 422 (TCK-346), comme le client', async () => {
    parametresCourants = new URLSearchParams('lat=14.69&sort=distance');
    await html(
      PageDeLaListe({ searchParams: Promise.resolve({ lat: '14.69', sort: 'distance' }) }),
    );

    const recherche = new URLSearchParams(
      urlsDemandees.find((u) => u.includes('/public/properties/search'))!.split('?')[1],
    );
    expect(recherche.has('lat')).toBe(false);
    expect(recherche.get('sort')).toBeNull();
  });
});

// ── AC3 — un `<h1>`, un seul, non vide, du dictionnaire ───────────────────────

describe('TCK-432 · AC3 — exactement un `<h1>` par page, issu du dictionnaire', () => {
  it('l’accueil en porte un seul, non vide, et c’est le libellé du dictionnaire', async () => {
    reponsePour = () => RANGEES;
    const markup = await html(PageDAccueil());

    expect(compteDeH1(markup)).toBe(1);
    expect(markup).toContain(`>${fr.homepage.h1}<`);
  });

  it('la liste en porte un seul, non vide, DÉRIVÉ des filtres', async () => {
    reponsePour = () => RESULTAT_VILLA;
    parametresCourants = new URLSearchParams('type=villa&contract_type=rent&city=Dakar');
    const markup = await html(
      PageDeLaListe({
        searchParams: Promise.resolve({ type: 'villa', contract_type: 'rent', city: 'Dakar' }),
      }),
    );

    expect(compteDeH1(markup)).toBe(1);
    // Le libellé composé par les gabarits ICU réels — pas une concaténation du test.
    expect(markup).toContain('>Villa à louer à Dakar<');
  });

  it('les deux `<h1>` suivent la langue servie, dans les trois', async () => {
    for (const locale of ['fr', 'en', 'wo'] as const) {
      localeCourante = locale;
      urlsDemandees.length = 0;

      reponsePour = () => RANGEES;
      const accueil = await html(PageDAccueil());
      expect(compteDeH1(accueil)).toBe(1);
      expect(accueil).toContain(`>${DICTIONNAIRES[locale].homepage ? (DICTIONNAIRES[locale] as typeof fr).homepage.h1 : ''}<`);

      reponsePour = () => RESULTAT_VILLA;
      parametresCourants = new URLSearchParams();
      const liste = await html(PageDeLaListe({ searchParams: Promise.resolve({}) }));
      expect(compteDeH1(liste)).toBe(1);
      expect(liste).toContain(`>${(DICTIONNAIRES[locale] as typeof fr).meta.properties.title}<`);
    }
  });

  it('n’émet AUCUN `<h1>` plutôt qu’un `<h1>` vide quand le titre manque', async () => {
    // Un `<h1></h1>` est pire que pas de `<h1>` : un lecteur d'écran annonce un titre de niveau 1
    // sans contenu. C'est ce que garde `titre?.trim()` dans `PropertiesDiscoveryPage`.
    reponsePour = () => RESULTAT_VILLA;
    const { PropertiesDiscoveryPage } = await import('@/components/property/PropertiesDiscoveryPage');
    const markup = await html(
      <PropertiesDiscoveryPage
        titre="   "
        graine={{ resultat: RESULTAT_VILLA as never, clef: 'per_page=30' }}
      />,
    );

    // ⚠ La page doit avoir RÉELLEMENT rendu : sans cette borne, un arbre qui n'aurait rien rendu
    // du tout compterait lui aussi zéro `<h1>` et le test serait vert sur une page absente.
    expect(markup).toContain(VILLA_A.title);
    expect(compteDeH1(markup)).toBe(0);
  });
});
