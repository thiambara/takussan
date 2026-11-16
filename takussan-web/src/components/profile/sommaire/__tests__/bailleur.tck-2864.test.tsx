import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { PieceDuProfil } from '@/lib/pieces/pieces';
import { aRegler, rangeesAPoint, rangeesDuSommaire, type FaitsDuSommaire } from '@/lib/profil/sommaire';
import { detailsDuSommaire } from '../details-du-sommaire';

/**
 * TCK-2864 (AC4, AC6, maquette `app-profil` e6) — le sommaire du bailleur : l'encart « Envoyez vos
 * pièces d'identité… » qui mène à « Vos pièces », le point sur « Sécurité », le point sur « Moyens de
 * versement » pour un compte bancaire à confirmer ; une seule source pour le nombre, les points et les
 * encarts (`aRegler`). Au bureau, « Annuaire public » mène au bloc de la page des versements.
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({
  usePathname: () => '/app/profile/payouts',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ logout: async () => undefined }) }));

const { SommaireDuTelephone } = await import('../SommaireDuTelephone');
const { SommaireDuBureau } = await import('../SommaireDuBureau');
const { AReglerDuProfil } = await import('../AReglerDuProfil');

const BAILLEUR: FaitsDuSommaire['user'] = {
  roles: ['owner', 'customer'],
  phone: '+221765124018',
  phone_verified_at: '2026-01-01T00:00:00Z',
  two_factor_enabled: true,
  listed_in_public_directory: false,
  timezone: 'Africa/Dakar',
};

const piece = (code: string, state: PieceDuProfil['state']): PieceDuProfil => ({ code, required: true, kind: 'file', state });
const A_ENVOYER = [piece('cni', 'missing'), piece('rib', 'sent')];
const ENVOYEES = [piece('cni', 'sent'), piece('rib', 'verified')];
const WAVE = { kind: 'wave', is_default: true, verification_status: 'to_confirm' } as const;
const BANQUE = { kind: 'bank_transfer', is_default: false, verification_status: 'to_confirm' } as const;

const faits = (autre: Partial<FaitsDuSommaire> = {}): FaitsDuSommaire => ({ user: BAILLEUR, profils: [], ...autre });

describe('aRegler — le bailleur (TCK-2864)', () => {
  it('AC4 — pièces à envoyer : un encart vers « Vos pièces », un point sur « Sécurité »', () => {
    const liste = aRegler(faits({ pieces: A_ENVOYER }));
    expect(liste).toEqual([
      { id: 'pieces', rangee: 'securite', href: '/app/pieces', compte: { envoyees: 1, requises: 2 } },
    ]);
    expect(rangeesAPoint(liste).has('securite')).toBe(true);
  });

  it('AC4 — pièces envoyées : ni encart ni point', () => {
    const liste = aRegler(faits({ pieces: ENVOYEES }));
    expect(liste).toEqual([]);
    expect(rangeesAPoint(liste).has('securite')).toBe(false);
  });

  it('un compte bancaire à confirmer met un point sur « Moyens de versement » ; un numéro Wave non vérifié non', () => {
    expect(aRegler(faits({ versements: [WAVE] }))).toEqual([]);
    const liste = aRegler(faits({ versements: [WAVE, BANQUE] }));
    expect(liste).toEqual([{ id: 'rib', rangee: 'versement', href: '/app/profile/payouts' }]);
  });

  it('AC6 — deux choses attendent : deux réglages, deux points', () => {
    const liste = aRegler(faits({ pieces: A_ENVOYER, versements: [WAVE, BANQUE] }));
    expect(liste.map((a) => a.id)).toEqual(['pieces', 'rib']);
    expect([...rangeesAPoint(liste)].sort()).toEqual(['securite', 'versement']);
  });

  it('des faits non lus ou illisibles ne déduisent rien', () => {
    expect(aRegler(faits({ pieces: null, versements: null }))).toEqual([]);
    expect(aRegler(faits())).toEqual([]);
  });
});

describe('les détails du sommaire du bailleur (TCK-2864, maquette `LIGNES_BAILLEUR`)', () => {
  const t = (cle: string, v?: Record<string, string | number>) => `${cle}${v ? JSON.stringify(v) : ''}`;
  it('« Wave · un compte à confirmer » et « Pièces d’identité à envoyer »', () => {
    const d = detailsDuSommaire(faits({ pieces: A_ENVOYER, versements: [WAVE, BANQUE] }), {
      t,
      tTypes: t,
      tKinds: (k) => (k === 'wave' ? 'Wave' : 'Virement bancaire'),
      locale: 'fr',
    });
    expect(d.versement).toBe('versementAConfirmer{"moyen":"Wave"}');
    expect(d.securite).toBe('securite.piecesAEnvoyer');
  });
});

describe('le sommaire du bailleur rendu (TCK-2864)', () => {
  it('AC4 — l’encart dit « Envoyez vos pièces d’identité… » et mène à l’étape ; « Sécurité » porte un point', async () => {
    const f = faits({ pieces: A_ENVOYER });
    const liste = aRegler(f);
    render(withIntl(await AReglerDuProfil({ liste })));
    const encarts = screen.getAllByText('Envoyez vos pièces d’identité pour recevoir vos reversements.');
    expect(encarts.length).toBeGreaterThan(0);
    for (const lien of screen.getAllByRole('link', { name: 'Envoyer' })) expect(lien).toHaveAttribute('href', '/app/pieces');

    const rangees = rangeesDuSommaire(f);
    const d = Object.fromEntries(rangees.map((id) => [id, id]));
    render(withIntl(await SommaireDuTelephone({ rangees, points: rangeesAPoint(liste), details: d as never })));
    const securite = screen.getByRole('link', { name: /Sécurité/ });
    expect(within(securite).getByRole('img', { name: 'Demande une action' })).toBeInTheDocument();
  });

  it('« Envoyer le RIB » de l’encart mène aux moyens de versement', async () => {
    render(withIntl(await AReglerDuProfil({ liste: aRegler(faits({ versements: [BANQUE] })) })));
    for (const lien of screen.getAllByRole('link', { name: 'Envoyer le RIB' })) {
      expect(lien).toHaveAttribute('href', '/app/profile/payouts');
    }
  });

  it('AC6 — au bureau, « Annuaire public » mène au bloc de la page des versements, ouverte', () => {
    render(withIntl(<SommaireDuBureau rangees={rangeesDuSommaire({ user: BAILLEUR })} points={['versement', 'securite']} />));
    expect(screen.getByRole('link', { name: 'Annuaire public' })).toHaveAttribute('href', '/app/profile/payouts#annuaire');
    expect(screen.getByRole('link', { name: /Moyens de versement/ })).toHaveAttribute('aria-current', 'page');
  });
});
