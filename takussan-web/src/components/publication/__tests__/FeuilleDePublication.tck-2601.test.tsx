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
});
