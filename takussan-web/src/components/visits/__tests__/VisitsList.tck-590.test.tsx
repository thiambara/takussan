/**
 * TCK-590 — l'onglet « Non attribuées » : le personnel voit les visites qu'aucun agent n'a prises
 * (`filter[unassigned]`) ; un bailleur ne le voit pas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { VisitsList } from '../VisitsList';
import type { PropertyVisit } from '@/types/visit';

const etat = vi.hoisted(() => ({
  roles: ['agent'] as string[],
  appels: [] as Array<Record<string, unknown>>,
}));

const sansAgent: PropertyVisit = {
  id: 4,
  property_id: 10,
  agent_id: null,
  type: 'in_person',
  status: 'scheduled',
  scheduled_at: '2026-11-12T10:00:00Z',
  property: { id: 10, title: 'Studio Mermoz', slug: 'studio-mermoz' },
};

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, roles: etat.roles } }) }));
vi.mock('@/lib/queries/visits', () => ({
  useVisits: (params: Record<string, unknown>) => {
    etat.appels.push(params);
    return {
      data: { data: params.unassigned ? [sansAgent] : [], meta: { total: params.unassigned ? 1 : 0 } },
      isLoading: false,
      isError: false,
    };
  },
}));

describe('<VisitsList> — TCK-590', () => {
  beforeEach(() => {
    etat.roles = ['agent'];
    etat.appels = [];
  });

  it('le personnel a l’onglet « Non attribuées », filtré côté serveur', async () => {
    const user = userEvent.setup();
    render(withIntl(<VisitsList />));

    expect(etat.appels).toContainEqual(expect.objectContaining({ unassigned: true, status: 'scheduled' }));
    await user.click(screen.getByRole('tab', { name: /non attribuées/i }));
    expect(screen.getByText('Studio Mermoz')).toBeInTheDocument();
    expect(screen.getByText('Non attribuée')).toBeInTheDocument();
  });

  it('un bailleur n’a pas l’onglet', () => {
    etat.roles = ['owner'];
    render(withIntl(<VisitsList />));
    expect(screen.queryByRole('tab', { name: /non attribuées/i })).not.toBeInTheDocument();
  });
});
