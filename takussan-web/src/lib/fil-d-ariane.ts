import type { Locale } from '@/i18n/config';
import type { PropertyDetail } from '@/types/property';

import { type NoeudJsonLd, sansVides, urlAbsolue } from './jsonld';

/**
 * Le fil d'Ariane d'une fiche de bien — **une seule source pour l'écran ET pour le moteur**
 * (TCK-435 · AC1).
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI LA DÉRIVATION QUITTE LE COMPOSANT
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le fil était **affiché** à l'utilisateur (`PropertyBreadcrumb`) et **invisible** au moteur, alors
 * que les deux décrivent la même chose. Le corriger en écrivant un second calcul dans la page
 * aurait produit deux fils qui se ressemblent — et l'AC le dit en toutes lettres : *« un test qui
 * vérifie seulement la présence d'un `BreadcrumbList` cocherait la case avec un fil faux »*.
 *
 * La dérivation vit donc ici, en fonction PURE, et les deux consommateurs l'appellent :
 * `PropertyBreadcrumb` (client, `useTranslations`) et la `page.tsx` (serveur, `getTranslations`).
 * Le traducteur est un ARGUMENT, ce qui est la seule façon d'être appelable des deux côtés.
 */

export type MaillonDuFil = {
  /** Chemin public SANS langue, ou `undefined` pour le maillon courant (non cliquable). */
  readonly href?: string;
  readonly libelle: string;
};

/** Ce que la dérivation demande à un traducteur : `t('breadcrumb.…')`. */
export type TraducteurDeFil = (cle: string) => string;

/**
 * Les maillons d'une fiche : accueil → transaction → ville → quartier.
 *
 * ⚠️ **Il n'y a PAS de maillon final pour le bien lui-même**, et c'est délibéré : le fil affiché
 * n'en porte pas. En ajouter un au seul balisage romprait l'égalité que l'AC1 exige — le moteur
 * verrait un fil que la page ne montre pas. Si l'écran en gagne un un jour, il apparaîtra ici et
 * dans les deux consommateurs à la fois.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE QUARTIER N'EST PAS CLIQUABLE, ET C'EST UNE DÉCISION DU 2026-08-28
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il l'était, vers `/properties?location=<quartier>`. Or `location` est l'une des **dix-sept clés
 * ÉCARTÉES** par la règle de canonicité de TCK-433 : cette URL rend
 * `<link rel="canonical" href="…/properties">`. Le fil d'Ariane affirmait donc au moteur, en
 * `BreadcrumbList`, un `item` que la page pointée désavoue aussitôt — deux tickets du même lot qui
 * se contredisaient.
 *
 * Les trois issues étaient : faire entrer `location` dans les clés canoniques (impossible sans
 * rouvrir un espace non borné — les quartiers ne s'énumèrent pas), faire pointer le seul balisage
 * vers la canonique du palier au-dessus (cela romprait l'égalité DOM ⇔ JSON-LD de l'AC1), ou
 * retirer le lien.
 *
 * **Le lien est retiré des DEUX côtés à la fois**, ce qui garde l'égalité intacte : le quartier
 * reste affiché comme dernier maillon, en simple libellé — la forme idiomatique d'un fil d'Ariane,
 * dont le dernier niveau désigne l'endroit où l'on est. `PropertyBreadcrumb` sait déjà rendre un
 * maillon sans `href`, et `jsonLdFilDAriane` sait déjà omettre son `item`.
 *
 * **Invariant qui en découle, et qu'un test vérifie** : tout `item` du fil est une URL CANONIQUE
 * d'elle-même. `/` l'est ; `contract_type` vaut `rent` ou `sale`, tous deux dans le domaine ; la
 * ville vient du bien lui-même, qui est public, donc elle appartient au domaine du catalogue par
 * construction.
 */
export function maillonsDeFiche(
  property: PropertyDetail,
  t: TraducteurDeFil,
): readonly MaillonDuFil[] {
  const estLocation = property.contract_type === 'rent';

  const maillons: MaillonDuFil[] = [
    { libelle: t('breadcrumb.home'), href: '/' },
    {
      libelle: t(estLocation ? 'breadcrumb.rent' : 'breadcrumb.buy'),
      href: estLocation ? '/properties?contract_type=rent' : '/properties?contract_type=sale',
    },
  ];

  if (property.location.city) {
    maillons.push({
      libelle: property.location.city,
      href: `/properties?city=${encodeURIComponent(property.location.city)}`,
    });
  }

  if (property.location.quarter) {
    // Sans `href` — cf. l'en-tête. `/properties?location=…` n'est pas canonique d'elle-même.
    maillons.push({ libelle: property.location.quarter });
  }

  return maillons;
}

/**
 * Le `BreadcrumbList` des mêmes maillons, dans le même ordre.
 *
 * `position` commence à 1 (schema.org). `item` n'est émis que pour un maillon cliquable : le
 * dernier élément d'un fil peut légitimement ne pas en porter, et en inventer un renverrait vers
 * une page qui n'est pas celle du maillon.
 */
export function jsonLdFilDAriane(
  maillons: readonly MaillonDuFil[],
  locale: Locale,
): NoeudJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: maillons.map((maillon, index) =>
      sansVides({
        '@type': 'ListItem',
        position: index + 1,
        name: maillon.libelle,
        item: maillon.href ? urlAbsolue(maillon.href, locale) : undefined,
      }),
    ),
  };
}
