/**
 * TCK-505 (#6) — les puces d'événement de la vue mois débordaient de leur cellule.
 *
 * Mesuré le 2026-09-02 sur `/app/calendar` : à 360-390 px, une puce `w-full truncate` sortait
 * par la droite de sa cellule (bord droit à 393-486 px sur un viewport de 360). La cause n'est
 * pas la puce : c'est la cellule de jour, enfant de `grid grid-cols-7`, qui a `min-width: auto`
 * — donc au moins la largeur du titre en `nowrap` — et s'élargit au lieu de laisser `truncate`
 * couper. `min-w-0` rend à la cellule la largeur de sa colonne, `overflow-hidden` retient ce
 * qui dépasserait malgré tout.
 *
 * jsdom ne pose pas de mise en page : le test garde la CLASSE, et le banc de mesure au
 * navigateur garde le pixel. Ablation : retirer `min-w-0` de la cellule fait rougir ce test.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { MonthView } from '../MonthView';
import type { CalendarEvent } from '@/types/calendar';

const FOCUS = new Date(2026, 0, 15);

const VISITE_AU_TITRE_LONG: CalendarEvent = {
  id: 7,
  type: 'visit',
  title: 'Visite du grand appartement de la Corniche Ouest avec le locataire',
  start: '2026-01-15 10:00:00',
  end: '2026-01-15 10:30:00',
  status: 'confirmed',
  all_day: false,
  duration_minutes: 30,
  property_id: 11,
  property_slug: 'appart-corniche',
  resource_url: '/app/visits/7',
};

describe('<MonthView> — la puce reste dans sa cellule (TCK-505 #6)', () => {
  it('borne la largeur de la cellule de jour pour que `truncate` opère', () => {
    render(withIntl(<MonthView focus={FOCUS} events={[VISITE_AU_TITRE_LONG]} onSelect={() => {}} />));

    const cellule = screen.getByTestId('calendar-day-2026-01-15');
    expect(cellule).toHaveClass('min-w-0');
    expect(cellule).toHaveClass('overflow-hidden');
    // La puce est bien dans cette cellule, et c'est elle que la cellule doit contenir.
    expect(cellule).toContainElement(screen.getByTestId('calendar-event-pill-visit-7'));
    expect(screen.getByTestId('calendar-event-pill-visit-7')).toHaveClass('truncate');
  });

  it('coupe le titre dans un span en BLOC, car `truncate` est inerte sur un inline', () => {
    render(withIntl(<MonthView focus={FOCUS} events={[VISITE_AU_TITRE_LONG]} onSelect={() => {}} />));

    // Mesuré : en inline, le span gardait 410 px de large sur un viewport de 390 — le bouton
    // le clippait, mais son propre `overflow: hidden` ne s'appliquait à rien.
    const titre = screen.getByText(VISITE_AU_TITRE_LONG.title);
    expect(titre.tagName).toBe('SPAN');
    expect(titre).toHaveClass('block', 'truncate');
  });

  it('borne chaque cellule de la grille, pas seulement celle qui porte un événement', () => {
    render(withIntl(<MonthView focus={FOCUS} events={[]} onSelect={() => {}} />));

    const cellules = screen.getAllByRole('gridcell');
    expect(cellules.length).toBeGreaterThanOrEqual(28);
    for (const cellule of cellules) {
      expect(cellule).toHaveClass('min-w-0');
    }
  });
});
