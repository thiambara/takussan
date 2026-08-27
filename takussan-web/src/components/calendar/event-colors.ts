/**
 * TCK-072 — Code couleur des événements calendrier.
 *
 * Réservations confirmées : `--info`.
 * Visites confirmées : `--primary` (terracotta).
 * Baux / périodes longues : `--success`.
 * Statuts en attente (`pending` / `scheduled` / `pending_signature`) : `--muted` — pour distinguer
 * visuellement les demandes non traitées.
 *
 * ⚠ **TCK-381 — QUATRE jetons DISTINCTS, et c'est une contrainte, pas une préférence.** Ce module
 * portait bleu / violet / vert / gris ; le barème de substitution ramenait bleu ET violet sur
 * `--info`, ce qui rendait une réservation et une visite indiscernables **dans la grille du mois**,
 * là où la bulle est trop étroite pour porter son libellé. La couleur y est le seul canal
 * d'information — c'est le cas, rare, où collapser sur les tons sémantiques retire du sens plutôt
 * que d'en aligner. La visite prend donc `--primary`.
 */

import type { CalendarEvent } from '@/types/calendar';

export type EventPalette = {
  /** Utilisé sur la bulle événement dans la grille mois/semaine. */
  pill: string;
  /** Utilisé sur le bandeau latéral du slide-over. */
  accent: string;
  /**
   * Clé i18n du texte affiché sur fond coloré (contraste WCAG AA), relative au namespace
   * `calendar`. TCK-292 : ce module n'est pas un composant, il ne peut pas appeler
   * `useTranslations` — la donnée porte la CLÉ, le rendu la résout.
   */
  labelKey: string;
};

export function paletteFor(event: Pick<CalendarEvent, 'type' | 'status'>): EventPalette {
  const pending =
    event.status === 'pending' || event.status === 'scheduled' || event.status === 'pending_signature';
  if (pending) {
    return {
      pill: 'bg-muted text-muted-foreground border-border',
      accent: 'bg-muted-foreground',
      labelKey: 'eventStatus.pending',
    };
  }
  if (event.type === 'booking') {
    return {
      pill: 'bg-info/15 text-info border-info/30',
      accent: 'bg-info',
      labelKey: 'eventStatus.confirmed',
    };
  }
  if (event.type === 'lease') {
    return {
      pill: 'bg-success/15 text-success border-success/30',
      accent: 'bg-success',
      labelKey: 'eventStatus.lease',
    };
  }
  // visit
  return {
    pill: 'bg-primary/12 text-primary border-primary/30',
    accent: 'bg-primary',
    labelKey: 'eventStatus.confirmed',
  };
}

/** Clé i18n du type d'événement, relative au namespace `calendar` (cf. `labelKey`). */
export function typeLabelKey(type: CalendarEvent['type']): string {
  if (type === 'booking') return 'eventType.booking';
  if (type === 'lease') return 'eventType.lease';
  return 'eventType.visit';
}
