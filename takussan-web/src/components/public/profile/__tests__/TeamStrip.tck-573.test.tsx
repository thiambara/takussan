import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import { TeamStrip } from '../TeamStrip';

/**
 * TCK-573 — l'équipe publique d'une agence mêle ses agents et les propriétaires qui publient sous
 * son enseigne (TCK-276). Mesuré le 2026-09-24 sur `/api/public/agencies/dakar-immo` : 18 personnes,
 * dont 11 propriétaires, sous le titre « 18 agents pour t'accompagner » et sans rien qui les
 * distingue. Chaque carte dit désormais ce qu'est la personne.
 */
describe('<TeamStrip> — chaque personne est présentée pour ce qu’elle est (TCK-573)', () => {
  it('« Propriétaire » pour un propriétaire, « Agent immobilier » (et sa spécialité) pour un agent', () => {
    render(
      withIntl(
        <TeamStrip
          agents={[
            { id: 1, slug: 'oumy-sow', full_name: 'Oumy Sow', avatar_url: null, public_role: 'owner', portfolio_count: 12 },
            { id: 2, slug: 'awa-ndiaye', full_name: 'Awa Ndiaye', avatar_url: null, public_role: 'agent', specialty: 'Location' },
          ]}
        />,
      ),
    );

    const [proprietaire, agent] = screen.getAllByRole('listitem');
    expect(proprietaire).toHaveTextContent('Propriétaire');
    expect(proprietaire).not.toHaveTextContent('Agent immobilier');
    expect(agent).toHaveTextContent('Agent immobilier · Location');
  });

  it('sans qualité connue, rien n’est inventé — la spécialité seule reste', () => {
    render(
      withIntl(
        <TeamStrip agents={[{ id: 3, slug: 'x', full_name: 'Moussa Sarr', avatar_url: null, specialty: 'Luxe' }]} />,
      ),
    );

    const carte = screen.getByRole('listitem');
    expect(carte).toHaveTextContent('Luxe');
    expect(carte).not.toHaveTextContent('Propriétaire');
    expect(carte).not.toHaveTextContent('Agent immobilier');
  });
});
