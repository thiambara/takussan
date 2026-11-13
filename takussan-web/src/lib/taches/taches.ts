import { decalerJour } from '@/lib/jour-de-l-api';
import { HEURE_DE_REPORT, echeanceDuReport, jourADakar, rangDansLaSemaine, type Report } from '@/lib/journee/journee';
import { TASK_DUE_FILTERS } from '@/lib/queries/agent-crm';
import { instantADakar } from '@/lib/visites/heure-de-dakar';
import type { AgentTask, TaskDue } from '@/types/agent-crm';

/**
 * TCK-2596 (lot 2) — la page « Tâches » (maquette `app-aujourdhui` a, « Toutes les tâches ») : la
 * partie PURE. L'URL garde son contrat (TCK-591, TCK-1733) :
 *
 *  · `filter[due]` — une échéance (`today`, la tuile « Tâches du jour ») ou une LISTE
 *    (`overdue,today`, TCK-2595) ; `all` : toutes. Absente : En retard + Aujourd'hui, l'ouverture.
 *  · `filter[status]=done` — « Faites ».
 *  · `filter[assigned_to]=me` — gardée au changement d'échéance.
 *  · `filter[team]=1`, `filter[assigned_to_id]=N` — la vue d'équipe de l'admin (TCK-2595), jugée
 *    par l'API sur `crm.view_all`.
 */

export const PERIODES_PAR_DEFAUT: readonly TaskDue[] = ['overdue', 'today'];

export type Selection =
  | { readonly mode: 'periodes'; readonly periodes: readonly TaskDue[] }
  | { readonly mode: 'toutes' }
  | { readonly mode: 'faites' };

export interface EtatDesTaches {
  readonly selection: Selection;
  readonly aMoi: boolean;
  readonly equipe: boolean;
  readonly agent: number | null;
}

type Lecture = Readonly<Record<string, string | string[] | undefined>>;

const premiere = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? undefined : v);

/** Les périodes valides d'une liste, dans l'ordre de `TASK_DUE_FILTERS`, sans doublon. */
function periodesDe(brut: string): readonly TaskDue[] {
  const lues = new Set(brut.split(',').map((p) => p.trim()));
  return TASK_DUE_FILTERS.filter((p) => lues.has(p));
}

export function lireEtat(params: Lecture): EtatDesTaches {
  const due = premiere(params['filter[due]']);
  const statut = premiere(params['filter[status]']);
  const agentBrut = Number.parseInt(premiere(params['filter[assigned_to_id]']) ?? '', 10);
  const periodes = due ? periodesDe(due) : [];
  const selection: Selection =
    statut === 'done'
      ? { mode: 'faites' }
      : due === 'all'
        ? { mode: 'toutes' }
        : { mode: 'periodes', periodes: periodes.length > 0 ? periodes : PERIODES_PAR_DEFAUT };
  return {
    selection,
    aMoi: premiere(params['filter[assigned_to]']) === 'me',
    equipe: premiere(params['filter[team]']) === '1',
    agent: Number.isInteger(agentBrut) && agentBrut > 0 ? agentBrut : null,
  };
}

const estParDefaut = (periodes: readonly TaskDue[]) =>
  periodes.length === PERIODES_PAR_DEFAUT.length && PERIODES_PAR_DEFAUT.every((p) => periodes.includes(p));

/** La recherche de l'URL (sans `?`), crochets en clair comme le reste de l'app. Vide : l'ouverture. */
export function rechercheDe(etat: EtatDesTaches): string {
  const s = etat.selection;
  const morceaux = [
    s.mode === 'faites' ? 'filter[status]=done' : null,
    s.mode === 'toutes' ? 'filter[due]=all' : null,
    s.mode === 'periodes' && !estParDefaut(s.periodes) ? `filter[due]=${s.periodes.join(',')}` : null,
    etat.aMoi ? 'filter[assigned_to]=me' : null,
    etat.equipe ? 'filter[team]=1' : null,
    etat.equipe && etat.agent !== null ? `filter[assigned_to_id]=${etat.agent}` : null,
  ];
  return morceaux.filter(Boolean).join('&');
}

export type Pastille = TaskDue | 'done' | 'all';

/** Une pastille d'échéance s'ajoute ou se retire ; « Faites » et « Toutes » sont exclusives. */
export function basculer(selection: Selection, pastille: Pastille): Selection {
  if (pastille === 'all') return { mode: 'toutes' };
  if (pastille === 'done') return selection.mode === 'faites' ? { mode: 'periodes', periodes: PERIODES_PAR_DEFAUT } : { mode: 'faites' };
  if (selection.mode !== 'periodes') return { mode: 'periodes', periodes: [pastille] };
  const suivantes = selection.periodes.includes(pastille)
    ? selection.periodes.filter((p) => p !== pastille)
    : TASK_DUE_FILTERS.filter((p) => p === pastille || selection.periodes.includes(p));
  return suivantes.length === 0 ? { mode: 'toutes' } : { mode: 'periodes', periodes: suivantes };
}

export function estActive(selection: Selection, pastille: Pastille): boolean {
  if (pastille === 'all') return selection.mode === 'toutes';
  if (pastille === 'done') return selection.mode === 'faites';
  return selection.mode === 'periodes' && selection.periodes.includes(pastille);
}

