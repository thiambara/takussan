import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { QueryBoundary } from '../QueryBoundary';

/**
 * TCK-2751 (AC3) — un 403 ne propose pas « Réessayer » : l'objet relève d'un autre espace, ou d'un
 * droit absent, et réessayer ne change rien. Les autres erreurs gardent leur reprise.
 */
function rendre(error: unknown) {
  const query = { isLoading: false, isError: true, error, data: undefined, refetch: vi.fn() };
  return render(withIntl(<QueryBoundary query={query}>{() => null}</QueryBoundary>));
}

describe('<QueryBoundary> sur une erreur (TCK-2751)', () => {
  it('un 403 rend son message, sans « Réessayer »', () => {
    rendre(new ApiError(403, { message: 'Vous n’avez pas accès à cette action.' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('une panne (500) garde « Réessayer »', () => {
    rendre(new ApiError(500, { message: 'Erreur serveur' }));
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('une erreur réseau (hors API) garde « Réessayer »', () => {
    rendre(new TypeError('Failed to fetch'));
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
