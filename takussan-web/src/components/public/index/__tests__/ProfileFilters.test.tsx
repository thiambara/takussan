/**
 * La recherche et le filtre par ville des index de profils — TCK-436.
 *
 * Ce que ce fichier éprouve tient en une phrase : **le composant écrit dans l'URL, il ne filtre
 * rien.** C'est la règle du dépôt (filtrer côté serveur, jamais côté client sur une liste déjà
 * récupérée), et elle n'est observable que là — le composant ne reçoit aucune liste de profils, et
 * la seule chose qu'il puisse faire est de naviguer.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

const push = vi.fn();
let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => parametres,
  usePathname: () => '/fr/agencies',
}));

const { ProfileFilters } = await import('../ProfileFilters');

function monter(query = '') {
  parametres = new URLSearchParams(query);
  return render(
    withIntl(
      <ProfileFilters base="/agencies" villes={['Dakar', 'Thiès']} placeholderRecherche="Nom d’une agence" />,
    ),
  );
}

beforeEach(() => {
  push.mockReset();
});

describe('la recherche', () => {
  it('est un vrai formulaire — `Entrée` soumet, et le bouton aussi', async () => {
    // Le motif du formulaire de newsletter INERTE que TCK-437 vient de retirer du pied de page :
    // un champ sans `<form>` laisse le visiteur croire qu'il a cherché.
    const user = userEvent.setup();
    monter();

    expect(screen.getByRole('search')).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'sahel{Enter}');

    expect(push).toHaveBeenCalledWith('/fr/agencies?q=sahel');
  });

  it('n’écrit pas une recherche vide dans l’URL', async () => {
    const user = userEvent.setup();
    monter('q=sahel');

    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(push).toHaveBeenCalledWith('/fr/agencies');
  });

  it('rogne les espaces — « sahel » et «  sahel  » ne sont pas deux URL', async () => {
    const user = userEvent.setup();
    monter();

    await user.type(screen.getByRole('searchbox'), '  sahel  {Enter}');

    expect(push).toHaveBeenCalledWith('/fr/agencies?q=sahel');
  });
});

describe('le filtre par ville', () => {
  it('rend la facette REÇUE, plus « toutes les villes » — aucune liste composée ici', async () => {
    monter();
    for (const libelle of ['Toutes les villes', 'Dakar', 'Thiès']) {
      expect(screen.getByRole('button', { name: libelle })).toBeInTheDocument();
    }
  });

  it('ne rend RIEN quand la facette est vide — un filtre sans option est un décor', () => {
    parametres = new URLSearchParams();
    render(
      withIntl(<ProfileFilters base="/agencies" villes={[]} placeholderRecherche="x" />),
    );
    expect(screen.queryByRole('group', { name: 'Filtrer par ville' })).toBeNull();
  });

  it('écrit `city` et annonce l’état sélectionné', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(screen.getByRole('button', { name: 'Dakar' }));
    expect(push).toHaveBeenCalledWith('/fr/agencies?city=Dakar');
  });

  it('un second clic sur la ville active la RETIRE', async () => {
    const user = userEvent.setup();
    monter('city=Dakar');

    expect(screen.getByRole('button', { name: 'Dakar' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Dakar' }));
    expect(push).toHaveBeenCalledWith('/fr/agencies');
  });
});

describe('la page est TOUJOURS remise à zéro', () => {
  it.each([
    ['une ville', 'Dakar', '/fr/agencies?city=Dakar'],
    ['toutes les villes', 'Toutes les villes', '/fr/agencies'],
  ])('changer %s retire `page`', async (_cas, bouton, attendu) => {
    // Rester sur `?page=4` en changeant de critère donne une page vide sur un jeu de résultats
    // qui, lui, n'est pas vide — un « aucun résultat » faux.
    const user = userEvent.setup();
    monter('city=Thiès&page=4');

    await user.click(screen.getByRole('button', { name: bouton }));
    expect(push).toHaveBeenCalledWith(attendu);
  });

  it('chercher retire `page` aussi', async () => {
    const user = userEvent.setup();
    monter('page=7');

    await user.type(screen.getByRole('searchbox'), 'awa{Enter}');
    expect(push).toHaveBeenCalledWith('/fr/agencies?q=awa');
  });
});

describe('le retour en arrière', () => {
  it('« effacer » n’apparaît que si un filtre est posé, et il les retire TOUS', async () => {
    const { unmount } = monter();
    expect(screen.queryByRole('button', { name: /Effacer/ })).toBeNull();
    unmount();

    const user = userEvent.setup();
    monter('city=Dakar&q=awa&page=2');
    await user.click(screen.getByRole('button', { name: /Effacer/ }));

    expect(push).toHaveBeenCalledWith('/fr/agencies');
  });
});

describe('les paramètres inconnus survivent à une navigation', () => {
  it('un paramètre de campagne n’est pas effacé par un changement de ville', async () => {
    const user = userEvent.setup();
    monter('utm_source=lettre');

    await user.click(screen.getByRole('button', { name: 'Thiès' }));
    expect(push).toHaveBeenCalledWith('/fr/agencies?utm_source=lettre&city=Thi%C3%A8s');
  });
});
