/**
 * TCK-072 — Code couleur des événements calendrier.
 *
 * Réservations confirmées : bleu.
 * Visites confirmées : violet.
 * Baux / périodes longues : vert.
 * Statuts en attente (`pending` / `scheduled` / `pending_signature`) : gris — pour distinguer
 * visuellement les demandes non traitées.
 */

import type { CalendarEvent } from '@/types/calendar';

export type EventPalette = {
  /** Utilisé sur la bulle événement dans la grille mois/semaine. */
  pill: string;
  /** Utilisé sur le bandeau latéral du slide-over. */
  accent: string;
  /** Texte sur fond coloré (pour s'assurer d'un contraste WCAG AA). */
  label: string;
};

export function paletteFor(event: Pick<CalendarEvent, 'type' | 'status'>): EventPalette {
  const pending =
    event.status === 'pending' || event.status === 'scheduled' || event.status === 'pending_signature';
  if (pending) {
    return {
      pill: 'bg-stone-100 text-stone-700 border-stone-300',
      accent: 'bg-stone-400',
      label: 'En attente',
    };
  }
  if (event.type === 'booking') {
    return {
      pill: 'bg-blue-100 text-blue-800 border-blue-300',
      accent: 'bg-blue-500',
      label: 'Confirmée',
    };
  }
  if (event.type === 'lease') {
    return {
      pill: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      accent: 'bg-emerald-500',
      label: 'Bail',
    };
  }
  // visit
  return {
    pill: 'bg-violet-100 text-violet-800 border-violet-300',
    accent: 'bg-violet-500',
    label: 'Confirmée',
  };
}

export function typeLabel(type: CalendarEvent['type']): string {
  if (type === 'booking') return 'Réservation';
  if (type === 'lease') return 'Bail';
  return 'Visite';
}
