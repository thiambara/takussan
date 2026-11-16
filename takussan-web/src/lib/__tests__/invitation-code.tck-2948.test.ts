import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2948 (ADR-0126, TCK-2940) — `POST …/code` : `channel: "voice"` ne part que pour l'appel (le corps du SMS
 * reste celui d'avant), et `voice_available` n'ouvre la voie que s'il vaut exactement `true`.
 */
const apiRequest = vi.fn();
vi.mock('@/lib/api', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));

import { demanderCodeDInvitation } from '../invitation-code';

describe('demanderCodeDInvitation — la voie de l’appel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('par SMS, le corps ne porte pas `channel` ; `voice_available: true` est rendu', async () => {
    apiRequest.mockResolvedValue({ data: { retry_after: 60, channel: 'sms', voice_available: true } });

    await expect(demanderCodeDInvitation('jeton', null, 'fr')).resolves.toEqual({ attente: 60, codeApercu: null, voixDisponible: true });
    expect(apiRequest).toHaveBeenCalledWith('/api/public/invitations/jeton/code', { method: 'POST', body: {}, locale: 'fr' });
  });

  it('par appel, `channel: "voice"` part avec le numéro saisi', async () => {
    apiRequest.mockResolvedValue({ data: { retry_after: 60, channel: 'voice', voice_available: true } });

    await demanderCodeDInvitation('jeton', '+221771234567', 'fr', 'voice');
    expect(apiRequest).toHaveBeenCalledWith('/api/public/invitations/jeton/code', {
      method: 'POST',
      body: { phone: '+221771234567', channel: 'voice' },
      locale: 'fr',
    });
  });

  it.each([[undefined], [false], ['true'], [1]])('voice_available = %s : la voie reste fermée', async (valeur) => {
    apiRequest.mockResolvedValue({ data: { retry_after: 60, voice_available: valeur } });
    await expect(demanderCodeDInvitation('jeton', null)).resolves.toMatchObject({ voixDisponible: false });
  });
});
