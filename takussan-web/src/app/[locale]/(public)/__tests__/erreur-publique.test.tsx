/**
 * TCK-2515 · AC3 — l'erreur d'une page publique.
 *
 * Avant ce ticket, seule la racine avait un `error.tsx` : toute exception d'une page publique
 * remplaçait le site entier par un écran à barre de marque et un seul bouton, « Réessayer ». Si
 * réessayer échouait encore, le visiteur était enfermé. La frontière vit maintenant sous
 * `[locale]/(public)` : le layout du groupe (barre d'onglets du téléphone, comparateur) reste
 * autour, et l'écran remonte lui-même la `Navbar` et le pied de page — chaque page publique monte
 * les siens, la frontière les remplace donc avec la page.
 *
 * ⚠ Ce fichier ne lit pas de code HTTP (aucun harnais e2e) : le statut a été relevé à la main, sur
 * une page-sonde qui lève, dans les notes du ticket.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

import ErreurPublique from '../error';

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));

function erreur(digest?: string): Error & { digest?: string } {
  return Object.assign(new Error('boum'), digest ? { digest } : {});
}

describe('error.tsx du site public — TCK-2515', () => {
  it('AC3 — la navigation reste rendue autour de l’erreur', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(withIntl(<ErreurPublique error={erreur('3f9a2c1d')} reset={() => {}} />));

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByTestId('footer')).toBeInTheDocument();
    // Le titre est dans le <main>, la chrome hors de lui (TCK-895).
    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByRole('heading', { level: 1, name: 'Cette page n’a pas pu s’afficher' }));
    expect(main).not.toContainElement(screen.getByTestId('navbar'));
  });

  it('AC3 — « Réessayer » rappelle reset(), « Retour à l’accueil » mène à l’accueil de la langue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    const user = userEvent.setup();
    render(withIntl(<ErreurPublique error={erreur()} reset={reset} />));

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Retour à l’accueil' })).toHaveAttribute('href', '/fr');
  });

  it('la référence technique (digest) s’affiche quand elle existe, et seulement alors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(withIntl(<ErreurPublique error={erreur('3f9a2c1d')} reset={() => {}} />));
    expect(screen.getByText('Réf. 3f9a2c1d')).toBeInTheDocument();
    unmount();

    render(withIntl(<ErreurPublique error={erreur()} reset={() => {}} />));
    expect(screen.queryByText(/Réf\./)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copier la référence' })).toBeNull();
  });

  it('le message de l’erreur ne sort jamais à l’écran : seule la référence (revue)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const erreurBavarde = Object.assign(new Error('secret-xyz'), { digest: 'abc123' });
    const { container } = render(withIntl(<ErreurPublique error={erreurBavarde} reset={() => {}} />));
    expect(screen.getByText('Réf. abc123')).toBeInTheDocument();
    expect(screen.queryByText(/secret-xyz/)).toBeNull();
    expect(container.textContent).not.toContain('secret-xyz');
  });

  it('pas de « Signaler le problème » (décision du porteur, 2026-11-08)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(withIntl(<ErreurPublique error={erreur('x')} reset={() => {}} />));
    expect(screen.queryByText(/signaler/i)).toBeNull();
  });

  it('rend en anglais sous /en', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(withIntl(<ErreurPublique error={erreur()} reset={() => {}} />, 'en'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This page could not be displayed');
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/en');
  });
});
