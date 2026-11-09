/**
 * TCK-2568 — l'en-tête de page du téléphone : un vrai `<h1>` (ou un rappel quand la page a le sien),
 * un retour NOMMÉ qui est un vrai lien vers le repli, et qui revient en arrière seulement quand la
 * page précédente de l'onglet est du site.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({ usePathname: () => '/fr/compare' }));

const { EnTeteDePage } = await import('../EnTeteDePage');

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as Window & { navigation?: unknown }).navigation;
});

function rendre(ui: React.ReactElement) {
  return render(withIntl(ui));
}

describe('EnTeteDePage (TCK-2568)', () => {
  it('le titre est le <h1> de la page par défaut', () => {
    rendre(<EnTeteDePage titre="Professionnels" retour={{ repli: '/agencies' }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Professionnels' })).toBeTruthy();
  });

  it('titreDeLaPage={false} : un rappel, jamais un second <h1>', () => {
    rendre(<EnTeteDePage titre="2 biens · 2 places libres" titreDeLaPage={false} retour={{ repli: '/properties' }} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('2 biens · 2 places libres').tagName).toBe('P');
  });

  it('le retour est un lien nommé « Retour », vers le repli localisé', () => {
    rendre(<EnTeteDePage retour={{ repli: '/properties' }} />);
    const retour = screen.getByRole('link', { name: 'Retour' });
    expect(retour.getAttribute('href')).toBe('/fr/properties');
  });

  it('un libellé fourni remplace « Retour »', () => {
    rendre(<EnTeteDePage retour={{ repli: '/agents', libelle: 'Retour aux agents' }} />);
    expect(screen.getByRole('link', { name: 'Retour aux agents' })).toBeTruthy();
  });

  it('sans retour (page d’onglet), aucun lien de retour', () => {
    rendre(<EnTeteDePage titre="Favoris" retour={null} />);
    expect(screen.queryByRole('link', { name: 'Retour' })).toBeNull();
  });

  it('arrivé d’une page du site : le clic revient en arrière, sans suivre le lien', () => {
    (window as Window & { navigation?: unknown }).navigation = { canGoBack: true };
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    rendre(<EnTeteDePage retour={{ repli: '/properties' }} />);
    const clic = fireEvent.click(screen.getByRole('link', { name: 'Retour' }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(clic).toBe(false); // preventDefault : le lien n'est pas suivi
  });

  it('arrivé d’ailleurs (lien partagé, moteur) : le lien mène au repli, l’historique n’est pas touché', () => {
    (window as Window & { navigation?: unknown }).navigation = { canGoBack: false };
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    rendre(<EnTeteDePage retour={{ repli: '/properties' }} />);
    const clic = fireEvent.click(screen.getByRole('link', { name: 'Retour' }));
    expect(back).not.toHaveBeenCalled();
    expect(clic).toBe(true);
  });

  it('un clic modifié (nouvel onglet) suit toujours le lien', () => {
    (window as Window & { navigation?: unknown }).navigation = { canGoBack: true };
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    rendre(<EnTeteDePage retour={{ repli: '/properties' }} />);
    fireEvent.click(screen.getByRole('link', { name: 'Retour' }), { metaKey: true });
    expect(back).not.toHaveBeenCalled();
  });

  it('téléphone seulement par défaut (lg:hidden) ; aussiEnBureau le garde en bureau', () => {
    const { container, unmount } = rendre(<EnTeteDePage titre="A" />);
    expect(container.querySelector('header')!.className).toContain('lg:hidden');
    unmount();
    const { container: c2 } = rendre(<EnTeteDePage titre="A" aussiEnBureau />);
    expect(c2.querySelector('header')!.className).not.toContain('lg:hidden');
  });

  it('sur la photo : le retour est une cible de 44 px au moins', () => {
    rendre(<EnTeteDePage variante="sur-photo" retour={{ repli: '/properties' }} />);
    const classes = screen.getByRole('link', { name: 'Retour' }).className.split(/\s+/);
    expect(classes).toContain('size-11');
    expect(classes.some((c) => /^size-(\d|10)$/.test(c))).toBe(false);
  });
});
