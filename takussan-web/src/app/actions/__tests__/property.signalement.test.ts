// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-597 (V12) — signaler une annonce ou un avis ne demande pas de compte, et le jeton part
 * QUAND il existe : c'est lui qui rattache le signalement au compte, prévenu de l'issue.
 *
 * Avant : `submitPropertyReport` n'envoyait jamais le jeton (le signalement d'un visiteur
 * connecté arrivait anonyme), et le signalement d'un avis exigeait une session — `authRequise()`
 * rendait 401 sans qu'aucune requête parte.
 *
 * Le test observe l'en-tête réellement ENVOYÉ (`fetch` espionné, `apiRequest` réel).
 */
const jeton = vi.hoisted(() => ({ valeur: undefined as string | undefined }));

vi.mock('next-intl/server', async () => ({
  ...(await import('@/test/intl')).mockTraductionsServeur(),
  getLocale: async () => 'fr',
}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/session', () => ({ getToken: async () => jeton.valeur }));

import { submitPropertyReport, submitReviewReport } from '../property';

describe('signalements — sans compte, jeton si connecté', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const appels = (): Array<{ url: string; enTetes: Record<string, string>; corps: unknown }> =>
    (fetchSpy.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>).map(([url, init]) => ({
      url: String(url),
      enTetes: init?.headers as Record<string, string>,
      corps: JSON.parse(String(init?.body ?? 'null')),
    }));

  beforeEach(() => {
    jeton.valeur = undefined;
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{"message":"ok"}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('un visiteur sans compte signale une annonce : la requête part, sans Authorization', async () => {
    const res = await submitPropertyReport('bien-7', { reason: 'fraud', details: 'Photos volées' });

    expect(res.ok).toBe(true);
    const [appel] = appels();
    expect(appel!.url).toContain('/api/public/properties/bien-7/report');
    expect(appel!.enTetes).not.toHaveProperty('Authorization');
    expect(appel!.corps).toEqual({ reason: 'fraud', details: 'Photos volées' });
  });

  it('un visiteur connecté signale une annonce : le jeton part', async () => {
    jeton.valeur = 'jeton-de-test';

    await submitPropertyReport('bien-7', { reason: 'fraud' });

    expect(appels()[0]!.enTetes).toMatchObject({ Authorization: 'Bearer jeton-de-test' });
  });

  it('le signalement d’un avis part sans session, sur la route publique', async () => {
    const res = await submitReviewReport(42, { reason: 'offensive', company: 'robot' });

    expect(res.ok).toBe(true);
    const [appel] = appels();
    expect(appel!.url).toContain('/api/public/reviews/42/report');
    expect(appel!.enTetes).not.toHaveProperty('Authorization');
    expect(appel!.corps).toEqual({ reason: 'offensive', company: 'robot' });
  });

  it('et avec le jeton quand le visiteur est connecté', async () => {
    jeton.valeur = 'jeton-de-test';

    await submitReviewReport(42, { reason: 'spam' });

    expect(appels()[0]!.enTetes).toMatchObject({ Authorization: 'Bearer jeton-de-test' });
  });
});
