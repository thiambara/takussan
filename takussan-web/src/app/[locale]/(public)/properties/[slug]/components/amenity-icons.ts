import type { ComponentType } from 'react';
import {
  Armchair,
  BedSingle,
  BellRing,
  Building2,
  Bug,
  Cable,
  Car,
  Cctv,
  CircleParking,
  CookingPot,
  DoorClosed,
  Drill,
  Droplets,
  Dumbbell,
  Fan,
  Gauge,
  Heater,
  Microwave,
  Sailboat,
  ShieldCheck,
  Shirt,
  SolarPanel,
  SquareArrowUp,
  Sun,
  Sunrise,
  ToyBrick,
  TreePine,
  Tv,
  UserCheck,
  Utensils,
  Warehouse,
  WashingMachine,
  Waves,
  Wifi,
  Wind,
  Zap,
} from 'lucide-react';

type IconComponent = ComponentType<{ className?: string }>;

/**
 * TCK-914 (P30.05) — une icône par équipement du catalogue, indexée par son SLUG.
 *
 * L'icône se cherche par `tag.icon ?? tag.slug` (`PropertyAmenities.tsx`), et aucun tag ne porte
 * d'`icon` : la clé est donc le slug de `TagCatalog::EQUIPEMENTS` (`Str::slug` du nom). Les
 * anciennes clés (`cuisine`, `securite`, `salle_sport`…) ne correspondaient à aucun slug, et 26
 * équipements sur 35 retombaient sur l'icône générique. `amenity-icons.tck-914.test.ts` lit le
 * catalogue PHP et rougit sur un slug sans icône, ou une clé hors du catalogue.
 *
 * Choix : l'icône Lucide la plus proche de chaque équipement, à revoir à la PR.
 */
export const AMENITY_ICONS: Record<string, IconComponent> = {
  piscine: Waves,
  climatisation: Wind,
  ascenseur: SquareArrowUp,
  parking: CircleParking,
  garage: Car,
  balcon: Armchair,
  terrasse: Sun,
  'toit-terrasse': Sunrise,
  jardin: TreePine,
  'cuisine-equipee': CookingPot,
  gardien: UserCheck,
  'vue-sur-mer': Sailboat,
  wifi: Wifi,
  'fibre-optique': Cable,
  tv: Tv,
  'machine-a-laver': WashingMachine,
  'seche-linge': Shirt,
  'micro-ondes': Microwave,
  'lave-vaisselle': Utensils,
  'securite-247': ShieldCheck,
  'cameras-de-surveillance': Cctv,
  'portail-electrique': DoorClosed,
  interphone: BellRing,
  'groupe-electrogene': Zap,
  'panneaux-solaires': SolarPanel,
  forage: Drill,
  surpresseur: Gauge,
  'citerne-deau': Droplets,
  'chauffe-eau': Heater,
  ventilateurs: Fan,
  moustiquaires: Bug,
  'chambre-de-bonne': BedSingle,
  dependance: Warehouse,
  'salle-de-sport': Dumbbell,
  'aire-de-jeux': ToyBrick,
};

export const FALLBACK_AMENITY_ICON = Building2;

export function getAmenityIcon(key: string | null | undefined): IconComponent {
  if (!key) return FALLBACK_AMENITY_ICON;
  return AMENITY_ICONS[key.toLowerCase()] ?? FALLBACK_AMENITY_ICON;
}
