import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import type { Profile } from '@/types/profile';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const { MesEspacesEnBref } = await import('../MesEspacesEnBref');

/**
 * TCK-2635 — « Mes espaces » à la vue d'ensemble : une ligne par espace (l'agent et l'admin d'une même
 * agence n'en font qu'une), son statut dit en mots, « Espace en cours » pour le profil actif, les rôles,
 * la ville, la carte professionnelle — jamais le slug, jamais `license_number`, jamais « · active ».
 */
const DAKAR_IMMO = { id: 1, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard' as const, city: 'Dakar' };
const profil = (autre: Partial<Profile>): Profile => ({
  id: 'x:1', type: 'agent', numeric_id: 1, agency_id: 1, status: 'active', created_at: null, ...autre,
});

describe('<MesEspacesEnBref> (TCK-2635)', () => {
  it('une ligne par agence : statut, espace en cours, rôles, ville et carte professionnelle', async () => {
    const { container } = render(
      await MesEspacesEnBref({
        profils: [
          profil({ id: 'agency_admin:9', type: 'agency_admin', agency: DAKAR_IMMO }),
          profil({ id: 'agent:3', type: 'agent', agency: DAKAR_IMMO, license_number: '2024-0417' }),
          profil({ id: 'owner:5', type: 'owner', agency_id: 7, status: 'suspended', agency: { id: 7, name: 'Teranga Gestion', slug: 'teranga', kind: 'standard', city: null } }),
        ],
        profilActif: 'agent:3',
      }),
    );
    const lignes = screen.getAllByRole('listitem');
    expect(lignes).toHaveLength(2);
    const dakar = within(lignes[0]!);
    expect(dakar.getByText('Actif')).toBeInTheDocument();
    expect(dakar.getByText('Espace en cours')).toBeInTheDocument();
    expect(lignes[0]).toHaveTextContent('Agent, Administrateur · Dakar · carte professionnelle n°');
    // Une agence sans adresse n'a pas de ville ; un profil suspendu le dit.
    expect(lignes[1]).toHaveTextContent('Suspendu');
    expect(lignes[1]).toHaveTextContent(/Propriétaire$/);
    expect(within(lignes[1]!).queryByText('Espace en cours')).toBeNull();
    expect(container.textContent).not.toMatch(/license_number|· active|dakar-immo|teranga/);
  });

  it('sans profils lisibles, rien', async () => {
    expect(await MesEspacesEnBref({ profils: null, profilActif: null })).toBeNull();
  });
});
