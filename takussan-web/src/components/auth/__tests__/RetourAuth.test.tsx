/**
 * Le retour des écrans de connexion — retour testeur du 2026-09-23 (TCK-568, M2).
 *
 * « Pas de possibilité de retour sur ma page de recherche » : sur mobile, `/auth/login` n'offrait
 * que le logo, qui mène à l'accueil. Ces tests éprouvent OÙ le retour paraît, QUAND il suit
 * l'historique (seulement vers le site public) et CE QUE vise son lien sinon.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const back = vi.fn();
let pathname = '/auth/login';
let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname,
  useSearchParams: () => parametres,
}));

import { RetourAuth } from '../RetourAuth';

function monter(chemin: string, requete = '') {
  pathname = chemin;
  parametres = new URLSearchParams(requete);
  return render(withIntl(<RetourAuth libelle="Retour" />));
}

function poserNavigation(valeur: unknown) {
  Object.defineProperty(window, 'navigation', { value: valeur, configurable: true });
}

/** La Navigation API d'un onglet dont l'historique est `chemins`, l'entrée courante la dernière. */
function historique(...chemins: string[]) {
  const entrees = chemins.map((chemin, index) => ({ url: `${window.location.origin}${chemin}`, index }));
  poserNavigation({
    canGoBack: entrees.length > 1,
    currentEntry: entrees[entrees.length - 1],
    entries: () => entrees,
  });
}

beforeEach(() => {
  back.mockReset();
  window.sessionStorage.clear();
});

afterEach(() => {
  poserNavigation(undefined);
  Object.defineProperty(document, 'referrer', { value: '', configurable: true });
});

describe('où le retour paraît', () => {
  it.each(['/auth/login', '/auth/register', '/auth/forgot-password'])('sur %s', (chemin) => {
    monter(chemin);
    expect(screen.getByRole('link', { name: 'Retour' })).toBeInTheDocument();
  });

  it.each(['/auth/verify-email', '/auth/reset-password', '/auth/oauth/google/callback'])(
    'pas sur %s, qui porte sa propre issue',
    (chemin) => {
      monter(chemin);
      expect(screen.queryByRole('link', { name: 'Retour' })).toBeNull();
    },
  );
});

describe('sa cible tactile — TCK-560, W3', () => {
  it('garde 44 px quel que soit le `className` que le layout lui passe', () => {
    pathname = '/auth/login';
    parametres = new URLSearchParams();
    render(withIntl(<RetourAuth libelle="Retour" className="absolute left-3 top-3 min-h-8 lg:left-8" />));

    const classes = screen.getByRole('link', { name: 'Retour' }).className.split(/\s+/);
    expect(classes).toContain('min-h-11');
    expect(classes).not.toContain('min-h-8');
    expect(classes).toEqual(expect.arrayContaining(['absolute', 'left-3', 'top-3', 'lg:left-8']));
  });
});

