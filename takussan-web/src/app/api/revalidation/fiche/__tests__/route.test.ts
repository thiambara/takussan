// @vitest-environment node

import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-598 (ADR-0052 §2) — le handler d'invalidation de la fiche. Il est joignable par tout
 * Internet : sa seule protection est la signature, et chaque refus a son cas.
 *
 * La signature est calculée ici comme `RevalidatePublicPropertyPage::signature()` la calcule côté
 * API : `hash_hmac('sha256', "<t>.<corps>", secret)`.
 */

// Espion sur le HMAC, pour prouver qu'un corps trop gros est refusé AVANT qu'on le calcule (m6).
const hmac = vi.hoisted(() => ({ appels: 0 }));
vi.mock('node:crypto', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('node:crypto')>();
  return {
    ...vrai,
    createHmac: (...a: Parameters<typeof vrai.createHmac>) => {
      hmac.appels += 1;
      return vrai.createHmac(...a);
    },
  };
});

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTagMock(...a) }));

const { POST } = await import('../route');

const SECRET = 'secret-de-test-tck-598';

function signe(corps: string, t: number, secret = SECRET): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex')}`;
}

function appel(corps: string, signature?: string): Request {
  return new Request('http://localhost/api/revalidation/fiche', {
    method: 'POST',
    headers: signature ? { 'X-Takussan-Signature': signature, 'Content-Type': 'application/json' } : {},
    body: corps,
  });
}

const maintenant = () => Math.floor(Date.now() / 1000);
const CORPS = JSON.stringify({ slugs: ['nouveau-titre-bbbbbb', 'ancien-titre-aaaaaa'] });

beforeEach(() => {
  vi.stubEnv('PUBLIC_CACHE_REVALIDATE_SECRET', SECRET);
  revalidateTagMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/revalidation/fiche', () => {
  it('signature valide : chaque étiquette expire IMMÉDIATEMENT', async () => {
    const reponse = await POST(appel(CORPS, signe(CORPS, maintenant())));

    expect(reponse.status).toBe(200);
    expect(revalidateTagMock.mock.calls).toEqual([
      ['property:nouveau-titre-bbbbbb', { expire: 0 }],
      ['property:ancien-titre-aaaaaa', { expire: 0 }],
    ]);
  });

  it('signature absente, fausse, ou d’un autre secret : 401, rien n’expire', async () => {
    const t = maintenant();
    for (const signature of [
      undefined,
      'n importe quoi',
      `t=${t},v1=${'0'.repeat(64)}`,
      signe(CORPS, t, 'un-autre-secret'),
    ]) {
      expect((await POST(appel(CORPS, signature))).status).toBe(401);
    }
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('corps modifié après signature : 401 (la signature porte sur les OCTETS reçus)', async () => {
    const signature = signe(CORPS, maintenant());
    const altere = JSON.stringify({ slugs: ['un-autre-bien-cccccc'] });

    expect((await POST(appel(altere, signature))).status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('rejeu : une signature de plus de 300 s est refusée, dans les deux sens', async () => {
    for (const t of [maintenant() - 301, maintenant() + 301]) {
      expect((await POST(appel(CORPS, signe(CORPS, t)))).status).toBe(401);
    }
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('secret non configuré : 401 même avec une signature « valide » pour un secret vide', async () => {
    vi.stubEnv('PUBLIC_CACHE_REVALIDATE_SECRET', '');

    expect((await POST(appel(CORPS, signe(CORPS, maintenant(), '')))).status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('corps signé mais invalide : 422, rien n’expire', async () => {
    for (const corps of ['pas du json', '{"slugs":[]}', '{"slugs":["../x"]}', '{"slugs":[42]}', '{}']) {
      expect((await POST(appel(corps, signe(corps, maintenant())))).status).toBe(422);
    }
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

describe('après verif-598', () => {
  it('m3 — un slug qui commence par `-` (titre sans lettre latine) est expiré', async () => {
    const corps = JSON.stringify({ slugs: ['-abc123'] });

    const reponse = await POST(appel(corps, signe(corps, maintenant())));

    expect(reponse.status).toBe(200);
    expect(revalidateTagMock).toHaveBeenCalledWith('property:-abc123', { expire: 0 });
  });

  it('m3 — un slug invalide est IGNORÉ, il n’emporte pas les valides du même lot', async () => {
    const corps = JSON.stringify({ slugs: ['nouveau-titre-bbbbbb', '../x', 42, '', '-abc123', 'a.b'] });

    const reponse = await POST(appel(corps, signe(corps, maintenant())));

    expect(reponse.status).toBe(200);
    expect(revalidateTagMock.mock.calls.map(([tag]) => tag)).toEqual(['property:nouveau-titre-bbbbbb', 'property:-abc123']);
    expect(await reponse.json()).toEqual({ revalidated: 2, ignored: 4 });
  });

  it('m6 — un corps de plus de 8 Kio est refusé AVANT le calcul du HMAC', async () => {
    const corps = JSON.stringify({ slugs: ['x'], bourrage: 'a'.repeat(8 * 1024) });
    const signature = signe(corps, maintenant());
    const avant = hmac.appels;

    const reponse = await POST(appel(corps, signature));

    expect(reponse.status).toBe(413);
    expect(hmac.appels).toBe(avant);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('m6 — un `Content-Length` annoncé au-delà du plafond est refusé sans lire le corps', async () => {
    const corps = JSON.stringify({ slugs: ['x'] });
    const requete = new Request('http://localhost/api/revalidation/fiche', {
      method: 'POST',
      headers: { 'X-Takussan-Signature': signe(corps, maintenant()), 'Content-Length': String(64 * 1024) },
      body: corps,
    });
    const avant = hmac.appels;

    expect((await POST(requete)).status).toBe(413);
    expect(hmac.appels).toBe(avant);
  });

  it('un corps de 8 Kio exactement passe encore', async () => {
    const base = JSON.stringify({ slugs: ['nouveau-titre-bbbbbb'], bourrage: '' });
    const corps = JSON.stringify({ slugs: ['nouveau-titre-bbbbbb'], bourrage: 'a'.repeat(8 * 1024 - base.length) });
    expect(Buffer.byteLength(corps)).toBe(8 * 1024);

    expect((await POST(appel(corps, signe(corps, maintenant())))).status).toBe(200);
  });
});
