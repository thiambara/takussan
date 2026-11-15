import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { aRegler, rangeesAPoint, rangeesDuSommaire, type FaitsDuSommaire, type IdDeRangee } from '@/lib/profil/sommaire';

/**
 * TCK-2635 — le sommaire du profil rendu : au téléphone, une rangée par section puis « Supprimer mon
 * compte » en dernier ; au bureau, l'entrée de la section ouverte marquée ; « À régler » sur un fait.
 */
const { chemin } = vi.hoisted(() => ({ chemin: { valeur: '/app/profile' } }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.valeur,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ logout: async () => undefined }) }));

const { SommaireDuTelephone } = await import('../SommaireDuTelephone');
const { SommaireDuBureau } = await import('../SommaireDuBureau');
const { AReglerDuProfil } = await import('../AReglerDuProfil');

const AGENT: FaitsDuSommaire['user'] = {
  roles: ['agent', 'customer'],
  phone: '+221778040289',
  phone_verified_at: null,
  two_factor_enabled: false,
  listed_in_public_directory: false,
  timezone: 'Africa/Dakar',
};

const details = (rangees: readonly IdDeRangee[]) =>
  Object.fromEntries(rangees.map((id) => [id, `détail ${id}`])) as Record<IdDeRangee, string>;

beforeEach(() => {
  chemin.valeur = '/app/profile';
});

describe('<SommaireDuTelephone> (TCK-2635)', () => {
  it('une rangée par section, dans l’ordre, puis « Supprimer mon compte » en dernier et « Déconnexion »', async () => {
    const rangees = rangeesDuSommaire({ user: AGENT });
    const liste = aRegler({ user: AGENT, profils: [] });
    render(withIntl(await SommaireDuTelephone({ rangees, points: rangeesAPoint(liste), details: details(rangees) })));

    const liens = screen.getAllByRole('link');
    expect(liens.map((l) => l.getAttribute('href'))).toEqual([
      '/app/profile/contact',
      '/app/profile/public-profile',
      '/app/profile/professional',
      '/app/profile/notifications',
      '/app/profile/security',
      '/app/profile/spaces',
      '/app/profile/menu',
      '/app/profile/language',
      '/app/profile/timezone',
      '/app/profile/reviews',
      '/app/account/privacy',
      '/app/profile/delete-account',
    ]);
    expect(liens.at(-1)).toHaveTextContent('Supprimer mon compte');
    expect(screen.getByRole('button', { name: 'Déconnexion' })).toBeInTheDocument();
    // Le point sur ce qui demande une action : coordonnées (numéro), sécurité (2FA).
    const coordonnees = liens[0]!;
    expect(within(coordonnees).getByRole('img', { name: 'Demande une action' })).toBeInTheDocument();
    expect(within(liens[6]!).queryByRole('img', { name: 'Demande une action' })).toBeNull();
  });
});

describe('<SommaireDuBureau> (TCK-2635)', () => {
  const monter = () =>
    render(withIntl(<SommaireDuBureau rangees={rangeesDuSommaire({ user: AGENT })} points={['coordonnees']} />));

  it('`/app/profile/reviews` ouvre « Mes avis » : son entrée est la page courante', () => {
    chemin.valeur = '/app/profile/reviews';
    monter();
    expect(screen.getByRole('link', { name: 'Mes avis' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).not.toHaveAttribute('aria-current');
  });

  it('`/app/account/privacy` ouvre « Mes données », dans le même sommaire', () => {
    chemin.valeur = '/app/account/privacy';
    monter();
    expect(screen.getByRole('link', { name: 'Mes données' })).toHaveAttribute('aria-current', 'page');
  });

  it('sur le sommaire, « Vue d’ensemble » ; « Supprimer mon compte » ferme la liste des liens', () => {
    monter();
    expect(screen.getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link').at(-1)).toHaveTextContent('Supprimer mon compte');
  });
});

describe('<AReglerDuProfil> (TCK-2635)', () => {
  it('« Vérifier votre numéro » et « Activer la double authentification » pour l’agent qui n’a ni l’un ni l’autre', async () => {
    render(withIntl((await AReglerDuProfil({ liste: aRegler({ user: AGENT, profils: [] }) }))!));
    expect(screen.getByRole('heading', { name: 'À régler' })).toBeInTheDocument();
    expect(screen.getAllByText('Vérifier votre numéro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Activer la double authentification').length).toBeGreaterThan(0);
    // « Vérifier » OUVRE la sécurité : aucun code ne part d'ici.
    for (const lien of screen.getAllByRole('link', { name: 'Vérifier' })) {
      expect(lien).toHaveAttribute('href', '/app/profile/security');
    }
  });

  it('rien à régler : rien n’est rendu', async () => {
    const verifie = { ...AGENT, phone_verified_at: '2026-01-01T00:00:00Z', two_factor_enabled: true };
    expect(await AReglerDuProfil({ liste: aRegler({ user: verifie, profils: [] }) })).toBeNull();
  });

  it('un numéro vérifié n’est pas à régler', async () => {
    const verifie = { ...AGENT, phone_verified_at: '2026-01-01T00:00:00Z' };
    render(withIntl((await AReglerDuProfil({ liste: aRegler({ user: verifie, profils: [] }) }))!));
    expect(screen.queryByText('Vérifier votre numéro')).toBeNull();
  });
});
