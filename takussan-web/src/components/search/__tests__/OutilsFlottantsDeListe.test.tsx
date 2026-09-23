import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { FloatingDockProvider, useFloatingDockSlot } from '@/components/floating-dock';
import { OutilsFlottantsDeListe, HAUTEUR_OUTILS_FLOTTANTS_PX } from '../OutilsFlottantsDeListe';

/**
 * TCK-552 — Filtres et Carte restent à portée du pouce pendant le défilement (P4, AC3).
 *
 * Le dock flottant (TCK-275) est l'UNIQUE orchestrateur du bas d'écran : ce qui est garde ici,
 * c'est que la pastille passe par lui — donc que la barre du comparateur et le bouton de
 * messagerie se décalent AU-DESSUS d'elle au lieu d'être recouverts — et qu'elle ne réserve
 * aucune place quand elle n'est pas montrée.
 */

const BASE = 'var(--floating-dock-base, 16px)';

/** Sonde qui se déclare comme la barre du comparateur (même id, même priorité). */
function SondeComparateur() {
  const { bottom } = useFloatingDockSlot({
    id: 'compare-floating-bar',
    corner: 'bottom-right',
    priority: 1,
    height: 176,
  });
  return <div data-testid="comparateur" data-bottom={bottom} />;
}

let mobile = true;
const matchMediaOriginal = window.matchMedia;

beforeEach(() => {
  mobile = true;
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width: 1023px') ? mobile : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = matchMediaOriginal;
});

function monte(props: Partial<React.ComponentProps<typeof OutilsFlottantsDeListe>> = {}) {
  const onOuvrirFiltres = vi.fn();
  const onBasculerVue = vi.fn();
  render(withIntl(
    <FloatingDockProvider>
      <OutilsFlottantsDeListe
        visible
        activeCount={3}
        vue="list"
        onOuvrirFiltres={onOuvrirFiltres}
        onBasculerVue={onBasculerVue}
        {...props}
      />
      <SondeComparateur />
    </FloatingDockProvider>,
  ));
  return { onOuvrirFiltres, onBasculerVue };
}

describe('<OutilsFlottantsDeListe>', () => {
  it('offre Filtres (avec son compte) et Carte, activables', async () => {
    const { onOuvrirFiltres, onBasculerVue } = monte();
    const user = userEvent.setup();

    const filtres = screen.getByRole('button', { name: /filtres/i });
    expect(filtres.textContent).toContain('3');
    await user.click(filtres);
    expect(onOuvrirFiltres).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /carte/i }));
    expect(onBasculerVue).toHaveBeenCalledTimes(1);
  });

  it('en vue carte, propose de revenir à la liste', () => {
    monte({ vue: 'map' });
    expect(screen.getByRole('button', { name: /liste/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /carte/i })).toBeNull();
  });

  it('se pose AU SOL du dock, et le comparateur se décale au-dessus d’elle', () => {
    monte();
    const pastille = screen.getByRole('group');
    expect(pastille.style.bottom).toBe(BASE);
    const comparateur = screen.getByTestId('comparateur').dataset.bottom!;
    expect(comparateur).toContain(`${HAUTEUR_OUTILS_FLOTTANTS_PX}px`);
  });

  it('invisible : rien n’est rendu, et AUCUNE place n’est réservée dans le dock', () => {
    monte({ visible: false });
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByTestId('comparateur').dataset.bottom).toBe(BASE);
  });

  it('à partir de lg : rien n’est rendu (le bureau n’est pas modifié)', () => {
    mobile = false;
    monte();
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByTestId('comparateur').dataset.bottom).toBe(BASE);
  });
});
