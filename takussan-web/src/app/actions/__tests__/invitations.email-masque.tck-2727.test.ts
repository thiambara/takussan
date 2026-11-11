import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2727 (décision du porteur du 2026-11-11, option a) — le 401 `invitation.requires_login` ne rend
 * plus que l'adresse MASQUÉE (`recipient.masked` de l'aperçu). L'action la relaie sous un nom qui le
 * dit, `emailMasque`, et ne porte plus de champ `email` : rien, dans son résultat, ne peut préremplir
 * la connexion. Le chemin réel jusqu'à `apiRequest`, seul point moqué.
 */

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: async () => undefined, getActiveProfileId: async () => undefined }));
vi.mock('@/lib/journal-erreur-action', () => ({ journaliserErreurInattendue: () => {} }));

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequestMock(...a),
}));

import { ApiError } from '@/lib/api';
import { accepterInvitationAction } from '../invitations';

const MASQUE = 'm•••@exemple.sn';

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe('accepterInvitationAction — le 401 « connectez-vous » (TCK-2727)', () => {
  it('AC3 — relaie l’adresse masquée sous `emailMasque`, et aucun champ `email`', async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(401, { code: 'invitation.requires_login', message: 'Connectez-vous.', requires_login: true, email: MASQUE }),
    );

    const resultat = await accepterInvitationAction('jeton-abc', { first_name: 'Moussa', password: 'secret123' });

    expect(resultat).toEqual({ ok: false, seConnecter: true, emailMasque: MASQUE, message: 'Connectez-vous.' });
    expect(resultat).not.toHaveProperty('email');
  });

  it('un 401 sans adresse (invitation par SMS) rend `emailMasque: null`', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(401, { code: 'invitation.requires_login', message: 'Connectez-vous.', requires_login: true, email: null }));

    const resultat = await accepterInvitationAction('jeton-abc');

    expect(resultat).toMatchObject({ ok: false, seConnecter: true, emailMasque: null });
  });
});
