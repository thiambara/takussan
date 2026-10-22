/**
 * TCK-1203 — un refus de second facteur garde son `code` à travers l'action serveur. Sans lui,
 * `avecGardeDoubleFacteurAction` ne reconnaît pas le refus et l'écran n'affiche qu'un message.
 * Le seul maillon doublé est `apiRequest` : l'action et `lib/security` sont les vrais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

const apiRequestMock = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));

const { twoFactorEnableAction, twoFactorRegenerateAction } = await import('../security');

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe('actions de sécurité — refus de second facteur', () => {
  it('la régénération rend le code du step-up', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(403, { code: 'two_factor_step_up_required' }));

    const resultat = await twoFactorRegenerateAction();

    expect(resultat).toMatchObject({ ok: false, code: 'two_factor_step_up_required' });
  });

  it('le renouvellement de l’appareil rend le code du step-up', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(403, { code: 'two_factor_step_up_required' }));

    expect(await twoFactorEnableAction()).toMatchObject({ ok: false, code: 'two_factor_step_up_required' });
  });

  it('un autre refus ne porte aucun code', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(422, { code: 'validation_failed' }));

    const resultat = await twoFactorRegenerateAction();

    expect(resultat.ok).toBe(false);
    expect(resultat).not.toHaveProperty('code');
  });
});
