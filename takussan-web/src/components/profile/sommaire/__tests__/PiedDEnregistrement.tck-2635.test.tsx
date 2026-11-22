import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';
import { Button } from '@/components/ui/button';
import { withIntl } from '@/test/intl';
import { PiedDEnregistrement } from '../PiedDEnregistrement';

/**
 * TCK-2635 — LE pied d'une section du profil : au bureau, sous la section (bouton, puis le compte des
 * modifications) ; au téléphone, TANT QU'IL Y A une modification, le bouton dans la barre d'action de
 * la coque, et la section se déclare « formulaire » (la barre d'onglets s'efface devant elle) — sans
 * modification, la navigation reste. Un seul « Enregistrer » dans le DOM, et le focus n'est pas perdu.
 */
function Temoin() {
  const { formulaire } = useDeclarationDEnTete();
  return <span data-testid="declaration">{formulaire ? "formulaire" : "rien"}</span>;
}

function arbre(modifications: number) {
  return withIntl(
    <FournisseurDEnTete>
      <form id="f">
        <PiedDEnregistrement
          modifications={modifications}
          bouton={<Button type="submit" form="f" disabled={modifications === 0}>Enregistrer</Button>}
        >
          <p role="status">Enregistré.</p>
        </PiedDEnregistrement>
      </form>
      <Temoin />
    </FournisseurDEnTete>,
  );
}

function monter(modifications = 2) {
  return render(arbre(modifications));
}

function telephone(oui: boolean) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: oui && query === '(width < 48rem)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList);
}

afterEach(() => vi.restoreAllMocks());

describe('<PiedDEnregistrement> (TCK-2635)', () => {
  it('au bureau : le bouton, le compte et les retours sous la section ; aucune déclaration', () => {
    telephone(false);
    const { container } = monter();
    expect(screen.getAllByRole('button', { name: 'Enregistrer' })).toHaveLength(1);
    const pied = container.querySelector('[data-slot="pied-d-enregistrement"]')!;
    expect(pied).toContainElement(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(pied).toHaveTextContent('2 modifications non enregistrées');
    expect(container.querySelector('[data-slot="barre-d-action"]')).toBeNull();
    expect(screen.getByTestId('declaration')).toHaveTextContent('rien');
  });

  it('au téléphone : le bouton dans la barre d’action, la section se déclare « formulaire »', () => {
    telephone(true);
    const { container } = monter();
    expect(screen.getAllByRole('button', { name: 'Enregistrer' })).toHaveLength(1);
    expect(container.querySelector('[data-slot="barre-d-action"]')).toContainElement(screen.getByRole('button', { name: 'Enregistrer' }));
    // Le compte et le retour restent sous le formulaire, hors de la barre.
    expect(container.querySelector('[data-slot="pied-d-enregistrement"]')).toHaveTextContent('2 modifications non enregistrées');
    expect(screen.getByRole('status')).toHaveTextContent('Enregistré.');
    expect(screen.getByTestId('declaration')).toHaveTextContent('formulaire');
  });

  it('au téléphone SANS modification : la navigation reste — ni barre d’action ni déclaration, le pied sous la section', () => {
    telephone(true);
    const { container } = monter(0);
    expect(screen.getAllByRole('button', { name: 'Enregistrer' })).toHaveLength(1);
    expect(container.querySelector('[data-slot="barre-d-action"]')).toBeNull();
    const pied = container.querySelector('[data-slot="pied-d-enregistrement"]')!;
    expect(pied).toContainElement(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(pied.className).not.toContain('max-md:hidden');
    expect(screen.getByTestId('declaration')).toHaveTextContent('rien');
  });

  it('au téléphone : la barre paraît à la première modification et s’efface une fois tout enregistré', () => {
    telephone(true);
    const { container, rerender } = monter(0);
    expect(screen.getByTestId('declaration')).toHaveTextContent('rien');
    rerender(arbre(1));
    expect(container.querySelector('[data-slot="barre-d-action"]')).toContainElement(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByTestId('declaration')).toHaveTextContent('formulaire');
    rerender(arbre(0));
    expect(container.querySelector('[data-slot="barre-d-action"]')).toBeNull();
    expect(screen.getByTestId('declaration')).toHaveTextContent('rien');
  });

  it('clavier : enregistré depuis la barre, le focus n’est pas perdu — il revient au pied, qui porte le retour', () => {
    telephone(true);
    const { container, rerender } = monter(1);
    screen.getByRole('button', { name: 'Enregistrer' }).focus();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Enregistrer' }));
    rerender(arbre(0));
    const pied = container.querySelector('[data-slot="pied-d-enregistrement"]');
    expect(document.activeElement).toBe(pied);
    expect(pied).toContainElement(screen.getByRole('status'));
  });

  it('clavier : un focus resté dans un champ n’est pas déplacé quand la barre s’efface', () => {
    telephone(true);
    const { rerender } = render(
      <>
        <input aria-label="Bio" />
        {arbre(1)}
      </>,
    );
    const champ = screen.getByRole('textbox', { name: 'Bio' });
    champ.focus();
    rerender(
      <>
        <input aria-label="Bio" />
        {arbre(0)}
      </>,
    );
    expect(document.activeElement).toBe(champ);
  });
});
