import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TCK-2672 — `POST /api/properties/{id}/reject` exige `reason_code`. L'écran actuel ne propose pas
 * encore le choix du motif (TCK-2673) : sans ce défaut, toute demande de correction rendait 422.
 */
const mockApiRequest = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

const { rejectProperty } = await import('@/lib/queries/property-moderation');

describe('TCK-2672 — rejectProperty envoie un code de motif', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: {} });
  });

  it('envoie `other` quand l’appelant ne choisit pas de motif', async () => {
    await rejectProperty(7, 'Les photos ne montrent pas la cuisine annoncée.', 'jeton');
    const [url, init] = mockApiRequest.mock.calls[0];
    expect(String(url)).toBe('/api/properties/7/reject');
    expect(init.body).toEqual({ rejection_reason: 'Les photos ne montrent pas la cuisine annoncée.', reason_code: 'other' });
  });

  it('envoie le motif choisi', async () => {
    await rejectProperty(7, 'Le prix ne correspond pas au quartier annoncé.', 'jeton', 'price');
    expect(mockApiRequest.mock.calls[0][1].body.reason_code).toBe('price');
  });
});
