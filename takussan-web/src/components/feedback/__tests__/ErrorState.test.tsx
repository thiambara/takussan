import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorState } from '@/components/feedback';

describe('ErrorState', () => {
  it('annonce le message via role="alert" — une seule fois', () => {
    render(<ErrorState message="Impossible de charger les baux." />);

    const alerts = screen.getAllByRole('alert');
    // `DestructiveBanner` pose le rôle. Les blocs migrés portaient souvent le leur : si les deux
    // se cumulaient, le lecteur d'écran annoncerait deux fois.
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent('Impossible de charger les baux.');
  });

  it("ne rend aucun bouton sans onRetry — c'est ce qui le garde utilisable depuis un server component", () => {
    render(<ErrorState message="Agence introuvable." />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('rend le bouton de reprise et le déclenche', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Erreur" onRetry={onRetry} retryLabel="Réessayer" />);

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
