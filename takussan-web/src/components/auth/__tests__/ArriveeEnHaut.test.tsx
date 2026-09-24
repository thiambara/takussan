/**
 * Les écrans de connexion s'ouvrent en haut — revue du 2026-09-23 (TCK-568, M2).
 *
 * Mesuré avant le correctif, Chrome à 320 × 640 : la recherche défilée à 600 px, puis « Connexion »
 * → `/auth/login` ouverte à `scrollY` 82 (le maximum), le « Retour » à `top` −70, hors de l'écran.
 * Next ne remonte que jusqu'au haut de la PAGE, jamais du layout qui porte le retour.
 *
 * jsdom ne pose aucune mise en page : `scrollTo` est remplacé par une fenêtre qui retient sa
 * position, et le test part d'une arrivée DÉJÀ défilée — le cas qui manquait à toutes les mesures
 * « sur un chargement neuf ». Que le layout de `(auth)` le MONTE : `layout.retour.test.tsx`.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/auth/login';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

import { ArriveeEnHaut } from '../ArriveeEnHaut';

let defilement = 0;

beforeEach(() => {
  pathname = '/auth/login';
  defilement = 600; // la recherche quittée, défilée
  vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
    defilement = options.top ?? defilement;
  }) as typeof window.scrollTo);
  window.history.replaceState({}, '', '/auth/login');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ArriveeEnHaut', () => {
  it('une arrivée défilée repart du SOMMET du document — là où vit le retour', () => {
    render(<ArriveeEnHaut />);

    expect(defilement).toBe(0);
    // Sans animation : un défilement doux laisserait le retour hors de l'écran le temps qu'il dure.
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('passer d’un écran à l’autre de `(auth)` remonte aussi — le layout, lui, reste monté', () => {
    const { rerender } = render(<ArriveeEnHaut />);
    defilement = 223; // la connexion défilée jusqu'à « Créer un compte »

    pathname = '/auth/register';
    rerender(<ArriveeEnHaut />);

    expect(defilement).toBe(0);
  });

  it('un rendu sans changement d’écran ne touche pas au défilement de l’utilisateur', () => {
    const { rerender } = render(<ArriveeEnHaut />);
    defilement = 140; // l'utilisateur descend vers le bouton de connexion

    rerender(<ArriveeEnHaut />);

    expect(defilement).toBe(140);
  });

  it('une ancre visée explicitement garde la main', () => {
    window.history.replaceState({}, '', '/auth/login#mot-de-passe');

    render(<ArriveeEnHaut />);

    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});
