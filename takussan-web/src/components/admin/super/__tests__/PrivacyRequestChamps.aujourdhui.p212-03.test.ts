/**
 * P212.03 — la date de réception d'une demande de droits est pré-remplie et bornée par
 * `aujourdhui()`, que l'API juge par `before_or_equal:today` en UTC
 * (`StorePrivacyRequestRequest`). Navigateur à Paris, fixé AVANT toute date.
 */
process.env.TZ = 'Europe/Paris';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { aujourdhui } from '../PrivacyRequestChamps';

describe('aujourdhui() — le jour de l’API (P212.03)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('à 22:30 Z le 24 (00:30 le 25 à Paris), rend le 24, que l’API accepte', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T22:30:00Z'));
    expect(aujourdhui()).toBe('2026-10-24');
  });
});
