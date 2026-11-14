import { valeurBornee } from '@/hooks/useVueDansLUrl';
import { decalerJour } from '@/lib/jour-de-l-api';
import { heureMuraleADakar, instantADakar } from '@/lib/visites/heure-de-dakar';
import { bornesDeLOnglet, debutDeLaMinute, ONGLETS_DES_VISITES } from '@/components/visits/onglet-des-visites';
import type { PropertyVisit, VisitWindow } from '@/types/visit';

/**
 * TCK-2587 — les Visites « par le temps » : Aujourd'hui, À confirmer, À clore, Plus tard, et
 * l'accès aux onglets de statut (« Par statut » au téléphone, « Toutes » au bureau).
 *
 * Chaque vue est une BORNE posée sur `GET /api/property-visits`, et son compte est la clé de
 * `GET /api/property-visits/counts` qui compte EXACTEMENT cette borne (`cleDuCompte`) : une
 * pastille qui annonce 6 ouvre une liste de 6.
 */
export const VUES_DES_VISITES = ['today', 'to_confirm', 'to_close', 'later', 'status'] as const;
export type VueDesVisites = (typeof VUES_DES_VISITES)[number];

/** Les clés de `GET /api/property-visits/counts`. */
export interface ComptesDesVisites {
  readonly unassigned: number;
  readonly requested: number;
  readonly confirmed: number;
  readonly past: number;
  readonly cancelled: number;
  readonly today: number;
  readonly to_close: number;
  readonly later?: number;
  readonly all?: number;
}

type Lecture = Pick<URLSearchParams, 'get' | 'toString'>;

/**
 * La vue que porte l'URL. `?vue=` d'abord ; sinon `?tab=` (les liens d'avant TCK-2587) :
 * `?tab=requested` — la pastille « À traiter » du menu et le bloc « Aujourd'hui » — ouvre « À
 * confirmer », dont le périmètre est celui de « Demandées » ; tout autre onglet de statut ouvre la
 * vue des statuts sur cet onglet. Sans rien : « Aujourd'hui ».
 */
export function vueDesVisites(params: Lecture): VueDesVisites {
  const vue = valeurBornee(params, 'vue', VUES_DES_VISITES);
  if (vue) return vue;
  const onglet = valeurBornee(params, 'tab', ONGLETS_DES_VISITES);
  if (onglet === 'requested') return 'to_confirm';
  if (onglet) return 'status';
  return 'today';
}

/** Le jour de Dakar (`AAAA-MM-JJ`) de l'instant. */
export function jourADakar(instant: Date): string {
  return heureMuraleADakar(instant).slice(0, 10);
}

/**
 * Le `filter[...]` de la liste de chaque vue, à l'instant `maintenant` — miroir de
 * `PropertyVisitController::counts`.
 *
 *  · `today` — toute visite de ce jour à Dakar, quel que soit son statut (`filter[day]`) ;
 *  · `to_confirm` — le périmètre de l'onglet « Demandées » (`bornesDeLOnglet('requested')`), que
 *    la pastille du menu compte ;
 *  · `to_close` — `filter[to_close]` (TCK-2578) ;
 *  · `later` — confirmée, à partir de demain à Dakar.
 *
 * `status` n'a pas de borne propre : c'est l'onglet de statut qui la pose (`VisitsList`).
 */
export function filtreDeLaVue(vue: Exclude<VueDesVisites, 'status'>, maintenant: Date): Record<string, string> {
  switch (vue) {
    case 'today':
      return { day: jourADakar(maintenant) };
    case 'to_confirm': {
      const b = bornesDeLOnglet('requested', debutDeLaMinute(maintenant));
      return { status: b.status ?? 'scheduled', scheduled_at_min: b.scheduled_at_min ?? debutDeLaMinute(maintenant) };
    }
    case 'to_close':
      return { to_close: '1' };
    case 'later':
      return { status: 'confirmed', scheduled_at_min: instantADakar(decalerJour(jourADakar(maintenant), 1), '00:00') };
  }
}

/** La clé de `counts` qui compte la vue. */
export function cleDuCompte(vue: VueDesVisites): keyof ComptesDesVisites {
  switch (vue) {
    case 'today':
      return 'today';
    case 'to_confirm':
      return 'requested';
    case 'to_close':
      return 'to_close';
    case 'later':
      return 'later';
    case 'status':
      return 'all';
  }
}