/** La portée commune à la liste et aux comptes. */
export function filtreDePortee(etat: EtatDesTaches): Record<string, string> {
  return {
    ...(etat.aMoi ? { assigned_to: 'me' } : {}),
    ...(etat.equipe ? { team: '1' } : {}),
    ...(etat.equipe && etat.agent !== null ? { assigned_to_id: String(etat.agent) } : {}),
  };
}

/** Le filtre de la liste : la portée, plus l'échéance ou le statut de la sélection. */
export function filtreDeLaListe(etat: EtatDesTaches): Record<string, string> {
  const s = etat.selection;
  return {
    ...filtreDePortee(etat),
    ...(s.mode === 'periodes' ? { due: s.periodes.join(',') } : {}),
    ...(s.mode === 'faites' ? { status: 'done' } : {}),
  };
}

/** Le tri : l'échéance la plus proche d'abord ; les faites, la plus récente d'abord. */
export function triDeLaListe(selection: Selection): string {
  return selection.mode === 'faites' ? '-due_at' : 'due_at';
}

/** Ce que compte une pastille : ce qui reste à faire, sauf « Faites ». */
export const STATUTS_A_FAIRE = 'open,in_progress';

export function filtreDuCompte(etat: EtatDesTaches, pastille: TaskDue | 'done'): Record<string, string> {
  return pastille === 'done'
    ? { ...filtreDePortee(etat), status: 'done' }
    : { ...filtreDePortee(etat), due: pastille, status: STATUTS_A_FAIRE };
}

export const estFaite = (t: Pick<AgentTask, 'status'>) => t.status === 'done' || t.status === 'cancelled';

export type Groupe = 'retard' | 'aujourdhui' | 'semaine' | 'plusTard' | 'sans' | 'faites';
export const GROUPES: readonly Groupe[] = ['retard', 'aujourdhui', 'semaine', 'plusTard', 'sans', 'faites'];

/**
 * Le groupe d'une tâche, jugé au jour de Dakar : en retard (ouverte, échue avant aujourd'hui),
 * aujourd'hui (faite ou non : cocher ne la fait pas changer de groupe), cette semaine (jusqu'au
 * dimanche), plus tard, sans échéance ; une tâche faite d'un jour passé va avec les faites.
 */
export function groupeDe(t: Pick<AgentTask, 'status' | 'due_at'>, maintenant: Date): Groupe {
  if (!t.due_at) return 'sans';
  const jour = jourADakar(new Date(t.due_at));
  const aujourdhui = jourADakar(maintenant);
  if (jour < aujourdhui) return estFaite(t) ? 'faites' : 'retard';
  if (jour === aujourdhui) return 'aujourdhui';
  const dimanche = decalerJour(aujourdhui, 6 - rangDansLaSemaine(aujourdhui));
  return jour <= dimanche ? 'semaine' : 'plusTard';
}

export function grouper<T extends Pick<AgentTask, 'status' | 'due_at'>>(taches: readonly T[], maintenant: Date, selection: Selection): ReadonlyMap<Groupe, readonly T[]> {
  const groupes = new Map<Groupe, T[]>();
  for (const t of taches) {
    const g = selection.mode === 'faites' ? 'faites' : groupeDe(t, maintenant);
    groupes.set(g, [...(groupes.get(g) ?? []), t]);
  }
  return new Map(GROUPES.filter((g) => groupes.has(g)).map((g) => [g, groupes.get(g)!]));
}

export type JourDEcheance = 'aujourdhui' | 'demain' | 'lundi';

/**
 * L'échéance d'une tâche neuve : le jour choisi à l'heure choisie, à Dakar — sans heure, 09:00 comme
 * un report. « Lundi » est le lundi qui vient (jamais aujourd'hui).
 */
export function echeanceDuChoix(jour: JourDEcheance, heure: string | null, maintenant: Date): string {
  if (jour !== 'aujourdhui' && heure === null) return echeanceDuReport(jour as Report, maintenant);
  const aujourdhui = jourADakar(maintenant);
  const date =
    jour === 'aujourdhui' ? aujourdhui : jour === 'demain' ? decalerJour(aujourdhui, 1) : decalerJour(aujourdhui, 7 - rangDansLaSemaine(aujourdhui));
  return instantADakar(date, heure ?? HEURE_DE_REPORT);
}

/** Une date choisie au calendrier (`AAAA-MM-JJTHH:MM`, ou `AAAA-MM-JJ`), lue comme une heure de Dakar. */
export function echeanceDeLaDate(valeur: string): string | null {
  const [date, heure] = valeur.split('T');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return instantADakar(date, heure && /^\d{2}:\d{2}/.test(heure) ? heure.slice(0, 5) : HEURE_DE_REPORT);
}

/**
 * Le balayage d'une ligne : à droite au-delà du seuil, « Fait » ; à gauche, « Reporter » ; en deçà,
 * rien. Le seuil est le tiers de la ligne, borné à 96 px (la largeur du fond « Fait » de la maquette).
 */
export function issueDuBalayage(dx: number, largeur: number): 'fait' | 'reporter' | null {
  const seuil = Math.min(96, Math.max(48, largeur / 3));
  if (dx >= seuil) return 'fait';
  if (dx <= -seuil) return 'reporter';
  return null;
}
