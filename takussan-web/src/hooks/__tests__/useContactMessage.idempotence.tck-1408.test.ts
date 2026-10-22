import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { submitContactMessage } from '@/app/actions/property';
import { useContactMessage } from '../useContactMessage';

/** TCK-1408 (P144.07, ADR-0072 lot 3) — le message de la fiche renvoie la même clé après un échec. */
vi.mock('next-intl', () => ({ useTranslations: () => (cle: string) => cle }));
vi.mock('@/app/actions/property', () => ({ submitContactMessage: vi.fn() }));
vi.mock('@/hooks/useTriggerMinimalProfileOnce', () => ({
  useTriggerMinimalProfileOnce: () => ({ triggerIfNeeded: () => undefined }),
}));

describe('useContactMessage — clé d’idempotence (TCK-1408)', () => {
  it('passe la même clé à l’action d’un essai à l’autre, et une neuve après un succès', async () => {
    const action = vi.mocked(submitContactMessage);
    const fil = { conversation_id: 1, redirect_to: '/app/messages/1' };
    action
      .mockResolvedValueOnce({ ok: false, message: 'Erreur réseau' })
      .mockResolvedValueOnce({ ok: true, data: fil })
      .mockResolvedValueOnce({ ok: true, data: fil });
    const { result } = renderHook(() => useContactMessage('villa-1'));

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await result.current.submit('Bonjour').catch(() => undefined);
      });
    }

    const cles = action.mock.calls.map((appel) => appel[2]);
    expect(cles[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(cles[1]).toBe(cles[0]);
    expect(cles[2]).not.toBe(cles[0]);
  });
});