/** L'ordre de chaque vue : le temps qui vient d'abord ; pour « À clore », la plus récente. */
export function triDeLaVue(vue: Exclude<VueDesVisites, 'status'>): string {
  return vue === 'to_close' ? '-scheduled_at' : 'scheduled_at';
}

const MINUTE = 60_000;

/** La fin prévue d'une visite (début + durée, 30 min à défaut). */
export function finDeLaVisite(v: Pick<PropertyVisit, 'scheduled_at' | 'duration_minutes'>): number | null {
  if (!v.scheduled_at) return null;
  return Date.parse(v.scheduled_at) + (v.duration_minutes && v.duration_minutes > 0 ? v.duration_minutes : 30) * MINUTE;
}

/** Une visite du jour qui compte dans le déroulé : ni annulée, ni demandée sans heure fixée. */
function aLieu(v: PropertyVisit): boolean {
  return v.status !== 'cancelled' && !(v.status === 'scheduled' && v.preferred_window);
}

/**
 * La prochaine visite du jour : la première dont la FIN n'est pas passée (une visite commencée
 * reste « la prochaine » jusqu'à sa fin prévue), confirmée ou demandée à une heure fixée.
 */
export function prochaineDuJour(visites: readonly PropertyVisit[], maintenant: Date): PropertyVisit | null {
  return (
    [...visites]
      .filter((v) => aLieu(v) && (v.status === 'confirmed' || v.status === 'scheduled'))
      .sort((a, b) => Date.parse(a.scheduled_at ?? '') - Date.parse(b.scheduled_at ?? ''))
      .find((v) => (finDeLaVisite(v) ?? 0) > maintenant.getTime()) ?? null
  );
}

/**
 * Le temps libre entre deux visites du jour, d'au moins `seuil` minutes : `{ de, a }` en instants,
 * `de` arrondi au quart d'heure suivant la fin de la première (maquette : « Libre de 11:30 à 16:55 »).
 */
export function tempsLibreEntre(a: PropertyVisit, b: PropertyVisit, seuil = 30): { readonly de: string; readonly a: string } | null {
  const fin = finDeLaVisite(a);
  if (fin === null || !b.scheduled_at) return null;
  const debut = Date.parse(b.scheduled_at);
  // Le temps libre commence au quart d'heure qui suit la fin (« Libre de 11:30 », pas 11:27).
  const libreDes = Math.ceil(fin / (15 * MINUTE)) * 15 * MINUTE;
  if (debut - libreDes < seuil * MINUTE) return null;
  return { de: new Date(libreDes).toISOString(), a: b.scheduled_at };
}

/**
 * « dans 45 min », « dans 2 h 05 », « depuis 12 min » : l'écart à l'heure de début, en minutes
 * entières (arrondi vers le haut avant, vers le bas après). `null` au-delà de 12 h : la date suffit.
 */
export function ecartAuDebut(scheduledAt: string, maintenant: Date): { readonly sens: 'dans' | 'depuis'; readonly minutes: number } | null {
  const ecart = Date.parse(scheduledAt) - maintenant.getTime();
  if (Math.abs(ecart) > 12 * 60 * MINUTE) return null;
  return ecart > 0 ? { sens: 'dans', minutes: Math.ceil(ecart / MINUTE) } : { sens: 'depuis', minutes: Math.floor(-ecart / MINUTE) };
}

/** Les bornes de chaque tranche, heure de Dakar — le début est celui de `VisitWindow::startTime()`. */
const BORNES_DES_TRANCHES: Record<VisitWindow, readonly [string, string]> = {
  morning: ['09:00', '14:00'],
  afternoon: ['14:00', '17:00'],
  evening: ['17:00', '24:00'],
};

/**
 * Les heures libres d'une demande par tranche : les créneaux libres du jour (`GET
 * /api/property-visits/slots`) dont l'heure de Dakar tombe dans la tranche, et pas avant
 * `auPlusTot` (le délai de prévenance). La première est celle que « Confirmer 15:00 » propose.
 */
export function heuresLibresDeLaTranche(
  creneaux: readonly { readonly start: string; readonly label: string; readonly available: boolean }[],
  tranche: VisitWindow,
  auPlusTot: number,
): readonly { readonly start: string; readonly label: string }[] {
  const [de, a] = BORNES_DES_TRANCHES[tranche];
  return creneaux.filter((c) => c.available && c.label >= de && c.label < a && Date.parse(c.start) >= auPlusTot);
}
