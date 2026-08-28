import type { Locale } from '@/i18n/config';

import { type NoeudJsonLd, sansVides, urlAbsolue } from './jsonld';

/**
 * Données structurées des profils publics — agence et agent (TCK-435).
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * `RealEstateAgent` DES DEUX CÔTÉS, ET `Person` ÉCARTÉ POUR UNE RAISON PRÉCISE
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le réflexe, pour la fiche d'un agent, serait `Person` — c'en est une. Il est écarté parce que
 * **`aggregateRating` n'est pas dans le domaine de `Person`** : schema.org l'attache à
 * `Organization`, `Place`, `Service`, `Brand`, `CreativeWork`, `Event`, `Offer` et `Product`, pas
 * aux personnes. Un nœud `Person` ne pourrait donc pas porter la note que la page AFFICHE
 * (`ReviewsSection`), et le balisage cesserait de dire ce que la page dit — ce qui est la
 * contrainte centrale de ce ticket.
 *
 * `RealEstateAgent` est un sous-type de `LocalBusiness`, donc d'`Organization` : il porte la note,
 * et il décrit ce qu'un agent immobilier indépendant est du point de vue d'un visiteur — un
 * prestataire qu'on contacte. L'agence l'emploie aussi, avec `parentOrganization` reliant l'agent
 * à la sienne quand il en a une.
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUI N'EST JAMAIS ÉMIS
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * · **`aggregateRating` sur zéro avis.** `ratingValue: 0` sur `reviewCount: 0` n'est pas une note
 *   basse, c'est une affirmation fausse — et une cause connue d'action manuelle. La clé entière
 *   est absente tant que `reviews.count` n'est pas strictement positif ET que la moyenne existe.
 * · **Une adresse de courriel d'agent.** TCK-441 a retiré de la charge publique l'adresse de
 *   CONNEXION d'un agent ; l'API ne la sert plus. Le balisage ne peut donc pas l'élargir, et le
 *   type d'entrée ci-dessous n'en porte simplement pas de champ — c'est une garde de typage, pas
 *   une intention.
 * · **Un champ que la page ne rend pas.** Le `telephone` est émis parce que les deux fiches
 *   publient un lien `tel:` (`ContactSheet`) ; il ne serait pas émis autrement.
 */

/** Une note agrégée, telle que l'API la sert et telle que `ReviewsSection` l'affiche. */
export type AvisPublics = {
  readonly average: number | null;
  readonly count: number;
};

/**
 * `aggregateRating`, ou RIEN.
 *
 * Les deux conditions sont nécessaires : un compte nul rend la note vide de sens, et une moyenne
 * nulle sur un compte positif est un état que l'API peut servir (avis sans note). Dans les deux
 * cas la bonne réponse est de ne rien affirmer.
 */
function noteAgregee(avis: AvisPublics | undefined): NoeudJsonLd | undefined {
  if (!avis || avis.count <= 0 || avis.average === null || avis.average === undefined) {
    return undefined;
  }

  return {
    '@type': 'AggregateRating',
    ratingValue: avis.average,
    reviewCount: avis.count,
    // Bornes explicites : sans elles, un moteur suppose /5, ce qui est vrai ici mais deviendrait
    // faux en silence le jour où l'échelle change.
    bestRating: 5,
    worstRating: 1,
  };
}

export type AgencePubliee = {
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null;
  readonly license_number?: string | null;
  /** Adresse d'ENTREPRISE, publiée délibérément — jamais celle d'un utilisateur (TCK-441). */
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly city?: string | null;
  readonly logo_url?: string | null;
  readonly reviews?: AvisPublics;
};

export function jsonLdAgence(agence: AgencePubliee, locale: Locale): NoeudJsonLd {
  const url = urlAbsolue(`/agencies/${encodeURIComponent(agence.slug)}`, locale);

  return sansVides({
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': url,
    name: agence.name,
    url,
    description: agence.description ?? undefined,
    image: agence.logo_url ?? undefined,
    logo: agence.logo_url ?? undefined,
    email: agence.email ?? undefined,
    telephone: agence.phone ?? undefined,
    // ⚠ La VILLE seule, parce que c'est la seule composante d'adresse que l'API sert et que la
    // page affiche. Un `PostalAddress` sans `addressLocality` serait un objet vide ; en inventer
    // une rue serait pire.
    address: agence.city
      ? { '@type': 'PostalAddress', addressLocality: agence.city, addressCountry: 'SN' }
      : undefined,
    // Le numéro de licence est affiché sur la fiche, sous l'icône de vérification.
    identifier: agence.license_number ?? undefined,
    aggregateRating: noteAgregee(agence.reviews),
  });
}

export type AgentPublie = {
  readonly slug: string;
  readonly full_name: string;
  readonly bio?: string | null;
  /** ⚠ Aucun champ `email` — cf. l'en-tête et TCK-441. */
  readonly phone?: string | null;
  readonly city?: string | null;
  readonly specialty?: string | null;
  readonly avatar_url?: string | null;
  readonly agency?: { readonly name: string; readonly slug: string } | null;
  readonly reviews?: AvisPublics;
};

export function jsonLdAgent(agent: AgentPublie, locale: Locale): NoeudJsonLd {
  const url = urlAbsolue(`/agents/${encodeURIComponent(agent.slug)}`, locale);

  return sansVides({
    '@context': 'https://schema.org',
    '@type': 'RealEstateAgent',
    '@id': url,
    name: agent.full_name,
    url,
    description: agent.bio ?? undefined,
    image: agent.avatar_url ?? undefined,
    telephone: agent.phone ?? undefined,
    // La spécialité est affichée dans le bandeau d'en-tête, à côté de la ville.
    knowsAbout: agent.specialty ?? undefined,
    address: agent.city
      ? { '@type': 'PostalAddress', addressLocality: agent.city, addressCountry: 'SN' }
      : undefined,
    // `parentOrganization` et non `worksFor` : ce dernier est une propriété de `Person`, et le
    // nœud est un `LocalBusiness`. La fiche affiche bien « agent chez <agence> », avec un lien.
    parentOrganization: agent.agency
      ? {
          '@type': 'RealEstateAgent',
          name: agent.agency.name,
          url: urlAbsolue(`/agencies/${encodeURIComponent(agent.agency.slug)}`, locale),
        }
      : undefined,
    aggregateRating: noteAgregee(agent.reviews),
  });
}
