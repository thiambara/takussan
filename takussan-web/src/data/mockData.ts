export interface Property {
  readonly id: string;
  readonly title: string;
  readonly price: string;
  readonly location: string;
  readonly image: string;
  readonly transaction: 'sale' | 'rent';
  readonly bedrooms: number;
  readonly surface: string;
  readonly feature: string;
}

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly count: number;
}

export const featuredProperties: readonly Property[] = [
  {
    id: '1',
    title: 'Penthouse Almadies',
    price: '450.000.000 FCFA',
    location: 'Dakar, Almadies',
    image: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 4,
    surface: '320 m²',
    feature: 'Balcon',
  },
  {
    id: '2',
    title: 'Villa Azur',
    price: '275.000.000 FCFA',
    location: 'Mbour, Saly',
    image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 5,
    surface: '450 m²',
    feature: 'Piscine',
  },
  {
    id: '3',
    title: 'Bureau Plateau',
    price: '1.500.000 FCFA/mois',
    location: 'Dakar, Plateau',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop',
    transaction: 'rent',
    bedrooms: 3,
    surface: '180 m²',
    feature: 'Parking',
  },
  {
    id: '4',
    title: 'Appartement Yoff',
    price: '85.000.000 FCFA',
    location: 'Dakar, Yoff',
    image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 2,
    surface: '95 m²',
    feature: 'Terrasse',
  },
  {
    id: '5',
    title: 'Villa Ngor',
    price: '650.000.000 FCFA',
    location: 'Dakar, Ngor',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 6,
    surface: '520 m²',
    feature: 'Vue mer',
  },
  {
    id: '6',
    title: 'Studio Mermoz',
    price: '450.000 FCFA/mois',
    location: 'Dakar, Mermoz',
    image: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&auto=format&fit=crop',
    transaction: 'rent',
    bedrooms: 1,
    surface: '45 m²',
    feature: 'Meublé',
  },
  {
    id: '7',
    title: 'Duplex Fann',
    price: '195.000.000 FCFA',
    location: 'Dakar, Fann',
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 3,
    surface: '150 m²',
    feature: 'Jardin',
  },
  {
    id: '8',
    title: 'Terrain Malika',
    price: '45.000.000 FCFA',
    location: 'Dakar, Malika',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 0,
    surface: '500 m²',
    feature: 'Titré',
  },
];

export const latestProperties: readonly Property[] = [
  {
    id: '9',
    title: 'Appartement Ouakam',
    price: '120.000.000 FCFA',
    location: 'Dakar, Ouakam',
    image: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 3,
    surface: '110 m²',
    feature: 'Garage',
  },
  {
    id: '10',
    title: 'Bureau Liberté 6',
    price: '2.000.000 FCFA/mois',
    location: 'Dakar, Liberté 6',
    image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=800&auto=format&fit=crop',
    transaction: 'rent',
    bedrooms: 4,
    surface: '200 m²',
    feature: 'Sécurisé',
  },
  {
    id: '11',
    title: 'Villa Point E',
    price: '380.000.000 FCFA',
    location: 'Dakar, Point E',
    image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6b3?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 4,
    surface: '280 m²',
    feature: 'Piscine',
  },
  {
    id: '12',
    title: 'Studio Sicap',
    price: '350.000 FCFA/mois',
    location: 'Dakar, Sicap',
    image: 'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=800&auto=format&fit=crop',
    transaction: 'rent',
    bedrooms: 1,
    surface: '35 m²',
    feature: 'Meublé',
  },
  {
    id: '13',
    title: 'Maison Thiès',
    price: '95.000.000 FCFA',
    location: 'Thiès, Centre',
    image: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 3,
    surface: '160 m²',
    feature: 'Cour',
  },
  {
    id: '14',
    title: 'Commerce Sandaga',
    price: '800.000 FCFA/mois',
    location: 'Dakar, Sandaga',
    image: 'https://images.unsplash.com/photo-1604014237800-1c9102c219b0?w=800&auto=format&fit=crop',
    transaction: 'rent',
    bedrooms: 0,
    surface: '80 m²',
    feature: 'Passage',
  },
  {
    id: '15',
    title: 'Villa Mbour',
    price: '180.000.000 FCFA',
    location: 'Mbour, Centre',
    image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 3,
    surface: '200 m²',
    feature: 'Jardin',
  },
  {
    id: '16',
    title: 'Appartement Almadies',
    price: '750.000 FCFA/mois',
    location: 'Dakar, Almadies',
    image: 'https://images.unsplash.com/photo-1502005229762-cf1b2da7c5d6?w=800&auto=format&fit=crop',
    transaction: 'rent',
    bedrooms: 2,
    surface: '85 m²',
    feature: 'Vue mer',
  },
  {
    id: '17',
    title: 'Terrain Yene',
    price: '28.000.000 FCFA',
    location: 'Yene, Lac rose',
    image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 0,
    surface: '300 m²',
    feature: 'Titré',
  },
  {
    id: '18',
    title: 'Duplex Mermoz',
    price: '220.000.000 FCFA',
    location: 'Dakar, Mermoz',
    image: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&auto=format&fit=crop',
    transaction: 'sale',
    bedrooms: 4,
    surface: '220 m²',
    feature: 'Garage',
  },
];

export const categories: readonly Category[] = [
  { id: '1', name: 'Appartement', icon: 'apartment', count: 184 },
  { id: '2', name: 'Villa', icon: 'villa', count: 47 },
  { id: '3', name: 'Terrain', icon: 'terrain', count: 92 },
  { id: '4', name: 'Commerce', icon: 'store', count: 63 },
  { id: '5', name: 'Maison', icon: 'house', count: 118 },
  { id: '6', name: 'Bureau', icon: 'business', count: 39 },
];

export const navLinks = [
  { label: 'Acheter', href: '#', active: true },
  { label: 'Louer', href: '#', active: false },
  { label: 'Vendre', href: '#', active: false },
  { label: 'Nos Services', href: '#', active: false },
] as const;

export const footerLinks = {
  about: [
    { label: 'À propos de nous', href: '#' },
    { label: 'Notre équipe', href: '#' },
    { label: 'Carrières', href: '#' },
    { label: 'Presse', href: '#' },
  ],
  discover: [
    { label: 'Biens en vedette', href: '#' },
    { label: 'Nouveautés', href: '#' },
    { label: 'Alertes email', href: '#' },
    { label: 'Carte interactive', href: '#' },
  ],
  help: [
    { label: 'Centre d\'aide', href: '#' },
    { label: 'Contact', href: '#' },
    { label: 'Mentions légales', href: '#' },
    { label: 'Confidentialité', href: '#' },
  ],
} as const;
