import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { IDS_DE_RANGEE, type IdDeRangee } from '@/lib/profil/sommaire';
import type { UserRole } from '@/types/user';

/**
 * TCK-2635 (contre-vérification) — la garde d'adresse d'une section du profil. Le sommaire ne montre
 * à un compte que ses rangées ; une section saisie à la main (`/app/profile/payouts` pour un agent,
 * `/app/profile/public-profile` pour un bailleur) doit rendre 404, sinon la rubrique d'un rôle
 * s'ouvre à un autre — et ses gestes avec (l'interrupteur de l'annuaire à un agent, TCK-2506).
 *
 * `SectionDuProfil` est la seule garde : les pages `payouts`, `directory`, `public-profile` et
 * `search-preferences` rendent leur section sans condition de rôle. Rien d'autre ne la teste.
 */
const { faits } = vi.hoisted(() => ({ faits: { roles: [] as string[] } }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/profil/faits-du-sommaire', () => ({
  faitsDuSommaire: async () => ({
    user: {
      roles: faits.roles,
      phone: '+221778040289',
      phone_verified_at: '2026-01-01T00:00:00Z',
      two_factor_enabled: true,
      listed_in_public_directory: false,
      timezone: 'Africa/Dakar',
    },
    profils: [],
    profilActif: null,
  }),
}));

const { SectionDuProfil } = await import('../SectionDuProfil');

async function ouvrir(section: IdDeRangee | 'suppression') {
  return SectionDuProfil({ section, children: <p>contenu de la section</p> });
}

beforeEach(() => {
  faits.roles = [];
});

describe('TCK-2635 — une section que le compte n’a pas rend 404', () => {
  it.each<[string, UserRole[], IdDeRangee[]]>([
    ['agent', ['agent', 'customer'], ['recherche', 'versement', 'annuaire']],
    ['bailleur', ['owner', 'customer'], ['fiche', 'pro', 'recherche']],
    ['agent et bailleur (TCK-2506 : pas d’annuaire)', ['agent', 'owner'], ['recherche', 'annuaire']],
    ['prestataire', ['service_provider', 'customer'], ['fiche', 'recherche', 'annuaire']],
    ['client', ['customer'], ['fiche', 'pro', 'versement', 'annuaire']],
    ['admin d’agence', ['agency_admin', 'customer'], ['fiche', 'pro', 'recherche', 'versement', 'annuaire']],
  ])('%s', async (_nom, roles, fermees) => {
    faits.roles = roles;
    for (const section of IDS_DE_RANGEE) {
      if (fermees.includes(section)) {
        await expect(ouvrir(section), section).rejects.toThrow('NEXT_NOT_FOUND');
      } else {
        await expect(ouvrir(section), section).resolves.toBeTruthy();
      }
    }
  });

  it('une section ouverte rend son contenu ; « Supprimer mon compte » s’ouvre à tout compte', async () => {
    faits.roles = ['customer'];
    render(withIntl(await ouvrir('suppression')));
    expect(screen.getByText('contenu de la section')).toBeInTheDocument();
    faits.roles = ['owner'];
    render(withIntl(await ouvrir('versement')));
    expect(screen.getAllByText('contenu de la section')).toHaveLength(2);
  });
});
