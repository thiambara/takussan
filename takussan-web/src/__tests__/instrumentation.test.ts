import { afterEach, describe, expect, it, vi } from 'vitest';

import { onRequestError } from '../instrumentation';

/**
 * TCK-2356 (P14.07) — une erreur de rendu, d'action ou de route handler part en UNE ligne JSON
 * sur la sortie standard du conteneur, sans rien de la requête : ni le chemin réel, ni les
 * en-têtes, ni le message.
 */
const TEMOIN_MESSAGE = 'temoin-message-2356@exemple.sn';
const TEMOIN_JETON = 'temoin-jeton-2356';
const TEMOIN_COOKIE = 'temoin-cookie-2356';
const TEMOIN_CHEMIN = 'temoin-chemin-2356';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('instrumentation — onRequestError', () => {
  it('écrit une ligne JSON sur stdout, sans chemin, en-tête ni message', async () => {
    const sortie = vi.spyOn(console, 'log').mockImplementation(() => {});
    const erreur = Object.assign(new Error(`échec pour ${TEMOIN_MESSAGE}`), { digest: '2356-digest' });

    await onRequestError(
      erreur,
      {
        path: `/fr/pay/${TEMOIN_CHEMIN}?q=${TEMOIN_CHEMIN}`,
        method: 'GET',
        headers: { authorization: `Bearer ${TEMOIN_JETON}`, cookie: `auth_token=${TEMOIN_COOKIE}` },
      },
      { routerKind: 'App Router', routePath: '/[locale]/pay/[token]', routeType: 'render', renderSource: 'server-rendering', revalidateReason: undefined },
    );

    expect(sortie).toHaveBeenCalledTimes(1);
    const brut = String(sortie.mock.calls[0][0]);
    const ligne = JSON.parse(brut);
    expect(ligne).toMatchObject({
      message: 'request_error',
      level_name: 'ERROR',
      channel: 'web',
      context: {
        exception: 'Error',
        digest: '2356-digest',
        method: 'GET',
        route: '/[locale]/pay/[token]',
        route_type: 'render',
        router_kind: 'App Router',
        render_source: 'server-rendering',
      },
    });
    expect(Array.isArray(ligne.context.trace)).toBe(true);
    for (const temoin of [TEMOIN_MESSAGE, TEMOIN_JETON, TEMOIN_COOKIE, TEMOIN_CHEMIN, 'Bearer', 'auth_token']) {
      expect(brut).not.toContain(temoin);
    }
  });

  it('tient une valeur levée qui n’est pas une Error', async () => {
    const sortie = vi.spyOn(console, 'log').mockImplementation(() => {});

    await onRequestError(TEMOIN_MESSAGE, { path: '/', method: 'POST', headers: {} }, { routerKind: 'App Router', routePath: '/', routeType: 'action', revalidateReason: undefined });

    const brut = String(sortie.mock.calls[0][0]);
    expect(JSON.parse(brut).context).toMatchObject({ exception: 'string', route_type: 'action' });
    expect(brut).not.toContain(TEMOIN_MESSAGE);
  });
});