describe('quand le retour suit l’historique', () => {
  it('arrivé depuis la recherche, il y REVIENT par l’historique — filtres et défilement compris', () => {
    historique('/fr/properties?type=office', '/auth/login');
    monter('/auth/login', 'redirect=%2Ffr%2Fproperties%3Ftype%3Doffice');
    fireEvent.click(screen.getByRole('link', { name: 'Retour' }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  // Revue du 2026-09-23 : `/app` → `/app/messages` → Déconnexion (`router.replace` vers la
  // connexion). `canGoBack` est vrai, l'entrée précédente est `/app` — et `router.back()`
  // rouvrait la console de l'utilisateur déconnecté depuis le cache du routeur.
  it('après une déconnexion, il ne rouvre JAMAIS la console par l’historique', () => {
    historique('/app', '/auth/login');
    window.sessionStorage.setItem('takussan:derniere-page-publique', '/fr/properties?type=office');
    monter('/auth/login');
    const lien = screen.getByRole('link', { name: 'Retour' });
    fireEvent.click(lien);
    expect(back).not.toHaveBeenCalled();
    // … le lien mène à la dernière page publique vue dans l'onglet.
    expect(lien).toHaveAttribute('href', '/fr/properties?type=office');
  });

  it.each([
    ['un autre écran de connexion', '/auth/register'],
    ['une page de l’administration', '/admin/users'],
    ['l’onboarding', '/onboarding/intention'],
  ])('pas davantage vers %s', (_libelle, precedente) => {
    historique(precedente, '/auth/login');
    monter('/auth/login');
    fireEvent.click(screen.getByRole('link', { name: 'Retour' }));
    expect(back).not.toHaveBeenCalled();
  });

  it('première entrée de l’onglet (lien ouvert depuis une messagerie) : le lien', () => {
    historique('/auth/login');
    monter('/auth/login', 'redirect=%2Ffr%2Fproperties%3Ftype%3Doffice');
    fireEvent.click(screen.getByRole('link', { name: 'Retour' }));
    expect(back).not.toHaveBeenCalled();
  });

  // Sans Navigation API, `document.referrer` décrit le CHARGEMENT du document, pas les navigations
  // côté client qui l'ont suivi : il dirait « la recherche » quand l'entrée précédente est `/app`.
  it('sans Navigation API, un référent du site ne suffit pas : le lien', () => {
    poserNavigation(undefined);
    Object.defineProperty(document, 'referrer', {
      value: `${window.location.origin}/fr/properties?type=office`,
      configurable: true,
    });
    monter('/auth/login');
    fireEvent.click(screen.getByRole('link', { name: 'Retour' }));
    expect(back).not.toHaveBeenCalled();
  });

  it('un ⌘-clic ouvre le lien dans un onglet, sans toucher à l’historique', () => {
    historique('/fr/properties?type=office', '/auth/login');
    monter('/auth/login');
    fireEvent.click(screen.getByRole('link', { name: 'Retour' }), { metaKey: true });
    expect(back).not.toHaveBeenCalled();
  });
});

describe('ce que vise le lien', () => {
  it('la page que la connexion devait rouvrir, si elle est publique', () => {
    historique('/auth/login');
    monter('/auth/login', 'redirect=%2Ffr%2Fproperties%3Ftype%3Doffice');
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/fr/properties?type=office');
  });

  it('elle passe avant la dernière page publique mémorisée', () => {
    window.sessionStorage.setItem('takussan:derniere-page-publique', '/fr/agents');
    monter('/auth/login', 'redirect=%2Ffr%2Fproperties%2Fvilla-a-fann');
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/fr/properties/villa-a-fann');
  });

  // Le cas du testeur, arrivé depuis WhatsApp, sans Navigation API : le lien « Connexion » de la
  // barre ne porte pas de `?redirect=` — la mémoire de l'onglet tient lieu de destination.
  it('sans destination, la dernière page publique vue dans l’onglet — filtres compris', () => {
    window.sessionStorage.setItem('takussan:derniere-page-publique', '/fr/properties?type=office&contract_type=rent');
    monter('/auth/login');
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute(
      'href',
      '/fr/properties?type=office&contract_type=rent',
    );
  });

  it('une mémoire falsifiée (hors du site, console) n’est jamais suivie', () => {
    window.sessionStorage.setItem('takussan:derniere-page-publique', '//evil.tld/fr');
    monter('/auth/login');
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/fr');
  });

  it('une destination de console n’est pas un retour : repli sur l’accueil', () => {
    monter('/auth/login', 'redirect=%2Fapp%2Fowners');
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/fr');
  });

  it('une destination hors du site n’est jamais suivie', () => {
    monter('/auth/login', 'redirect=%2F%2Fevil.tld');
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/fr');
  });

  it('sans destination ni mémoire : l’accueil, dans la langue courante', () => {
    monter('/auth/login');
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/fr');
  });
});
