/**
 * TCK-2510 — l'adresse du tunnel de réservation courte durée, et ce qu'elle transporte.
 *
 * `/bookings?property=<slug>&debut=AAAA-MM-JJ&fin=AAAA-MM-JJ&personnes=N`. Les dates voyagent dans
 * l'URL pour la même raison que l'intention de la fiche (TCK-589) : c'est le seul transport qui
 * survit à `redirect=`, à la vérification de l'e-mail et à `/onboarding/intention`. Un visiteur
 * renvoyé vers la connexion retrouve donc ses dates au retour (AC3).
 */
import type { ContractType, RentPeriod } from '@/types/property';

export interface SejourDemande {
  readonly debut: string | null;
  readonly fin: string | null;
  readonly personnes: number;
}

/** Bornes du nombre de personnes, celles de `POST /api/bookings` (`guests`, 1 à 20). */
export const PERSONNES_MIN = 1;
export const PERSONNES_MAX = 20;

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dateValide(brute: string | null | undefined): string | null {
  if (typeof brute !== 'string' || !DATE_ISO.test(brute)) return null;
  const date = new Date(`${brute}T00:00:00Z`);
  // `2026-02-31` se parse en mars : on ne garde qu'une date qui se relit à l'identique.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === brute ? brute : null;
}

function personnesValides(brute: string | null | undefined): number {
  const n = typeof brute === 'string' && /^\d{1,2}$/.test(brute) ? Number.parseInt(brute, 10) : NaN;
  return Number.isInteger(n) && n >= PERSONNES_MIN && n <= PERSONNES_MAX ? n : PERSONNES_MIN;
}

/** Un séjour court : une location à la nuit ou à la semaine — le seul que le tunnel réserve. */
export function estSejourCourt(bien: {
  readonly contract_type: ContractType | null;
  readonly rent_period?: RentPeriod | null;
}): boolean {
  return bien.contract_type === 'rent' && (bien.rent_period === 'daily' || bien.rent_period === 'weekly');
}

/**
 * Le séjour lu dans les paramètres de la page. Illisible → vide plutôt que faux ; un départ qui
 * ne suit pas l'arrivée tombe (ce serait un séjour de zéro nuit). Les nuits prises, elles, se
 * jugent au calendrier, quand elles sont connues (`selectionTenable`).
 */
export function lireSejourDemande(params: Readonly<Record<string, string | string[] | undefined>>): SejourDemande {
  const un = (cle: string) => (typeof params[cle] === 'string' ? (params[cle] as string) : null);
  const debut = dateValide(un('debut'));
  const fin = dateValide(un('fin'));
  return {
    debut,
    fin: debut !== null && fin !== null && fin > debut ? fin : null,
    personnes: personnesValides(un('personnes')),
  };
}

/** Le chemin du tunnel (sans langue : `LienLocalise` / `hrefLocalise` la posent), dates comprises quand il y en a. */
export function cheminDuTunnel(slug: string, sejour: Partial<SejourDemande> = {}): string {
  const params = new URLSearchParams({ property: slug });
  const debut = dateValide(sejour.debut);
  const fin = dateValide(sejour.fin);
  if (debut) params.set('debut', debut);
  if (debut && fin && fin > debut) params.set('fin', fin);
  if (sejour.personnes !== undefined && sejour.personnes !== PERSONNES_MIN) {
    params.set('personnes', String(personnesValides(String(sejour.personnes))));
  }
  return `/bookings?${params.toString()}`;
}
