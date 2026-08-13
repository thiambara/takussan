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

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly type: string | null; // matches PropertyType enum value from the backend
}

export const categories: readonly Category[] = [
  { id: '1', name: 'Appartement', icon: 'apartment', type: 'apartment' },
  { id: '2', name: 'Maison',      icon: 'house',     type: 'house' },
  { id: '3', name: 'Villa',       icon: 'villa',     type: 'villa' },
  { id: '4', name: 'Terrain',     icon: 'terrain',   type: 'land' },
  { id: '5', name: 'Commerce',    icon: 'store',     type: 'shop' },
  { id: '6', name: 'Bureau',      icon: 'business',  type: 'office' },
];

export const moreCategories: readonly Category[] = [
  { id: '7',  name: 'Studio',    icon: 'studio',    type: 'studio' },
  { id: '8',  name: 'Chambre',   icon: 'room',      type: 'room' },
  { id: '9',  name: 'Entrepôt',  icon: 'warehouse', type: 'warehouse' },
  { id: '10', name: 'Hôtel',     icon: 'hotel',     type: 'hotel' },
  { id: '11', name: 'Complexe',  icon: 'resort',    type: 'resort' },
  { id: '12', name: 'Garage',    icon: 'garage',    type: 'garage' },
  { id: '13', name: 'Parking',   icon: 'parking',   type: 'parking' },
  { id: '14', name: 'Ferme',     icon: 'farm',      type: 'farm' },
  { id: '15', name: 'Usine',     icon: 'factory',   type: 'factory' },
  { id: '16', name: 'Autre',     icon: 'other',     type: 'other' },
];

export const navLinks = [
  { label: 'Acheter',     href: '/properties?contract_type=sale', active: true },
  { label: 'Louer',      href: '/properties?contract_type=rent', active: false },
  { label: 'Vendre',     href: '#',                              active: false },
  { label: 'Nos Services', href: '#',                           active: false },
] as const;

export const footerLinks = {
  discover: [
    { label: 'Biens en vedette', href: '/properties?featured=true' },
    { label: 'Nouveautés',       href: '/properties?sort=created_desc' },
  ],
} as const;
