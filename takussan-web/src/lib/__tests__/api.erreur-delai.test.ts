import { describe, expect, it } from 'vitest';

import { CLE_I18N_ERREUR_API, messageErreurApi } from '../api';

/**
 * TCK-1295 (P113.04) — un appel abandonné par sa borne (`AbortSignal.timeout`) se lit comme une
 * panne réseau, comme le `TypeError` d'une requête qui n'aboutit pas : son message anglais
 * (« signal timed out », « The operation was aborted due to timeout ») ne s'affiche jamais.
 */
const t = (cle: string) => `«${cle}»`;

async function raisonDuDelai(): Promise<unknown> {
  const signal = AbortSignal.timeout(1);
  await new Promise((resoudre) => signal.addEventListener('abort', resoudre, { once: true }));
  return signal.reason;
}

describe('messageErreurApi — délai dépassé', () => {
  it('la raison réelle d’AbortSignal.timeout rend le libellé de panne réseau', async () => {
    const raison = await raisonDuDelai();
    expect((raison as { name?: string }).name).toBe('TimeoutError');

    expect(messageErreurApi(raison, t, 'repli')).toBe(`«${CLE_I18N_ERREUR_API.network}»`);
  });

  it('une DOMException TimeoutError au message de Chrome aussi', () => {
    const raison = new DOMException('signal timed out', 'TimeoutError');

    expect(messageErreurApi(raison, t, 'repli')).toBe(`«${CLE_I18N_ERREUR_API.network}»`);
  });

  it('un Error ordinaire garde son message déjà traduit', () => {
    expect(messageErreurApi(new Error('Le bien est introuvable.'), t, 'repli')).toBe('Le bien est introuvable.');
  });
});
