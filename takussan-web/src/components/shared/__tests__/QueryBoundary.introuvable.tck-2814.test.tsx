import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { ApiError } from '@/lib/api';
import { QueryBoundary } from '../QueryBoundary';

/**
 * TCK-2814 — `QueryBoundary` juge la reprise par `natureDeLErreur`, le point unique : un 404 ne
 * propose plus « Réessayer » (l'objet n'existe pas, réessayer ne le fera pas apparaître), et la panne
 * — 500 ou réseau — la garde. Ses 16 appelants rendent tous ce bloc par défaut (aucun `errorFallback`).
 */
function rendre(error: unknown) {
  const query = { isLoading: false, isError: true, error, data: undefined, refetch: vi.fn() };
  render(withIntl(<QueryBoundary query={query}>{() => null}</QueryBoundary>));
  return query;
}

describe('<QueryBoundary> : 404 sans reprise, panne avec (TCK-2814)', () => {
  it('un 404 rend son message, sans « Réessayer »', () => {
    rendre(new ApiError(404, { message: 'Introuvable.' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it.each([
    ['une panne (500)', new ApiError(500, { message: 'Erreur serveur' })],
    ['une erreur réseau', new TypeError('Failed to fetch')],
  ])('%s garde « Réessayer », et un clic relance la lecture', async (_nom, erreur) => {
    const query = rendre(erreur);
    screen.getByRole('button', { name: 'Réessayer' }).click();
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });
});
