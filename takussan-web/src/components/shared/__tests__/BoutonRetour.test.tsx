import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const back = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, push: vi.fn(), prefetch: vi.fn() }) }));

import { BoutonRetour } from '../BoutonRetour';

function poserNavigation(valeur: unknown) {
  Object.defineProperty(window, 'navigation', { value: valeur, configurable: true });
}

afterEach(() => {
  back.mockReset();
  poserNavigation(undefined);
});

describe('BoutonRetour — fiches publiques d’agent et d’agence', () => {
  it('est un vrai lien vers la liste, préfixé de la langue', () => {
    render(withIntl(<BoutonRetour repli="/agents" libelle="Retour" />));
    expect(screen.getByRole('link', { name: 'Retour' }).getAttribute('href')).toBe('/fr/agents');
  });

  it('revient en arrière quand la page précédente est sur le site', () => {
    poserNavigation({ canGoBack: true });
    render(withIntl(<BoutonRetour repli="/agents" libelle="Retour" />));
    const evenement = fireEvent.click(screen.getByRole('link', { name: 'Retour' }));
    expect(back).toHaveBeenCalledTimes(1);
    // `fireEvent` rend false quand le défaut a été empêché : on ne suit PAS le lien en plus.
    expect(evenement).toBe(false);
  });

  it('suit le lien de repli quand on arrive de l’extérieur — jamais un retour qui quitte le site', () => {
    poserNavigation({ canGoBack: false });
    render(withIntl(<BoutonRetour repli="/agencies" libelle="Retour" />));
    fireEvent.click(screen.getByRole('link', { name: 'Retour' }));
    expect(back).not.toHaveBeenCalled();
  });

  it('laisse le navigateur ouvrir un onglet sur ⌘-clic', () => {
    poserNavigation({ canGoBack: true });
    render(withIntl(<BoutonRetour repli="/agents" libelle="Retour" />));
    fireEvent.click(screen.getByRole('link', { name: 'Retour' }), { metaKey: true });
    expect(back).not.toHaveBeenCalled();
  });
});
