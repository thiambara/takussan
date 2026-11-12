import { nomAffichable } from '@/lib/identite';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-2638 — ce que la ligne du mode Gestion dit d'un bien, lu du bloc `occupancy` de TCK-2637 :
 * qui l'occupe, l'état du mois, le loyer AVEC sa période. Rien du métier n'est recalculé ici — le
 * bail courant, l'état du mois et la date de vacance sont ceux de l'API ; ce module ne fait que
 * choisir la phrase. Les clés rendues sont celles de `property.dashboard.gestion`.
 */

export type PeriodeDuLoyer = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type LigneOccupant =
  | { readonly cle: 'locataire'; readonly nom: string; readonly fin: string | null }
  | { readonly cle: 'occupe' }
  | { readonly cle: 'sansLocataire' }
  | { readonly cle: 'aVendre' };

export type EtatDuMois =
  | { readonly ton: 'succes'; readonly cle: 'paye' }
  | { readonly ton: 'danger'; readonly cle: 'enRetard'; readonly jours: number }
  | { readonly ton: 'avertissement'; readonly cle: 'partiel' }
  | { readonly ton: 'neutre'; readonly cle: 'aEcheance'; readonly date: string | null }
  | { readonly ton: 'info'; readonly cle: 'preavis'; readonly date: string | null }
  | { readonly ton: 'avertissement'; readonly cle: 'vacantDepuis'; readonly jours: number }
  | { readonly ton: 'avertissement'; readonly cle: 'vacant' };

const UN_JOUR = 24 * 60 * 60 * 1000;

/** Jours écoulés depuis une date `YYYY-MM-DD`, au calendrier de Dakar (UTC+0, sans heure d'été). */
function joursDepuis(date: string, aujourdhui: Date): number {
  const debut = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  const jour = Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate());
  return Math.max(0, Math.round((jour - debut) / UN_JOUR));
}

function estAVendre(p: PropertyListItem): boolean {
  return p.contract_type === 'sale';
}

/** La deuxième ligne de la carte : le locataire et la fin du bail, « Sans locataire », « À vendre ». */
export function ligneOccupant(p: PropertyListItem, _aujourdhui: Date): LigneOccupant | null {
  if (estAVendre(p)) return { cle: 'aVendre' };
  const occupation = p.occupancy;
  if (!occupation) return null;
  if (occupation.state === 'vacant') return { cle: 'sansLocataire' };
  // Sans droit sur le bail, l'API retire le bloc `tenant` (TCK-2637, confidentialité) : l'état reste.
  if (!occupation.tenant) return { cle: 'occupe' };
  return {
    cle: 'locataire',
    nom: nomAffichable(occupation.tenant),
    fin: occupation.lease?.end_date ?? null,
  };
}

/** L'état du mois, en une puce ; `null` quand il n'y a rien à dire (vente, aucune échéance). */
export function etatDuMois(p: PropertyListItem, aujourdhui: Date): EtatDuMois | null {
  if (estAVendre(p)) return null;
  const occupation = p.occupancy;
  if (!occupation) return null;
  if (occupation.state === 'vacant') {
    return occupation.vacant_since
      ? { ton: 'avertissement', cle: 'vacantDepuis', jours: joursDepuis(occupation.vacant_since, aujourdhui) }
      : { ton: 'avertissement', cle: 'vacant' };
  }
  if (occupation.state === 'notice') {
    return { ton: 'info', cle: 'preavis', date: occupation.lease?.end_date ?? null };
  }
  const mois = occupation.current_month;
  switch (mois?.status) {
    case 'paid':
      return { ton: 'succes', cle: 'paye' };
    case 'late':
      return { ton: 'danger', cle: 'enRetard', jours: mois.days_late ?? 0 };
    case 'partial':
      return { ton: 'avertissement', cle: 'partiel' };
    case 'due':
      return { ton: 'neutre', cle: 'aEcheance', date: mois.due_date };
    default:
      return null;
  }
}

/**
 * Le loyer d'un bien et sa période (AC7 : un loyer ne s'écrit jamais sans elle) : celui du bail
 * courant quand l'appelant peut le lire, sinon le prix de l'annonce. Un bien à louer sans période
 * déclarée se lit au mois, comme le fait l'annonce (`ApercuAnnonce`) ; un prix de vente n'en a pas.
 */
export function loyerDuBien(p: PropertyListItem): {
  readonly montant: number;
  readonly devise: string;
  readonly periode: PeriodeDuLoyer | null;
} | null {
  const loyer = p.occupancy?.rent ?? null;
  if (estAVendre(p)) {
    return typeof p.price === 'number' ? { montant: p.price, devise: p.currency ?? 'XOF', periode: null } : null;
  }
  if (loyer) {
    return { montant: loyer.amount, devise: loyer.currency ?? p.currency ?? 'XOF', periode: loyer.payment_frequency ?? 'monthly' };
  }
  if (typeof p.price !== 'number') return null;
  return { montant: p.price, devise: p.currency ?? 'XOF', periode: p.rent_period ?? 'monthly' };
}

/** « Publier l'annonce » : un bien à louer, vacant, qui n'est pas en ligne. */
export function publicationProposee(p: PropertyListItem): boolean {
  return !estAVendre(p) && p.occupancy?.state === 'vacant' && p.is_online === false;
}
