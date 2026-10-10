import type { ComponentType } from 'react';
import {
  BedSingle,
  Briefcase,
  Building2,
  Car,
  Factory,
  HelpCircle,
  Home,
  Hotel,
  ParkingCircle,
  Sofa,
  Store,
  Tractor,
  TreePine,
  Warehouse,
} from 'lucide-react';

import { categories, moreCategories } from '@/data/navigation';

type Icone = ComponentType<{ className?: string; strokeWidth?: number }>;

/**
 * Le pictogramme de chaque catégorie de bien — partagé par la bande de la barre publique et par
 * les tuiles « Par type de bien » de l'accueil (TCK-628), pour qu'un même type ne porte pas deux
 * dessins selon l'endroit.
 *
 * Studio et Chambre partageaient `BedDouble` tant qu'ils vivaient dans « Plus » ; posés côte à
 * côte dans la bande, deux pictogrammes identiques ne distinguaient plus rien.
 */
export const ICONES_DE_CATEGORIE: Readonly<Record<string, Icone>> = {
  apartment: Building2,
  villa: Home,
  terrain: TreePine,
  store: Store,
  house: Warehouse,
  business: Briefcase,
  studio: Sofa,
  room: BedSingle,
  warehouse: Factory,
  hotel: Hotel,
  resort: Hotel,
  garage: Car,
  parking: ParkingCircle,
  farm: Tractor,
  factory: Factory,
  other: HelpCircle,
};

/** Le pictogramme d'un TYPE de bien (`apartment`, `land`…), par la table des catégories. */
export function iconeDuType(type: string): Icone {
  const categorie = [...categories, ...moreCategories].find((c) => c.type === type);
  return (categorie && ICONES_DE_CATEGORIE[categorie.icon]) || HelpCircle;
}
