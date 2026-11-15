// @vitest-environment node
/**
 * TCK-2844 (ADR-0109) — l'import d'une photo de Wikimedia part en JSON, mais l'API télécharge et
 * encode le fichier avant de répondre : le relais lui accorde le délai des fichiers. Les autres
 * écritures JSON gardent le délai par défaut.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const relayer = vi.fn(async () => NextResponse.json({ data: {} }));
vi.mock('@/lib/relais-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/relais-api')>()),
  relayerVersApi: relayer,
}));

const { POST } = await import('../route');
const { DELAI_RELAIS_FICHIER_MS } = await import('@/lib/relais-api');

const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

function requete(chemin: string): NextRequest {
  return new NextRequest(`http://localhost/api/super-admin/${chemin}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'auth_token=1|abc' },
    body: JSON.stringify({ source: 'wikimedia', title: 'File:Mermoz.jpg' }),
  });
}

describe('BFF super-admin — délai de l’import d’une photo de quartier', () => {
  beforeEach(() => relayer.mockClear());

  it('l’import attend le délai des fichiers', async () => {
    await POST(requete('geo/neighborhoods/41/cover/import'), ctx(['geo', 'neighborhoods', '41', 'cover', 'import']));
    const [, chemin, options] = relayer.mock.calls[0] as unknown as [unknown, string, { delaiMs?: number }];
    expect(chemin).toBe('/admin/geo/neighborhoods/41/cover/import');
    expect(options.delaiMs).toBe(DELAI_RELAIS_FICHIER_MS);
  });

  it('une autre écriture du référentiel garde le délai par défaut', async () => {
    await POST(requete('geo/neighborhoods/41/approve'), ctx(['geo', 'neighborhoods', '41', 'approve']));
    const [, , options] = relayer.mock.calls[0] as unknown as [unknown, string, { delaiMs?: number }];
    expect(options.delaiMs).toBeUndefined();
  });
});
