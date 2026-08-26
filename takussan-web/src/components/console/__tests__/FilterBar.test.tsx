import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FilterBar } from '@/components/console';

describe('<FilterBar>', () => {
  it('rend ses contrôles et le compteur de résultats', () => {
    render(
      <FilterBar resultCount="128 biens">
        <input aria-label="Recherche" />
      </FilterBar>,
    );

    expect(screen.getByLabelText('Recherche')).toBeInTheDocument();
    expect(screen.getByText('128 biens')).toBeInTheDocument();
  });

  it('déclenche la réinitialisation', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();

    render(
      <FilterBar onReset={onReset} resetLabel="Réinitialiser">
        <input aria-label="Recherche" />
      </FilterBar>,
    );

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  /**
   * `onReset` et `resetLabel` vont ENSEMBLE — même contrat que `onRetry`/`retryLabel`
   * d'`ErrorState`. Le typage l'impose ; ce test vérifie que le rendu ne triche pas non plus.
   */
  it("n'affiche aucun bouton sans libellé de réinitialisation", () => {
    render(
      <FilterBar>
        <input aria-label="Recherche" />
      </FilterBar>,
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('désactive la réinitialisation quand aucun filtre n’est posé', () => {
    render(
      <FilterBar onReset={vi.fn()} resetLabel="Réinitialiser" resetDisabled>
        <input aria-label="Recherche" />
      </FilterBar>,
    );

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled();
  });
});
