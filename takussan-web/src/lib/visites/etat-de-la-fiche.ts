import type { PropertyVisit } from '@/types/visit';

import { instantADakar } from './heure-de-dakar';
import { jourADakar } from './par-le-temps';

/** La durée d'une visite qui n'en porte pas (la valeur par défaut de la planification). */
export const DUREE_PAR_DEFAUT_MINUTES = 30;

/**
 * TCK-2587 — les états de la fiche d'une visite (maquette `app-visites` a : « Détail — à confirmer »,
 * « jour J », « après l'heure »), plus ceux que la maquette ne dessine pas.
 *
 *  · `a-confirmer` — une demande (`scheduled`) : par tranche, toujours (son heure n'est pas fixée) ;
 *    à heure fixée, tant que l'heure n'est pas passée ;
 *  · `jour-j` — confirmée pour aujourd'hui (à Dakar), pas commencée ;
 *  · `confirmee` — confirmée pour un autre jour : ni « en route », ni « Commencer » ;
 *  · `en-cours` — de son début à sa fin prévue (début + durée) : le début est l'heure de la visite,
 *    ou celle du clic sur « Commencer », posée dans l'URL (`?commencee=HH:MM`, rien n'est écrit en
 *    base) — Absent et Terminer, la progression ;
 *  · `apres` — la fin prévue passée sans que la visite soit close : Absent et Terminer, sans
 *    progression (une visite d'hier ne se dit pas « en cours, 1 400 min sur 30 ») ;
 *  · `terminee`, `annulee`, `absent` — la visite est close.
 */
export type EtatDeLaFiche = 'a-confirmer' | 'jour-j' | 'confirmee' | 'en-cours' | 'apres' | 'terminee' | 'annulee' | 'absent';

type Lue = Pick<PropertyVisit, 'status' | 'scheduled_at' | 'preferred_window' | 'duration_minutes'>;

/**
 * Le clic sur « Commencer » retenu : seulement pour une visite confirmée du jour (à Dakar), et un clic
 * déjà passé. Sinon `null` — une URL recopiée le lendemain ne commence rien.
 */
export function commenceeRetenue(v: Lue, maintenant: Date, commenceeA: Date | null): Date | null {
  if (!commenceeA || v.status !== 'confirmed' || !v.scheduled_at) return null;
  if (jourADakar(new Date(Date.parse(v.scheduled_at))) !== jourADakar(maintenant)) return null;
  return commenceeA.getTime() <= maintenant.getTime() ? commenceeA : null;
}

/**
 * Le début effectif : le clic sur « Commencer » (retenu), avant comme après l'heure — la maquette
 * compte « 12 min sur 30 » depuis le clic de 10:58 ; sinon l'heure de la visite.
 */
export function debutEffectif(v: Lue, commenceeA: Date | null): number {
  if (commenceeA) return commenceeA.getTime();
  return v.scheduled_at ? Date.parse(v.scheduled_at) : Number.NaN;
}

/** La fin prévue : le début effectif plus la durée. */
export function finPrevue(v: Lue, commenceeA: Date | null): number {
  const duree = v.duration_minutes && v.duration_minutes > 0 ? v.duration_minutes : DUREE_PAR_DEFAUT_MINUTES;
  return debutEffectif(v, commenceeA) + duree * 60_000;
}

export function etatDeLaFiche(v: Lue, maintenant: Date, commenceeA: Date | null): EtatDeLaFiche {
  if (v.status === 'completed') return 'terminee';
  if (v.status === 'cancelled') return 'annulee';
  if (v.status === 'no_show') return 'absent';

  const debut = v.scheduled_at ? Date.parse(v.scheduled_at) : Number.NaN;
  const atteinte = Number.isFinite(debut) && debut <= maintenant.getTime();
  const apresLHeure = (c: Date | null): EtatDeLaFiche => (maintenant.getTime() < finPrevue(v, c) ? 'en-cours' : 'apres');

  if (v.status !== 'confirmed') {
    return !v.preferred_window && atteinte ? apresLHeure(null) : 'a-confirmer';
  }
  const aujourdhui = Number.isFinite(debut) && jourADakar(new Date(debut)) === jourADakar(maintenant);
  const commencee = commenceeRetenue(v, maintenant, commenceeA);
  if (atteinte) return apresLHeure(commencee);
  if (!aujourdhui) return 'confirmee';
  return commencee ? apresLHeure(commencee) : 'jour-j';
}

/**
 * `?commencee=HH:MM` : l'heure de Dakar du clic sur « Commencer », le jour même. Une valeur mal
 * formée ne commence rien.
 */
export function commenceeDeLUrl(valeur: string | null, maintenant: Date): Date | null {
  if (!valeur || !/^([01]\d|2[0-3]):[0-5]\d$/.test(valeur)) return null;
  return new Date(instantADakar(jourADakar(maintenant), valeur));
}
