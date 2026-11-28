import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-3005 (ADR-0139) — les gestes de la fiche d'une visite, décidés UNE fois, hors du rendu, sur ce que
 * l'API accorde au lecteur MAINTENANT (`abilities`, policy et état compris : `GestesDeLaVisite::peut*`).
 *
 * La fiche ne recalcule plus rien pour décider : ni `user.roles` (le bailleur d'un bien d'agence passait
 * pour un gestionnaire), ni `useCan('crm.assign')`, ni le statut. Tant que `abilities` manque, aucun geste
 * (pas d'affichage optimiste).
 *
 * L'heure et le statut ne servent qu'à PRÉSENTER (ADR-0139 § 3) : une demande encore à venir n'offre pas
 * « Terminer » avant son heure, et « Proposer un autre créneau » a besoin de la grille du bien (`slug`).
 * « Absent » est rendu même avant l'heure : la fiche le grise jusqu'à l'heure de la visite, et l'API rejuge
 * l'heure (`visit.cannot_mark_no_show`).
 */
export interface GestesPermis {
  readonly confirmer: boolean;
  readonly terminer: boolean;
  readonly absent: boolean;
  readonly replanifier: boolean;
  readonly annuler: boolean;
  readonly prendreEnCharge: boolean;
  readonly proposer: boolean;
  readonly attribuer: boolean;
}

const AUCUN: GestesPermis = {
  confirmer: false,
  terminer: false,
  absent: false,
  replanifier: false,
  annuler: false,
  prendreEnCharge: false,
  proposer: false,
  attribuer: false,
};

type VisiteLue = Pick<PropertyVisit, 'abilities' | 'status' | 'scheduled_at'> & {
  readonly property?: { readonly slug?: string | null } | null;
};

export function gestesDeLaVisite(visite: VisiteLue, maintenant: Date): GestesPermis {
  const a = visite.abilities;
  if (!a) return AUCUN;

  const debut = visite.scheduled_at ? new Date(visite.scheduled_at).getTime() : Number.NaN;
  const heurePassee = Number.isFinite(debut) && debut <= maintenant.getTime();

  return {
    confirmer: a.confirm === true,
    // Présentation : une demande à venir ne se termine pas avant son heure ; une visite confirmée, si.
    terminer: a.complete === true && (visite.status === 'confirmed' || heurePassee),
    absent: a.no_show === true,
    replanifier: a.reschedule === true,
    annuler: a.cancel === true,
    prendreEnCharge: a.claim === true,
    proposer: a.propose === true && !!visite.property?.slug,
    attribuer: a.assign === true,
  };
}
