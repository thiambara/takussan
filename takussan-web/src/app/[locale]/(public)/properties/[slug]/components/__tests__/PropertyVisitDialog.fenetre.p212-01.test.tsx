/**
 * P212.01, repris par TCK-2503 — le calendrier « Autre date » offre la fenêtre que l'API accepte
 * pour une demande par tranche : de AUJOURD'HUI À DAKAR à J+30 inclus (`TrancheDeVisite::MAX_DAYS`).
 * L'ancienne boîte offrait 60 jours, ceux de `visit-slots`, que la tranche n'appelle plus.
 *
 * Le navigateur est à New York, le soir : son jour local (24 octobre) est la veille du jour de
 * Dakar (25 octobre). Fixé AVANT toute date.
 */
process.env.TZ = 'America/New_York';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyVisitDialog } from '../PropertyVisitDialog';
import type { BienDeLaVisite } from '../visite/RecapDuBien';
import { withIntl } from '@/test/intl';

vi.mock('@/app/actions/property', () => ({ submitVisitRequest: vi.fn() }));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, isLoading: false }),
}));

const BIEN = {
  slug: 'villa-almadies',
  title: 'Villa aux Almadies',
  photos: [],
  price: 650000,
  currency: 'XOF',
  contract_type: 'rent',
  rent_period: 'monthly',
  location: { quarter: 'Almadies', city: 'Dakar' },
} as unknown as BienDeLaVisite;

/**
 * Le dialogue pose son focus initial APRÈS son montage : un calendrier ouvert avant lui perdrait le
 * focus (`focus-out`) et se refermerait. L'utilisateur, lui, ne clique jamais si vite.
 */
async function ouvrirLeCalendrier(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(document.activeElement).not.toBe(document.body));
  await user.click(screen.getByRole('button', { name: /autre date/i }));
}

function jour(nom: RegExp): HTMLElement {
  return screen.getByRole('button', { name: nom });
}

describe('<PropertyVisitDialog> — fenêtre de l’API (P212.01, TCK-2503)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 21:00 à New York le 24 octobre = 01:00 à Dakar le 25 octobre.
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('les jours proposés sont ceux de Dakar, pas ceux du navigateur', () => {
    render(withIntl(<PropertyVisitDialog property={BIEN} open onOpenChange={() => {}} />));
    expect(screen.getByRole('radio', { name: /aujourd’hui.*25 oct/i })).toBeInTheDocument();
  });

  it('le jour local d’avant le jour de Dakar est grisé, le jour de Dakar est offert', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<PropertyVisitDialog property={BIEN} open onOpenChange={() => {}} />));

    await ouvrirLeCalendrier(user);

    expect(await screen.findByRole('button', { name: /24 octobre 2026/i })).toBeDisabled();
    expect(jour(/25 octobre 2026/i)).toBeEnabled();
  });

  it('J+30 est offert, J+31 est grisé', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<PropertyVisitDialog property={BIEN} open onOpenChange={() => {}} />));

    await ouvrirLeCalendrier(user);
    await screen.findByRole('button', { name: /25 octobre 2026/i });
    await user.click(screen.getByRole('button', { name: /next|suivant/i }));

    // 2026-10-25 + 30 jours = 2026-11-24.
    expect(await screen.findByRole('button', { name: /24 novembre 2026/i })).toBeEnabled();
    expect(jour(/25 novembre 2026/i)).toBeDisabled();
  });

  it('une date choisie au calendrier devient le jour retenu', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<PropertyVisitDialog property={BIEN} open onOpenChange={() => {}} />));

    await ouvrirLeCalendrier(user);
    await user.click(await screen.findByRole('button', { name: /30 octobre 2026/i }));

    expect(screen.getByRole('button', { name: /autre date : vendredi 30 octobre/i })).toHaveAttribute('aria-pressed', 'true');
  });
});
