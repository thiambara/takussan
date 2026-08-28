import type { MetadataRoute } from 'next';

import { LOCALES_INDEXABLES, SEGMENTS_NON_LOCALISES, cheminLocalise, estCheminLocalisable } from '@/i18n/routing';

import { ORIGINE_SITE, alternatesLangues } from './alternates';

/**
 * La forme du sitemap et de `robots.txt` — TCK-431.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE À CÔTÉ DE `src/app/sitemap.ts`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/app/sitemap.ts` est un fichier de MÉTADONNÉES du routeur : Next l'exécute, en tire un XML,
 * et il n'est ni importable ni instrumentable depuis un test sans monter tout le routeur. La forme
 * — quelles pages, quelles langues, quelles URL absolues, quelles limites — vit donc ici, en
 * fonctions pures, et `src/app/sitemap.ts` ne fait plus que chercher le catalogue et appeler.
 *
 * *Un sitemap qu'on ne peut éprouver que par un build est un sitemap qu'on n'éprouve pas.*
 */

/**
 * La limite dure du protocole : 50 000 `<url>` par fichier (sitemaps.org, § « Sitemap file »).
 * Au-delà, un moteur ignore le surplus — silencieusement.
 *
 * ⚠️ **Le dépassement ÉCHOUE, il ne tronque pas.** Une troncature rendrait un sitemap valide,
 * plus court, et parfaitement muet sur ce qu'il a laissé dehors : c'est exactement le mode de
 * défaillance que ce dépôt paie le plus cher. Le jour où le catalogue franchit la limite, la
 * réponse est de découper par `generateSitemaps()` de Next (un fichier par tranche + un index),
 * ce que la forme retenue ici accueille sans réécriture : {@link construireSitemap} prend une
 * liste de pages, et découper revient à lui en passer une tranche.
 */
export const LIMITE_URL_PAR_SITEMAP = 50_000;

/** Une page indexable, décrite par son chemin SANS langue. */
export type PageIndexable = {
  /** Chemin public sans préfixe de langue : `/`, `/properties`, `/properties/mon-slug`. */
  readonly chemin: string;
  readonly lastModified?: string | Date;
  readonly changeFrequency?: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  readonly priority?: number;
};

/**
 * Les pages STATIQUES du site public qui entrent dans le sitemap.
 *
 * ⚠️ **Cette liste est courte et écrite, et c'est un test qui la garde honnête** :
 * `src/lib/__tests__/sitemap-couverture.test.ts` marche l'arborescence de
 * `src/app/[locale]/(public)/` et exige l'équivalence — toute page statique qui ne déclare pas
 * `robots: { index: false }` doit être ici, et aucune de celles qui le déclarent ne peut y être.
 * Écrire une liste à la main est tenable exactement dans ce cas : quand une autre source la
 * contredit à chaque exécution.
 */
export const PAGES_STATIQUES_INDEXABLES: readonly PageIndexable[] = [
  { chemin: '/', changeFrequency: 'daily', priority: 1 },
  { chemin: '/properties', changeFrequency: 'hourly', priority: 0.9 },
  // TCK-436 — les deux index de profils. Ils n'ont pas été AJOUTÉS à cette liste par choix : le
  // test de couverture ci-dessous marche l'arborescence et exige que toute page statique publique
  // sans `robots: { index: false }` y figure. Les livrer sans les déclarer faisait rougir.
  { chemin: '/agencies', changeFrequency: 'daily', priority: 0.7 },
  { chemin: '/agents', changeFrequency: 'daily', priority: 0.7 },
];

/**
 * Les routes DYNAMIQUES du site public, et ce qui les alimente — **le point d'extension nommé.**
 *
 * Chaque route publique portant un segment dynamique doit apparaître ici, alimentée ou non. Le
 * test de couverture le vérifie : une fiche neuve ne peut pas rejoindre le catalogue public sans
 * que quelqu'un ait tranché si elle entre au sitemap. *Un `TODO` dans un commentaire n'est lu par
 * personne ; une entrée manquante dans cette table fait rougir.*
 *
 * `source: null` = délibérément absente du sitemap, avec le ticket qui la fera entrer.
 */
