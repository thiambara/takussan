import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { aRegler, rangeesAPoint, rangeesDuSommaire, type FaitsDuSommaire } from '@/lib/profil/sommaire';
import type { Profile } from '@/types/profile';

/**
 * TCK-2862 — le sommaire de l'agent dit le pourcentage de sa fiche (« 60 % complète »), et l'encart
 * « Compléter votre fiche publique » le pourcentage et ce qui manque : le MÊME calcul que la jauge.
 * Les traductions serveur interpolent ici (`createTranslator` sur le vrai `fr.json`).
 */
vi.mock('next-intl/server', async () => {
  const { createTranslator: creer } = await import('next-intl');
  const messages = (await import('@/messages/fr.json')).default;
  return {
    getTranslations: async (namespace?: string) => creer({ locale: 'fr', messages, namespace: namespace as never }),
    getLocale: async () => 'fr',
    getMessages: async () => messages,
  };
});
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/profile',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ logout: async () => undefined }) }));

const { SommaireDuTelephone } = await import('../SommaireDuTelephone');
const { AReglerDuProfil } = await import('../AReglerDuProfil');
const { detailsDuSommaire } = await import('../details-du-sommaire');

const AGENT: FaitsDuSommaire['user'] = {
  roles: ['agent', 'customer'],
  phone: '+221778040289',
  phone_verified_at: null,
  two_factor_enabled: true,
  listed_in_public_directory: false,
  timezone: 'Africa/Dakar',
  avatar_url: 'https://cdn.exemple.sn/sokhna.jpg',
  bio: 'Agent chez Dakar Immo depuis 2021.',
};

const PROFIL: Profile = {
  id: 'agent:7',
  type: 'agent',
  numeric_id: 7,
  agency_id: 1,
  status: 'active',
  created_at: null,
  languages: ['fr'],
  neighborhood_ids: [21, 22],
};

function detailsDe(faits: FaitsDuSommaire) {
  const t = createTranslator({ locale: 'fr', messages: fr, namespace: 'profile.sommaire.details' });
  const tTypes = createTranslator({ locale: 'fr', messages: fr, namespace: 'profile.types' });
  return detailsDuSommaire(faits, { t: (c, v) => t(c as never, v as never), tTypes: (c) => tTypes(c as never), locale: 'fr' });
}

describe('TCK-2862 — le pourcentage dans le sommaire', () => {
  it('AC1 — la rangée « Fiche publique » dit « 60 % complète »', async () => {
    const faits = { user: AGENT, profils: [PROFIL] };
    const rangees = rangeesDuSommaire(faits);
    render(withIntl(await SommaireDuTelephone({ rangees, points: rangeesAPoint(aRegler(faits)), details: detailsDe(faits) })));
    expect(screen.getByRole('link', { name: /Fiche publique/ })).toHaveTextContent('60 % complète');
  });

  it('les cinq critères remplis : « 100 % complète », et la fiche n’est plus à régler', () => {
    const faits = {
      user: { ...AGENT, phone_verified_at: '2026-01-01T00:00:00Z' },
      profils: [{ ...PROFIL, neighborhood_ids: [21, 22, 23, 24, 25] }],
    };
    expect(detailsDe(faits).fiche).toBe('100 % complète');
    expect(aRegler(faits).map((a) => a.id)).not.toContain('fiche');
  });

  it('l’encart « Compléter votre fiche publique » donne le pourcentage et ce qui manque', async () => {
    render(withIntl((await AReglerDuProfil({ liste: aRegler({ user: AGENT, profils: [PROFIL] }) }))!));
    expect(screen.getAllByText('Compléter votre fiche publique').length).toBeGreaterThan(0);
    expect(screen.getAllByText('60 % · il manque 3 quartiers et votre numéro vérifié.').length).toBeGreaterThan(0);
  });
});
