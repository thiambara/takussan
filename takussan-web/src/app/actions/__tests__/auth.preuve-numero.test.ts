import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TCK-589, vérification adverse passe 3 (p3-1) — la preuve du remplacement d'un numéro vérifié
 * traverse la frontière serveur : `updateProfileAction` la relaie, `updateProfile` la met dans le
 * corps envoyé à `PUT /api/auth/profile`. Le test du composant moque l'action ; celui-ci monte le
 * chemin réel jusqu'à `apiRequest`, seul point moqué.
 */

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test', getActiveProfileId: async () => undefined }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({ redirect: () => {} }));

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequestMock(...a),
}));

import { updateProfileAction } from '../auth';

function formulaire(champs: Record<string, string>): FormData {
  const fd = new FormData();
  fd.append('first_name', 'Jane');
  fd.append('last_name', 'Doe');
  for (const [cle, valeur] of Object.entries(champs)) fd.append(cle, valeur);
  return fd;
}

function corpsEnvoye(): FormData {
  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  const [chemin, options] = apiRequestMock.mock.calls[0] as [string, { body: FormData }];
  expect(chemin).toBe('/api/auth/profile');
  return options.body;
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ id: 1, phone: '+221770009403', phone_verified_at: null });
});

describe('updateProfileAction — preuve du remplacement d’un numéro vérifié', () => {
  it('relaie le mot de passe actuel', async () => {
    await updateProfileAction(formulaire({ phone: '+221770009403', current_password: 'secret' }));
    const corps = corpsEnvoye();
    expect(corps.get('current_password')).toBe('secret');
    expect(corps.has('phone_change_code')).toBe(false);
  });

  it('relaie le code reçu sur l’ancien numéro', async () => {
    await updateProfileAction(formulaire({ phone: '+221770009403', phone_change_code: '123456' }));
    const corps = corpsEnvoye();
    expect(corps.get('phone_change_code')).toBe('123456');
    expect(corps.has('current_password')).toBe(false);
  });

  it('n’ajoute rien quand aucune preuve n’est fournie', async () => {
    await updateProfileAction(formulaire({ phone: '+221770009403' }));
    const corps = corpsEnvoye();
    expect(corps.has('current_password')).toBe(false);
    expect(corps.has('phone_change_code')).toBe(false);
  });
});