export const ROUTES_DYNAMIQUES_PUBLIQUES: Readonly<
  Record<string, { readonly source: string | null; readonly ticket?: string }>
> = {
  '/properties/[slug]': { source: 'catalogue' },
  // TCK-436 a livré `GET /api/public/agencies` et `GET /api/public/agents` — les deux
  // énumérations qui manquaient. Elles ne servent pas seulement les pages d'index : elles SONT la
  // définition de « profil éligible à la présence publique », appliquée une seule fois côté
  // serveur. Le sitemap les pagine, il ne rejuge rien — un sitemap qui réécrirait la condition
  // divergerait de l'index le jour où l'une des deux bouge, et annoncerait des URL rendant 404.
  '/agencies/[slug]': { source: 'agences' },
  '/agents/[slug]': { source: 'agents' },
};

/**
 * Une source d'URL du sitemap. TCK-436 en ajoute deux (agences, agents) sans toucher au reste :
 * il écrit sa fonction, la range dans le tableau de `src/app/sitemap.ts`, et remplace `source:
 * null` par son nom dans {@link ROUTES_DYNAMIQUES_PUBLIQUES}.
 */
export type SourceDeSitemap = {
  readonly nom: string;
  readonly pages: () => Promise<readonly PageIndexable[]>;
};

/**
 * Le chemin d'une fiche de bien, slug ENCODÉ.
 *
 * ⚠ L'encodage n'est pas décoratif. Next sérialise le sitemap sans échapper quoi que ce soit —
 * mesuré dans `node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js` :
 * `content += \`<loc>${item.url}</loc>\``, interpolation nue. Un `&` dans un slug produirait donc
 * un XML **invalide**, c'est-à-dire un sitemap entier rejeté à cause d'une seule fiche.
 * `encodeURIComponent` le rend `%26`, ce qui est à la fois l'URL juste et du XML valide.
 */
export function cheminDeFiche(slug: string): string {
  return `/properties/${encodeURIComponent(slug)}`;
}

/**
 * Le chemin d'une fiche de PROFIL, slug ENCODÉ — TCK-436.
 *
 * Même encodage et même raison que {@link cheminDeFiche} : Next interpole le `<loc>` sans rien
 * échapper, et un `&` dans un slug rendrait le sitemap ENTIER invalide. Le risque est réel ici :
 * le slug d'un agent est son `username`, une chaîne saisie par l'utilisateur.
 *
 * `base` est `/agencies` ou `/agents` — écrit une seule fois, dans
 * `src/lib/queries/public-profiles.ts`.
 */
export function cheminDeProfil(base: string, slug: string): string {
  return `${base}/${encodeURIComponent(slug)}`;
}

/**
 * Une URL absolue sur l'origine du site — et le point qui refuse de rendre autre chose.
 *
 * AC5 de TCK-431 : *« un sitemap contenant des URL relatives ou `undefined` fait rougir »*. Il ne
 * suffit pas que l'origine soit valide au démarrage ; il faut que RIEN, dans la chaîne qui va du
 * catalogue au `<loc>`, ne puisse produire autre chose qu'une URL absolue. Un slug vide, un chemin
 * sans barre initiale, une interpolation d'`undefined` : tous meurent ici, en nommant la variable.
 */
export function absolu(chemin: string): string {
  if (!chemin.startsWith('/')) {
    throw new Error(
      `Chemin de sitemap « ${chemin} » : attendu un chemin absolu commençant par « / ». ` +
        `Une URL relative dans un <loc> est ignorée par les moteurs.`,
    );
  }

  const url = `${ORIGINE_SITE}${chemin}`;
  if (!/^https?:\/\/[^/]+\//.test(url) || url.includes('undefined')) {
    throw new Error(
      `URL de sitemap non absolue ou incomplète : « ${url} ». Vérifier NEXT_PUBLIC_SITE_URL.`,
    );
  }

  return url;
}

