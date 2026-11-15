import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-2601 — ce que la feuille demande est figé à son ouverture : le compte relu en route (nom
 * enregistré, numéro vérifié) ne fait pas disparaître le champ qu'on remplit. Le parent la remonte
 * par `key` à chaque ouverture.
 */

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, first_name: 'Awa', last_name: '' }, setUser: vi.fn(), refreshUser: vi.fn() }),
}));
vi.mock('@/app/actions/security', () => ({ phoneSendOtpAction: vi.fn(), phoneVerifyOtpAction: vi.fn() }));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));

import { FeuilleDePublication } from '../FeuilleDePublication';
import { REQUETE_DU_PANNEAU } from '../CadreDeLaFeuille';

function feuille(manques: Parameters<typeof FeuilleDePublication>[0]['manques']) {
  return withIntl(
    <FeuilleDePublication ouverte onFermer={() => {}} manques={manques} autreContact={false} rappel={null} envoi={false} onPublier={() => {}} />,
  );
}

describe('FeuilleDePublication', () => {
  it('les champs demandés restent ceux de l’ouverture', () => {
    const { rerender } = render(feuille(['last_name']));
    expect(screen.getByLabelText('Nom')).toBeInTheDocument();

    rerender(feuille([]));
    expect(screen.getByLabelText('Nom')).toBeInTheDocument();
  });

  it('AC5 — au bureau, le panneau ne dit « votre numéro » que s’il le demande, et sans assurance (le compte existe déjà)', () => {
    const avant = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === REQUETE_DU_PANNEAU,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const cible = document.body.appendChild(document.createElement('div'));
      const panneau = (manques: Parameters<typeof FeuilleDePublication>[0]['manques']) =>
        withIntl(
          <FeuilleDePublication ouverte onFermer={() => {}} manques={manques} autreContact={false} rappel={<p>rappel</p>} envoi={false} onPublier={() => {}} cible={cible} />,
        );
      const { unmount } = render(panneau(['first_name']));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(cible).toContainElement(screen.getByRole('heading', { level: 1, name: 'Dernière étape' }));
      expect(screen.queryByText('rappel')).not.toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
      unmount();

      render(panneau(['verified_phone']));
      expect(screen.getByRole('heading', { level: 1, name: 'Dernière étape : votre numéro' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 3, name: 'Votre numéro' })).not.toBeInTheDocument();
    } finally {
      window.matchMedia = avant;
    }
  });
});
