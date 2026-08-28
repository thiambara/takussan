import type { MetadataRoute } from 'next';

import { listerBiensDuSitemap } from '@/lib/queries/sitemap-catalogue';
import {
  RESSOURCES_DE_PROFIL,
  listerSlugsDeProfils,
} from '@/lib/queries/public-profiles';
import {
  PAGES_STATIQUES_INDEXABLES,
  type PageIndexable,
  type SourceDeSitemap,
  cheminDeFiche,
  cheminDeProfil,
  construireSitemap,
} from '@/lib/sitemap';

/**
 * `/sitemap.xml` — TCK-431.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * IL EST À LA RACINE ET NON SOUS `[locale]`, ET CE N'EST PAS UN OUBLI
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Un sitemap n'a pas de langue : il DÉCLARE les langues. Les trois versions de chaque page y
 * figurent côte à côte, chacune portant le jeu complet des `xhtml:link` (cf.
 * `entreesLocalisees`). Il est d'ailleurs hors du `matcher` de `src/proxy.ts` — comme
 * `robots.txt`, parce qu'il porte une extension — donc il ne serait de toute façon jamais
 * redirigé vers une langue.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * LA DÉGRADATION EST DÉLIBÉRÉE, ET ELLE N'EST PAS SILENCIEUSE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `https://api.takussan.com` rend **404** au 2026-08-27 (dette D-04, TCK-288) alors que
 * `www.takussan.com` sert le front en production. Faire ÉCHOUER la génération sur une API
 * injoignable reviendrait donc à bloquer le déploiement du front sur une panne connue et déjà
 * ticketée, du côté de l'infrastructure qu'aucun commit de ce dépôt ne peut corriger.
 *
 * Le sitemap sort alors avec ses seules pages statiques, et l'échec est ÉCRIT dans le journal du
 * build. C'est la seule dégradation admise ici, et elle est bornée à cette panne-là : une origine
 * absente ou malformée, un chemin non localisable, un dépassement de la limite de 50 000 URL font
 * tous échouer bruyamment (`src/lib/alternates.ts`, `src/lib/sitemap.ts`).
 *
 * ⚠ `revalidate` plutôt qu'un rendu statique : le catalogue bouge sans que le dépôt change, et un
 * sitemap figé au dernier déploiement vieillit exactement à la vitesse du catalogue.
 */
export const revalidate = 3600;

/**
 * Les sources d'URL, dans l'ordre du fichier produit — le point d'extension nommé par TCK-431.
 *
 * TCK-436 y a ajouté `agences` et `agents`, et remplacé les deux `source: null` correspondants
 * dans `ROUTES_DYNAMIQUES_PUBLIQUES` (`src/lib/sitemap.ts`) par ces noms. Le test de couverture le
 * tient : une route dynamique publique absente de cette table fait rougir.
 *
 * ⚠ **Chaque source échoue SÉPARÉMENT**, et c'est ce qui rend l'ajout sûr : la boucle ci-dessous
 * enveloppe chaque `pages()` dans son propre `try`. Une panne de l'index des agents retire ses URL
 * et nomme la source dans le journal ; elle ne fait perdre ni le catalogue de biens, ni les pages
 * statiques. *Trois sources dans un seul `try` n'en font qu'une.*
 */
const SOURCES: readonly SourceDeSitemap[] = [
  {
    nom: 'pages-statiques',
    pages: async () => PAGES_STATIQUES_INDEXABLES,
  },
  {
    nom: 'catalogue',
    pages: async () => {
      const biens = await listerBiensDuSitemap();
      return biens.map(
        (bien): PageIndexable => ({
          chemin: cheminDeFiche(bien.slug),
          ...(bien.updated_at ? { lastModified: bien.updated_at } : {}),
          changeFrequency: 'weekly',
          priority: 0.8,
        }),
      );
    },
  },
  // TCK-436 — les deux annuaires de profils. Leur source est l'endpoint d'INDEX, qui applique
  // déjà la règle d'éligibilité à la présence publique : un profil sans portefeuille publié, une
  // agence suspendue, un agent désactivé n'y sont pas, donc ils n'entrent pas ici non plus (AC6).
  //
  // ⚠ Aucun `lastModified` : l'index ne sert pas `updated_at`, et une date inventée est pire
  // qu'une date absente — un moteur la croit. `changeFrequency` est `weekly` : le portefeuille
  // d'un profil bouge, sa fiche moins souvent que le catalogue.
  ...(['agencies', 'agents'] as const).map(
    (ressource): SourceDeSitemap => ({
      nom: ressource === 'agencies' ? 'agences' : 'agents',
      pages: async () => {
        const slugs = await listerSlugsDeProfils(ressource);
        return slugs.map(
          (slug): PageIndexable => ({
            chemin: cheminDeProfil(RESSOURCES_DE_PROFIL[ressource].chemin, slug),
            changeFrequency: 'weekly',
            priority: 0.6,
          }),
        );
      },
    }),
  ),
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: PageIndexable[] = [];

  for (const source of SOURCES) {
    try {
      pages.push(...(await source.pages()));
    } catch (err) {
      // Nommer la source : « le sitemap est court » n'apprend rien, « la source `catalogue` a
      // échoué » dit où chercher.
      console.error(`[sitemap] source « ${source.nom} » indisponible — ses URL sont absentes.`, err);
    }
  }

  return construireSitemap(pages);
}
