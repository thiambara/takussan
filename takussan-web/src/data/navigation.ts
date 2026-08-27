/**
 * Constantes de NAVIGATION du site public — liens d'en-tête, catégories, pied de page.
 *
 * Ce fichier s'appelait `mockData.ts`, et il portait deux choses très différentes : ces
 * constantes-là, consommées en production par `Navbar` et `Footer`, et ~300 lignes
 * d'annonces factices (`featuredProperties`, `latestProperties`) qui n'avaient plus AUCUN
 * usage. Des données de navigation servies depuis un fichier nommé « mock » finissent par
 * être supprimées par quelqu'un qui fait le ménage — ou pire, jamais relues parce que le
 * nom promet qu'elles ne comptent pas.
 *
 * Les annonces factices ont été retirées ; le type `Property` du produit vit dans
 * `src/types/`, pas ici.
 */

/**
 * Une catégorie porte une CLÉ de libellé (`property.types.*`), pas un libellé.
 *
 * ⚠ La divergence est TRANCHÉE depuis TCK-292, et elle était plus large que ce que le ticket
 * annonçait : le même enum backend était traduit par **CINQ** tables — `nav.categories`,
 * `property.types`, et trois tables locales (`PropertyCard`, `search/SearchToolbar`,
 * `search/FilterSidebar`), plus une sixième côté formulaire (`property-form/options.ts`).
 *
 * `property.types` gagne comme EMPLACEMENT — c'est un vocabulaire de bien, pas de navigation —
 * mais ce sont les VALEURS de `nav.categories` qui ont été retenues, pour deux raisons mesurées :
 * c'était le seul des deux dictionnaires à être complet dans les trois langues (`property.types`
 * n'avait aucun wolof), et le seul à être réellement consommé. `nav.categories` est supprimé.
 */
export interface Category {
  readonly id: string;
  readonly nameKey: string;
  readonly icon: string;
  readonly type: string | null; // matches PropertyType enum value from the backend
}

export const categories: readonly Category[] = [
  { id: '1', nameKey: 'apartment',  icon: 'apartment',    type: 'apartment' },
  { id: '2', nameKey: 'house',      icon: 'house',        type: 'house' },
  { id: '3', nameKey: 'villa',      icon: 'villa',        type: 'villa' },
  { id: '4', nameKey: 'land',       icon: 'terrain',      type: 'land' },
  { id: '5', nameKey: 'shop',       icon: 'store',        type: 'shop' },
  { id: '6', nameKey: 'office',     icon: 'business',     type: 'office' },
];

export const moreCategories: readonly Category[] = [
  { id: '7', nameKey: 'studio',     icon: 'studio',       type: 'studio' },
  { id: '8', nameKey: 'room',       icon: 'room',         type: 'room' },
  { id: '9', nameKey: 'warehouse',  icon: 'warehouse',    type: 'warehouse' },
  { id: '10', nameKey: 'hotel',      icon: 'hotel',        type: 'hotel' },
  { id: '11', nameKey: 'resort',     icon: 'resort',       type: 'resort' },
  { id: '12', nameKey: 'garage',     icon: 'garage',       type: 'garage' },
  { id: '13', nameKey: 'parking',    icon: 'parking',      type: 'parking' },
  { id: '14', nameKey: 'farm',       icon: 'farm',         type: 'farm' },
  { id: '15', nameKey: 'factory',    icon: 'factory',      type: 'factory' },
  { id: '16', nameKey: 'other',      icon: 'other',        type: 'other' },
];

/**
 * Les entrées du MENU MOBILE de la navbar — `navLinks` n'est consommé que là (`Navbar.tsx`).
 *
 * ⚠ **Aucun `href: '#'`.** Deux y vivaient — `sell` et `services` — et le menu les rendait comme
 * des liens : le panneau se refermait, la page ne bougeait pas. C'est le motif de TCK-419 (un
 * chemin sans écran) sous sa forme la plus visible, puisqu'ici la cible n'est pas seulement
 * absente, elle est écrite. `src/data/__tests__/navigation.test.ts` refuse désormais qu'une
 * nouvelle entrée en porte un, et vérifie que chaque `href` résout vers une route qui existe
 * RÉELLEMENT sous `src/app` (inventaire dérivé du système de fichiers, jamais recopié).
 *
 * Le sort des deux entrées mortes a été tranché séparément, parce qu'elles ne se ressemblent
 * qu'en surface (TCK-439) :
 *
 * · **`sell` → `/publish`.** La destination existe (`src/app/publish/page.tsx`) et c'est
 *   exactement le parcours que le libellé annonce : « Vendre » sur un site d'annonces, c'est
 *   déposer un bien. La page résout elle-même où envoyer le visiteur (connexion, assistant hôte,
 *   `/app/properties/new`, cf. TCK-254). Le menu porte par ailleurs un bouton « Publier une
 *   annonce » : la redondance est assumée — c'est un couple intention / action, et c'est le
 *   patron des sites du domaine (« Vendre » en navigation, « Déposer une annonce » en CTA).
 *
 * · **`services` → RETIRÉ.** Aucune surface de services n'existe, ni publique ni ticketée. Le
 *   dépôt a des `ServiceProviderProfile` côté API, mais rien qu'un visiteur puisse atteindre :
 *   pointer le lien quelque part demanderait d'inventer la page, ce que TCK-439 exclut
 *   explicitement de son périmètre. La clé `nav.links.services` est retirée des trois
 *   dictionnaires avec l'entrée — un libellé qui ne s'affiche plus est un piège pour la
 *   prochaine personne qui le trouvera et croira la surface livrée.
 */
export const navLinks = [
  { labelKey: 'buy',  href: '/properties?contract_type=sale', active: true },
  { labelKey: 'rent', href: '/properties?contract_type=rent', active: false },
  { labelKey: 'sell', href: '/publish',                       active: false },
] as const;

export const footerLinks = {
  discover: [
    { labelKey: 'featured', href: '/properties?featured=true' },
    { labelKey: 'latest',   href: '/properties?sort=created_desc' },
  ],
} as const;
