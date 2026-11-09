import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({ usePathname: () => '/fr/agencies/dakar-immo' }));

import { EnTeteDeFiche } from '../EnTeteDeFiche';

type Rappel = (entrees: Partial<IntersectionObserverEntry>[]) => void;
let rappel: Rappel | null = null;

beforeEach(() => {
  rappel = null;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Rappel) {
        rappel = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const couverture = (haut: number, visible: boolean) =>
  act(() => rappel?.([{ isIntersecting: visible, boundingClientRect: { top: haut } as DOMRectReadOnly }]));

/**
 * TCK-2522 / TCK-2568 — le haut de la fiche d'agence au téléphone suit la maquette FicheDBiens :
 * retour et partager sur la couverture ; la couverture sortie, ce sont les onglets qui collent à
 * `top-0` (décision de la session, revue du 2026-11-09) — pas de rangée « ← Dakar Immo » en plus.
 */
describe('EnTeteDeFiche', () => {
  it('en haut de page : retour et partager sur la couverture, pas de rangée', () => {
    render(withIntl(<EnTeteDeFiche nom="Dakar Immo" repli="/agencies"><div data-couverture /></EnTeteDeFiche>));

    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/fr/agencies');
    expect(screen.getByRole('button', { name: 'Partager la fiche de Dakar Immo' })).toBeInTheDocument();
    expect(screen.queryByText('Dakar Immo')).not.toBeInTheDocument();
  });

  it('la couverture sortie de l’écran : AUCUNE rangée ne se fixe — les onglets tiennent le haut (maquette FicheDBiens)', () => {
    render(withIntl(<EnTeteDeFiche nom="Dakar Immo" repli="/agencies"><div data-couverture /></EnTeteDeFiche>));

    couverture(-400, false);
    expect(screen.queryByText('Dakar Immo')).not.toBeInTheDocument();
    expect(document.querySelectorAll('header')).toHaveLength(1);
    expect(document.querySelector('header')).not.toHaveClass('fixed');
  });
});

/**
 * TCK-2523 — la fiche de personne (maquette `EnTete`) : la rangée « ← · [partager] » est toujours là,
 * vide de titre ; le rappel « Biens de … » paraît quand l'identité est passée SOUS la rangée (56 px).
 */
describe('EnTeteDeFiche — variante barre', () => {
  const rendre = () =>
    render(
      withIntl(
        <EnTeteDeFiche nom="Sokhna G." repli="/agents" variante="barre" rappel="Biens de Sokhna G.">
          <div data-identite />
        </EnTeteDeFiche>,
      ),
    );

  it('en haut de page : retour et partager dans la rangée, sans titre', () => {
    rendre();
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/fr/agents');
    expect(screen.getByRole('button', { name: 'Partager la fiche de Sokhna G.' })).toBeInTheDocument();
    expect(screen.queryByText('Biens de Sokhna G.')).not.toBeInTheDocument();
  });

  it('l’identité passée sous la rangée (bas à 20 px, sous ses 56 px) : le rappel paraît, en <p>', () => {
    rendre();
    couverture(20, false);
    expect(screen.getByText('Biens de Sokhna G.').tagName).toBe('P');

    couverture(900, false);
    expect(screen.queryByText('Biens de Sokhna G.')).not.toBeInTheDocument();
  });
});
