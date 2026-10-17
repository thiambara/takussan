// @vitest-environment node
/**
 * TCK-760 (P12.09) — les server actions de la suppression de compte (RGPD, TCK-080, TCK-272).
 *
 * Aucun test ne les importait : `AccountDeletionSection.test.tsx` remplace le module entier par
 * `vi.mock`. Ce fichier tient leur enveloppe `{ ok, … }`, celle que l'écran lit pour afficher
 * les obligations qui bloquent la suppression, sans qu'aucune exception ne traverse la frontière
 * RSC. Le client HTTP (`@/lib/account-deletion`) est remplacé : c'est l'action qu'on éprouve.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import fr from '@/messages/fr.json';

const jeton = vi.hoisted(() => ({ valeur: 'jeton-A' as string | undefined }));
const client = vi.hoisted(() => ({
  getAccountDeletionRequest: vi.fn(),
  requestAccountDeletion: vi.fn(),
  sendAccountDeletionStepUpCode: vi.fn(),
  cancelAccountDeletion: vi.fn(),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: async () => jeton.valeur }));
vi.mock('@/lib/account-deletion', () => client);

const actions = await import('../account-deletion');

const REPLIS = fr.serverActions.accountDeletion;

/** Chaque action, l'appel qu'elle fait au client, et la clé de repli qui lui est propre. */
const CAS = [
  {
    nom: 'getAccountDeletionRequestAction',
    lancer: () => actions.getAccountDeletionRequestAction(),
    appel: client.getAccountDeletionRequest,
    repli: REPLIS.loadFailed,
  },
  {
    nom: 'requestAccountDeletionAction',
    lancer: () => actions.requestAccountDeletionAction({ password: 'secret', reason_code: 'privacy' }),
    appel: client.requestAccountDeletion,
    repli: REPLIS.submitFailed,
  },
  {
    nom: 'sendAccountDeletionStepUpCodeAction',
    lancer: () => actions.sendAccountDeletionStepUpCodeAction(),
    appel: client.sendAccountDeletionStepUpCode,
    repli: REPLIS.sendCodeFailed,
  },
  {
    nom: 'cancelAccountDeletionAction',
    lancer: () => actions.cancelAccountDeletionAction(),
    appel: client.cancelAccountDeletion,
    repli: REPLIS.cancelFailed,
  },
] as const;

beforeEach(() => {
  jeton.valeur = 'jeton-A';
  for (const fn of Object.values(client)) fn.mockReset();
});

describe('actions de suppression de compte — chemin nominal', () => {
  it('lit la demande en cours avec le jeton de la session', async () => {
    const demande = { id: 3, requested_at: '2026-10-01', scheduled_for: '2026-10-31', days_remaining: 14 };
    client.getAccountDeletionRequest.mockResolvedValue(demande);

    expect(await actions.getAccountDeletionRequestAction()).toEqual({ ok: true, data: demande });
    expect(client.getAccountDeletionRequest).toHaveBeenCalledWith('jeton-A');
  });

  it('transmet la charge utile de la demande telle quelle', async () => {
    const demande = { id: 4, requested_at: null, scheduled_for: null, days_remaining: 30 };
    client.requestAccountDeletion.mockResolvedValue(demande);
    const charge = { step_up_code: '123456', reason_code: 'other' as const, reason: 'Je pars' };

    expect(await actions.requestAccountDeletionAction(charge)).toEqual({ ok: true, data: demande });
    expect(client.requestAccountDeletion).toHaveBeenCalledWith('jeton-A', charge);
  });

  it('rend l\'aperçu du code de step-up', async () => {
    client.sendAccountDeletionStepUpCode.mockResolvedValue({ codeApercu: '654321' });

    expect(await actions.sendAccountDeletionStepUpCodeAction()).toEqual({
      ok: true,
      data: { codeApercu: '654321' },
    });
  });

  it('annule, et rend `data: null`', async () => {
    client.cancelAccountDeletion.mockResolvedValue(undefined);

    expect(await actions.cancelAccountDeletionAction()).toEqual({ ok: true, data: null });
    expect(client.cancelAccountDeletion).toHaveBeenCalledWith('jeton-A');
  });
});

describe.each(CAS)('$nom — échecs', ({ lancer, appel, repli }) => {
  it('sans jeton : un échec, sans appel à l\'API', async () => {
    jeton.valeur = undefined;

    // Le message traduit, jamais la sentinelle anglaise « Unauthenticated. » ni une clé.
    expect(await lancer()).toEqual({ ok: false, message: fr.errors.missingToken });
    expect(appel).not.toHaveBeenCalled();
  });

  it('une erreur de l\'API rend sa prose, ses obligations et ses erreurs de champ', async () => {
    const obligations = [{ type: 'lease', id: 9, reference: 'BAIL-9', label: 'Bail en cours' }];
    const errors = { password: ['Mot de passe incorrect.'] };
    appel.mockRejectedValue(
      new ApiError(422, { message: 'Des obligations bloquent la suppression.', obligations, errors }),
    );

    expect(await lancer()).toEqual({
      ok: false,
      message: 'Des obligations bloquent la suppression.',
      obligations,
      errors,
    });
  });

  it('une erreur qui n\'est pas une ApiError rend le repli propre à l\'action, sans détail', async () => {
    appel.mockRejectedValue(new RangeError('détail interne'));

    expect(await lancer()).toEqual({ ok: false, message: repli });
  });
});
