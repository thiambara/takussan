import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * TCK-2672 — `POST /api/properties/{id}/reject` exige `reason_code`. TCK-2673 — l'écran fait choisir
 * le motif : la fonction n'a plus de défaut (`other` envoyé d'office masquait un motif oublié).
 */
const mockApiRequest = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

const { rejectProperty } = await import('@/lib/queries/property-moderation');

describe('TCK-2672 / TCK-2673 — rejectProperty envoie le code de motif choisi', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: {} });
  });

  it('envoie le motif choisi et la raison écrite', async () => {
    await rejectProperty(7, { reasonCode: 'price', rejectionReason: 'Le prix ne correspond pas au quartier annoncé.' }, 'jeton');
    const [url, init] = mockApiRequest.mock.calls[0];
    expect(String(url)).toBe('/api/properties/7/reject');
    expect(init.method).toBe('POST');
    expect(init.body).toEqual({ rejection_reason: 'Le prix ne correspond pas au quartier annoncé.', reason_code: 'price' });
  });
});
