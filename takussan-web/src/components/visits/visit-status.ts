import type { StatusTone } from '@/components/console';
import type { VisitStatus, VisitType } from '@/types/visit';

/**
 * TCK-292 — tables hors composant : elles transportent la CLÉ (relative au namespace `visits`),
 * le rendu la résout. Partagées par la liste et le détail : un seul vocabulaire de statut.
 */
export const VISIT_STATUS_LABEL_KEY: Record<VisitStatus, string> = {
  scheduled: 'status.scheduled',
  confirmed: 'status.confirmed',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
  no_show: 'status.no_show',
};

/**
 * Revue design 2026-09-16 — la liste peignait ses statuts en variantes de `Badge`
 * (`outline`/`default`/`destructive`) et le détail les peignait tous en `outline` : une visite
 * « demandée » et une visite « annulée » se lisaient pareil. Le ton passe par `StatusBadge`, seul
 * décideur de couleur d'un statut (TCK-472). « Demandée » attend une action de l'agence.
 */
export const VISIT_STATUS_TONE: Record<VisitStatus, StatusTone> = {
  scheduled: 'attention',
  confirmed: 'info',
  completed: 'success',
  cancelled: 'neutral',
  no_show: 'danger',
};

export const VISIT_TYPE_LABEL_KEY: Record<VisitType, string> = {
  in_person: 'type.in_person',
  virtual: 'type.virtual',
  self_guided: 'type.self_guided',
  hybrid: 'type.hybrid',
};
