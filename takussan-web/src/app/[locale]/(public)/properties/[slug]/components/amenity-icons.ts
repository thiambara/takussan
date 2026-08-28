import type { ComponentType } from 'react';
import {
  Waves,
  Wind,
  Car,
  ShieldCheck,
  Wifi,
  Tv,
  Flame,
  Utensils,
  TreePine,
  Dumbbell,
  WashingMachine,
  ParkingCircle,
  Sun,
  Building2,
  ArrowUpSquare,
  KeyRound,
} from 'lucide-react';

type IconComponent = ComponentType<{ className?: string }>;

export const AMENITY_ICONS: Record<string, IconComponent> = {
  pool: Waves,
  piscine: Waves,
  ac: Wind,
  clim: Wind,
  climatisation: Wind,
  garage: Car,
  parking: ParkingCircle,
  security: ShieldCheck,
  securite: ShieldCheck,
  wifi: Wifi,
  internet: Wifi,
  tv: Tv,
  television: Tv,
  heating: Flame,
  chauffage: Flame,
  kitchen: Utensils,
  cuisine: Utensils,
  garden: TreePine,
  jardin: TreePine,
  gym: Dumbbell,
  salle_sport: Dumbbell,
  laundry: WashingMachine,
  buanderie: WashingMachine,
  terrace: Sun,
  terrasse: Sun,
  elevator: ArrowUpSquare,
  ascenseur: ArrowUpSquare,
  furnished: Building2,
  meuble: Building2,
  keybox: KeyRound,
};

export const FALLBACK_AMENITY_ICON = Building2;

export function getAmenityIcon(key: string | null | undefined): IconComponent {
  if (!key) return FALLBACK_AMENITY_ICON;
  return AMENITY_ICONS[key.toLowerCase()] ?? FALLBACK_AMENITY_ICON;
}