/**
 * Les entrées `<url>` d'une page : **une par langue**, chacune déclarant les trois alternatives.
 *
 * C'est la forme que Google demande pour un site multilingue — chaque version linguistique est une
 * URL à part entière, et chacune répète le jeu complet des `xhtml:link`. Une seule entrée portant
 * trois alternatives laisserait deux des trois URL hors du sitemap.
 *
 * ⚠ Le garde-fou `estCheminLocalisable` est écrit ICI, en plus de celui d'`alternatesLangues` :
 * une source qui rendrait par erreur un chemin de console (`/app/…`) ferait sinon échouer la
 * génération avec le message d'`alternatesLangues`, qui parle de `hreflang` et non de sitemap.
 */
export function entreesLocalisees(page: PageIndexable): MetadataRoute.Sitemap {
  if (!estCheminLocalisable(page.chemin)) {
    throw new Error(
      `« ${page.chemin} » n'appartient pas à la surface publique localisée et n'a rien à faire ` +
        `dans le sitemap (segments non localisés : ${SEGMENTS_NON_LOCALISES.join(', ')}).`,
    );
  }

  const { languages } = alternatesLangues(page.chemin);

  return LOCALES_INDEXABLES.map((locale) => ({
    url: absolu(cheminLocalise(page.chemin, locale)),
    alternates: { languages: languages as Record<string, string> },
    ...(page.lastModified !== undefined ? { lastModified: page.lastModified } : {}),
    ...(page.changeFrequency !== undefined ? { changeFrequency: page.changeFrequency } : {}),
    ...(page.priority !== undefined ? { priority: page.priority } : {}),
  }));
}

/**
 * Sépare les pages que le sitemap peut LOCALISER de celles qu'il ne peut pas — TCK-436, passe 2.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE FONCTION EXISTE POUR EMPÊCHER, ET QUI EST ARRIVÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `/sitemap.xml` est passé de 200 à **500, zéro octet** dès que les profils y sont entrés. La
 * cause : quatre agents éligibles RÉELS portent un `username` contenant un point
 * (`owner.agency1` à `owner.agency4`), et {@link estCheminLocalisable} refuse tout chemin dont le
 * dernier segment ressemble à une extension de fichier. {@link entreesLocalisees} lève alors, et
 * comme {@link construireSitemap} traite la liste ENTIÈRE, **une seule URL de profil emportait le
 * catalogue de biens et les pages statiques avec elle**.
 *
 * ⚠ Le docblock de `src/app/sitemap.ts` affirmait « chaque source échoue SÉPARÉMENT ». **C'était
 * faux**, et précisément pour ce cas : le `try` par source couvre l'obtention des pages, pas leur
 * mise en forme. *Une isolation qui s'arrête avant l'étape qui lève n'isole rien.*
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI ÉCARTER PLUTÔT QUE CORRIGER LE PRÉDICAT
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `estCheminLocalisable` refuse une extension finale pour une raison qui tient : c'est ce qui
 * empêche `/robots.txt`, `/sitemap.xml`, `/favicon.ico` d'être préfixés d'une langue par
 * `src/proxy.ts`. Mesuré : les quatre rendent `false`, comme les slugs pointés. Le prédicat ne
 * sait pas distinguer les deux familles, et le relâcher depuis ici toucherait le proxy, les
 * `hreflang` et le routage — bien au-delà de ce ticket.
 *
 * ⚠ **Le vrai défaut est en amont et il n'est pas de ce commit.** La FICHE `/agents/<slug>`
 * appelle `alternatesPubliques` dans son `generateMetadata`, qui lève sur ces mêmes chemins.
 * Mesuré le 2026-08-28 sur un serveur réel — et le résultat n'est pas celui qu'on déduit du
 * code :
 *
 *     /fr/agents/owner.agency1        → 200,  <title> absent,  canonical absente
 *     /fr/agents/thies-properties-owner-1 → 200,  <title> présent, canonical présente
 *
 * Next n'échoue donc PAS sur une exception de `generateMetadata` : il sert la page et **jette
 * ses métadonnées en silence**. La trace ne vit que dans le journal du serveur. *Un défaut qui
 * rend 200 et perd son titre est plus cher qu'un 500 : rien ne le signale.* Écarter ces pages du
 * sitemap reste juste — on n'annonce pas une URL sans titre ni canonique — mais c'est un
 * pansement sur un défaut qui vit ailleurs (TCK-434 / TCK-433), et le journal le nomme.
 *
 * ⚠ J'avais d'abord écrit « la fiche rend 500 », déduit du fait qu'`alternatesLangues` lève.
 * C'était une déduction, pas une mesure, et elle était fausse.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * L'EXCLUSION EST NOMMÉE, JAMAIS SILENCIEUSE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'appelant journalise ce qui sort. C'est la même règle que {@link LIMITE_URL_PAR_SITEMAP} :
 * *un sitemap raccourci en silence est valide, plus court, et parfaitement muet sur ce qu'il
 * laisse dehors.*
 *
 * ⚠ Le prédicat employé ici est **le même appel** que celui d'`entreesLocalisees`, pas une copie :
 * une seconde condition écrite à la main divergerait, et la divergence rendrait soit un 500 (une
 * page passe le filtre et fait lever la mise en forme), soit une exclusion muette.
 */
