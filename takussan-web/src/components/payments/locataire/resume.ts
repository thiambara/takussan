/**
 * TCK-2650 — ce que la tête de la page « Paiements » du locataire dit du résumé servi par l'API
 * (`GET /api/me/rent-summary`, TCK-2649). Aucune addition de montants ici : le total et ses deux parts
 * viennent de l'API ; ce module ne fait que COMPTER les lignes pour les nommer.
 */
import type { LigneDuDu, ResumeDuLoyer } from '@/types/invoice';

export type LieuDuReglement = 'agence' | 'en_ligne' | 'mixte';

export interface CompositionDuDu {
  readonly loyers: number;
  readonly charges: number;
  readonly penalites: number;
  /** Le début de période des loyers pénalisés, du plus récent au plus ancien (« octobre et juillet »). */
  readonly moisDesPenalites: readonly string[];
  readonly lieu: LieuDuReglement;
}

export function compositionDuDu(resume: Pick<ResumeDuLoyer, 'items' | 'parts'>): CompositionDuDu {
  const compte = (kind: string) => resume.items.filter((i) => i.kind === kind).length;
  const moisDesPenalites = resume.items
    .filter((i) => i.kind === 'late_fee')
    .map((i) => i.period_start ?? i.due_date)
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => b.localeCompare(a));
  const { payable_online: enLigne, payable_at_agency: aLAgence } = resume.parts;
  return {
    loyers: compte('rent'),
    charges: compte('charges'),
    penalites: compte('late_fee'),
    moisDesPenalites,
    lieu: enLigne > 0 && aLAgence > 0 ? 'mixte' : enLigne > 0 ? 'en_ligne' : 'agence',
  };
}

/** Les lignes du détail, du plus récent au plus ancien, comme la maquette. */
export function lignesDuDetail(items: readonly LigneDuDu[]): readonly LigneDuDu[] {
  return [...items].sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? '') || b.lease_payment_id - a.lease_payment_id);
}

/** Les jours entiers entre aujourd'hui (date de Dakar, `AAAA-MM-JJ`) et une date `AAAA-MM-JJ`. */
export function joursJusquA(date: string, aujourdHui: string): number {
  const jour = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((jour(date.slice(0, 10)) - jour(aujourdHui.slice(0, 10))) / 86_400_000);
}

/** La date du jour à Dakar (UTC+0 toute l'année), `AAAA-MM-JJ`. */
export function aujourdHuiADakar(maintenant: Date = new Date()): string {
  return maintenant.toISOString().slice(0, 10);
}

/** « octobre » commence par une voyelle : « d'octobre », « de juillet ». */
export function commenceParUneVoyelle(mot: string): boolean {
  return /^[aeiouyàâäéèêëîïôöùûü]/i.test(mot.trim());
}
