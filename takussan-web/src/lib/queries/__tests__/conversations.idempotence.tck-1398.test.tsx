import { describe, expect, it, vi } from 'vitest';

import { useApiMutation } from '@/hooks/useApiQuery';
import { useSendMessage, useSendVoiceNote } from '../conversations';

/**
 * TCK-1398 (P144.02, ADR-0072 lot 1) — le texte et la note vocale partent sous une clé
 * d'idempotence que `useApiMutation` garde d'un essai à l'autre (TCK-1396) : un message renvoyé
 * après une réponse perdue ne s'écrit plus deux fois.
 */
vi.mock('@/hooks/useApiQuery', () => ({ useApiMutation: vi.fn(), useApiQuery: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}));

describe('messages — clé d’idempotence (TCK-1398)', () => {
  it.each([
    ['texte', useSendMessage],
    ['note vocale', useSendVoiceNote],
  ])('le %s demande l’option idempotence sur la route des messages', (_nom, hook) => {
    vi.mocked(useApiMutation).mockClear();

    hook(12);

    expect(vi.mocked(useApiMutation)).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
      expect.objectContaining({ idempotence: true }),
    );
  });
});