export function partitionnerPagesLocalisables(pages: readonly PageIndexable[]): {
  readonly retenues: readonly PageIndexable[];
  readonly ecartees: readonly PageIndexable[];
} {
  const retenues: PageIndexable[] = [];
  const ecartees: PageIndexable[] = [];

  for (const page of pages) {
    (estCheminLocalisable(page.chemin) ? retenues : ecartees).push(page);
  }

  return { retenues, ecartees };
}

/** Le sitemap complet, une page devenant {@link LOCALES_INDEXABLES}`.length` entrées. */
export function construireSitemap(pages: readonly PageIndexable[]): MetadataRoute.Sitemap {
  const entrees = pages.flatMap(entreesLocalisees);

  if (entrees.length > LIMITE_URL_PAR_SITEMAP) {
    throw new Error(
      `Le sitemap porte ${entrees.length} URL pour une limite de ${LIMITE_URL_PAR_SITEMAP} ` +
        `(${pages.length} pages × ${LOCALES_INDEXABLES.length} langues). Découper par ` +
        `generateSitemaps() plutôt que tronquer : un sitemap tronqué est valide, plus court, et ` +
        `muet sur ce qu'il laisse dehors.`,
    );
  }

  return entrees;
}

/**
 * Les segments servis aux robots bien qu'ils ne portent pas de langue.
 *
 * ⚠️ **Ne JAMAIS interdire `/_next`.** Ce sont le CSS et le JS du site : un moteur qui ne peut
 * pas les charger rend la page sans style ni contenu hydraté et juge ce qu'il voit. C'est la
 * raison pour laquelle {@link CHEMINS_INTERDITS_AUX_ROBOTS} se dérive de
 * {@link SEGMENTS_NON_LOCALISES} par SOUSTRACTION explicite plutôt que par recopie : la liste des
 * surfaces internes vit à un seul endroit (`src/i18n/routing.ts`), et l'exception est nommée.
 */
export const SEGMENTS_SERVIS_AUX_ROBOTS: readonly string[] = ['_next', '_vercel'];

/**
 * Ce que `robots.txt` interdit — dérivé de {@link SEGMENTS_NON_LOCALISES}, jamais recopié.
 *
 * Sans barre finale, délibérément : `Disallow: /app` interdit `/app` ET tout ce qui commence par
 * `/app`, là où `Disallow: /app/` laisserait `/app` lui-même explorable. Aucune surface publique
 * ne commence par l'un de ces préfixes — les chemins publics sont tous `/<langue>/…`.
 */
export const CHEMINS_INTERDITS_AUX_ROBOTS: readonly string[] = SEGMENTS_NON_LOCALISES.filter(
  (segment) => !SEGMENTS_SERVIS_AUX_ROBOTS.includes(segment),
).map((segment) => `/${segment}`);
