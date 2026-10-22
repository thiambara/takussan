import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TCK-1351 (P149.03) — vider sa présentation l'efface : `updateProfileAction` relaie `bio` dès que
 * le formulaire la porte, chaîne vide comprise (`|| undefined` la retirait du corps, et l'API, qui
 * n'écrit que les clés reçues, gardait l'ancienne). Le chemin réel est monté jusqu'à `apiRequest`.
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

function corpsEnvoye(): FormData {
  expect(apiRequestMock).toHaveBeenCalledTimes(1);
  const [, options] = apiRequestMock.mock.calls[0] as [string, { body: FormData }];
  return options.body;
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ id: 1, bio: null });
});

describe('updateProfileAction — la présentation (TCK-1351)', () => {
  it('une bio vidée part en chaîne vide', async () => {
    const fd = new FormData();
    fd.append('first_name', 'Jane');
    fd.append('bio', '');
    await updateProfileAction(fd);
    expect(corpsEnvoye().get('bio')).toBe('');
  });

  it('une bio saisie part telle quelle', async () => {
    const fd = new FormData();
    fd.append('bio', 'Agent à Dakar');
    await updateProfileAction(fd);
    expect(corpsEnvoye().get('bio')).toBe('Agent à Dakar');
  });

  it('un formulaire sans champ bio ne l’envoie pas', async () => {
    const fd = new FormData();
    fd.append('first_name', 'Jane');
    await updateProfileAction(fd);
    expect(corpsEnvoye().has('bio')).toBe(false);
  });
});
