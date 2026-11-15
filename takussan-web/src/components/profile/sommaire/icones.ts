import {
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  Clock,
  Download,
  Globe,
  PanelLeft,
  Phone,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import type { IdDeRangee } from '@/lib/profil/sommaire';

/**
 * L'icône de chaque rangée : celles de la maquette (`LIGNES_AGENT`, `LIGNES_BAILLEUR`).
 *
 * ⚠ Hors de tout module `'use client'` : le sommaire du téléphone est un composant SERVEUR, et une
 * table importée d'un module client y arrive en référence client — chaque icône y valait `undefined`.
 */
export const ICONE_DE_LA_RANGEE: Readonly<Record<IdDeRangee, LucideIcon>> = {
  coordonnees: Phone,
  fiche: BadgeCheck,
  pro: Briefcase,
  // Aucune maquette ne dessine la rangée du client : le réglage de sa recherche.
  recherche: SlidersHorizontal,
  versement: Wallet,
  annuaire: UserRound,
  notifications: Bell,
  securite: ShieldCheck,
  espaces: Building2,
  menu: PanelLeft,
  langue: Globe,
  fuseau: Clock,
  avis: Star,
  donnees: Download,
};
