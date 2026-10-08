// @vitest-environment node
/**
 * TCK-589 (AC10) — le cookie de session ne survit jamais au jeton : `maxAge` = `expires_at` −
 * maintenant. Rouge sur l'ancien handler (7 jours fixes, quel que soit le jeton).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { POST } = await import('../route');

function requete(corps: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/set-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
}

function maxAgeDuCookie(res: Response): number | null {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('auth_token=') && !/max-age=0/i.test(c));
  const m = cookie?.match(/max-age=(\d+)/i);
  return m ? Number(m[1]) : null;
}

describe('POST /api/auth/set-token', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('pose un maxAge égal à expires_at − maintenant (session super-admin de 8 h)', async () => {
    const res = await POST(requete({ token: '1|abc', expires_at: '2026-10-07T20:00:00+00:00' }));
    expect(maxAgeDuCookie(res)).toBe(8 * 3600);
  });

  it('pose 30 jours pour un jeton de 30 jours', async () => {
    const res = await POST(requete({ token: '1|abc', expires_at: '2026-11-06T12:00:00Z' }));
    expect(maxAgeDuCookie(res)).toBe(30 * 86400);
  });

  it('retombe sur 7 jours quand expires_at manque ou est illisible', async () => {
    expect(maxAgeDuCookie(await POST(requete({ token: '1|abc' })))).toBe(7 * 86400);
    expect(maxAgeDuCookie(await POST(requete({ token: '1|abc', expires_at: 'demain' })))).toBe(7 * 86400);
  });

  it('un jeton déjà échu ne pose pas de cookie durable', async () => {
    const res = await POST(requete({ token: '1|abc', expires_at: '2026-10-07T11:00:00Z' }));
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('auth_token='));
    expect(cookie).toMatch(/max-age=0/i);
  });
});
