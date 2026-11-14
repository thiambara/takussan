/**
 * TCK-2814 (AC4) — `DataState` lit le statut quand il reçoit l'erreur brute : une panne propose la
 * reprise, un 403 ou un 404 ne la propose pas et dit son texte. Sans erreur brute, le rendu d'avant :
 * texte et reprise (les appelants non migrés ne changent pas).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { DataState } from '../DataState';

const monter = (props: Partial<Parameters<typeof DataState>[0]> = {}) =>
  render(
    <DataState loading={false} error="Impossible de charger." onRetry={vi.fn()} retryLabel="Réessayer" {...props}>
      <p>contenu</p>
    </DataState>,
  );

describe('<DataState> et l’erreur brute (TCK-2814)', () => {
  it.each([
    ['une panne (500)', new ApiError(500, null)],
    ['une erreur réseau', new TypeError('Failed to fetch')],
  ])('%s : le texte et « Réessayer »', (_nom, erreur) => {
    monter({ erreurBrute: erreur });
    expect(screen.getByText('Impossible de charger.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('un 403 dit le refus, sans « Réessayer »', () => {
    monter({ erreurBrute: new ApiError(403, null), messageRefus: 'Refusé.', messageIntrouvable: 'Absent.' });
    expect(screen.getByText('Refusé.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('un 404 dit l’absence, sans « Réessayer »', () => {
    monter({ erreurBrute: new ApiError(404, null), messageRefus: 'Refusé.', messageIntrouvable: 'Absent.' });
    expect(screen.getByText('Absent.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('un 403 sans texte de refus garde le texte de l’appelant, toujours sans reprise', () => {
    monter({ erreurBrute: new ApiError(403, null) });
    expect(screen.getByText('Impossible de charger.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('sans erreur brute : le rendu d’aujourd’hui, avec reprise (appelant non migré)', () => {
    monter();
    expect(screen.getByText('Impossible de charger.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });
});
