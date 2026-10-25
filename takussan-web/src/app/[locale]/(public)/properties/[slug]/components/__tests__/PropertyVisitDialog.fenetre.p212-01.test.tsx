/**
 * P212.01 — le calendrier de la demande de visite offre la fenêtre que l'API accepte :
 * `after_or_equal:today` et `before_or_equal:+60 days`, jugés en UTC
 * (`VisitSlotsPublicPropertyRequest`). Hors d'elle, le jour choisi rendait « Les créneaux n'ont
 * pas pu être chargés ».
 *
 * Le navigateur est à New York, le soir : son jour local (24 octobre) est la veille du jour UTC
 * (25 octobre). Fixé AVANT toute date.
 */
process.env.TZ = 'America/New_York';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyVisitDialog } from '../PropertyVisitDialog';
import { withIntl } from '@/test/intl';

vi.mock('@/hooks/useVisitRequest', () => ({
  useVisitRequest: () => ({ submit: vi.fn(), submitting: false, error: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: () => Promise.resolve({ data: { slots: [] } }),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, isLoading: false }),
}));

function jour(nom: RegExp): HTMLElement {
  return screen.getByRole('button', { name: nom });
}

describe('<PropertyVisitDialog> — fenêtre de l’API (P212.01)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 21:00 à New York le 24 octobre = 01:00 Z le 25 octobre.
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('le jour local d’avant le jour UTC est grisé, le jour UTC est offert', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<PropertyVisitDialog slug="villa-almadies" open onOpenChange={() => {}} />));

    await user.click(screen.getByRole('button', { name: 'Date' }));

    expect(await screen.findByRole('button', { name: /24 octobre 2026/i })).toBeDisabled();
    expect(jour(/25 octobre 2026/i)).toBeEnabled();
  });

  it('J+60 est offert, J+61 est grisé', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<PropertyVisitDialog slug="villa-almadies" open onOpenChange={() => {}} />));

    await user.click(screen.getByRole('button', { name: 'Date' }));
    await screen.findByRole('button', { name: /25 octobre 2026/i });
    const suivant = () => screen.getByRole('button', { name: /next|suivant/i });
    await user.click(suivant());
    await user.click(suivant());

    // 2026-10-25 + 60 jours = 2026-12-24.
    expect(await screen.findByRole('button', { name: /24 décembre 2026/i })).toBeEnabled();
    expect(jour(/25 décembre 2026/i)).toBeDisabled();
  });
});
