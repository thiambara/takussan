import type { Locale } from '@/i18n/config';

import { ORIGINE_SITE } from './alternates';
import { type NoeudJsonLd, urlAbsolue } from './jsonld';

/**
 * L'identité du site — `Organization` et `WebSite`, TCK-435.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * ÉMIS UNE SEULE FOIS PAR PAGE, DEPUIS LE LAYOUT DU GROUPE PUBLIC (AC5)
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le point d'émission est `src/app/[locale]/(public)/layout.tsx`, et il est unique. Poser ces deux
 * nœuds dans un composant partagé — un `Navbar`, un `Footer` — les dupliquerait sur toute page qui
 * en monte deux, et c'est précisément le mode de défaillance que l'AC5 nomme. Un layout est rendu
 * exactement une fois par page ; c'est la seule structure qui le garantisse sans convention.
 *
 * ⚠️ **Rien ici n'est inventé.** Pas de `logo` : `takussan-web/public/` ne porte aucun logo au
 * 2026-08-27 (cinq SVG hérités de `create-next-app`), et un `logo` pointant une image absente est
 * une affirmation fausse de plus. Pas de `sameAs` non plus — le dépôt ne connaît aucun compte
 * social vérifié. Ils s'ajouteront le jour où l'un ou l'autre existera.
 */

/** Le nom de la marque. Un nom propre ne se traduit pas — il est le même dans les trois langues. */
export const NOM_DU_SITE = 'Takussan';

export function jsonLdOrganisation(locale: Locale): NoeudJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    // `@id` STABLE et sans langue : c'est la MÊME organisation sur `/fr`, `/en` et `/wo`. Le
    // préfixer par la langue en déclarerait trois.
    '@id': `${ORIGINE_SITE}/#organisation`,
    name: NOM_DU_SITE,
    url: urlAbsolue('/', locale),
  };
}

export function jsonLdSiteWeb(locale: Locale): NoeudJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    // Un `@id` PAR LANGUE, à l'inverse de l'organisation : trois sites de langue distincts,
    // servis sur trois chemins distincts, dont les `hreflang` disent qu'ils se correspondent.
    '@id': `${urlAbsolue('/', locale)}#site`,
    name: NOM_DU_SITE,
    url: urlAbsolue('/', locale),
    inLanguage: locale,
    publisher: { '@id': `${ORIGINE_SITE}/#organisation` },
    // La recherche du site. La cible est une URL RÉELLE : `/properties?q=…` est exactement ce
    // que `SEARCH_FILTER_KEYS.q` lit (`src/types/search.ts`). Déclarer une action que le site ne
    // sert pas serait la même faute que déclarer une note inexistante.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${urlAbsolue('/properties', locale)}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}
