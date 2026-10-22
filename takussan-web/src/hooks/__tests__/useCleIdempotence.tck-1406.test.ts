import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useCleIdempotence } from '../useCleIdempotence';

/** TCK-1406 (ADR-0072 § 7) — la clé d'un formulaire qui écrit par une action serveur. */
describe('useCleIdempotence (TCK-1406)', () => {
  it('garde la clé après un échec, la renouvelle après un succès et après key_reused', () => {
    const { result } = renderHook(() => useCleIdempotence());

    const premiere = result.current.cle();
    expect(premiere).toMatch(/^[0-9a-f-]{36}$/);
    result.current.apres({ ok: false });
    expect(result.current.cle()).toBe(premiere);

    result.current.apres({ ok: true });
    const seconde = result.current.cle();
    expect(seconde).not.toBe(premiere);

    result.current.apres({ ok: false, code: 'idempotency.key_reused' });
    expect(result.current.cle()).not.toBe(seconde);
  });
});
