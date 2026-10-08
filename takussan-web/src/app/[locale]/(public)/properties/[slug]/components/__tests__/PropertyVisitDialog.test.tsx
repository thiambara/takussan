/**
 * TCK-590 — la boîte de visite : ouverte au visiteur sans compte, créneaux tirés de l'API, heure
 * construite à Dakar (AC10), mention de confidentialité (AC19c), écran de suite.
 *
 * Le fuseau du navigateur est forcé à Paris AVANT toute date : un vert pris à UTC (= Dakar) ne
 * distinguerait pas « 10:00 à Dakar » de « 10:00 dans le navigateur ».
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PropertyVisitDialog } from '../PropertyVisitDialog';
import { withIntl } from '@/test/intl';

const submit = vi.fn();
const apiFetch = vi.fn();

vi.mock('@/hooks/useVisitRequest', () => ({
  useVisitRequest: () => ({ submit, submitting: false, error: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

let authUser: { id: number } | null = null;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: authUser, token: null, isLoading: false }),
}));

function creneaux(jour: string, pris: string[] = []) {
  const labels = ['09:00', '09:30', '10:00', '10:30', '11:00'];
  return {
    data: {
      date: jour,
      timezone: 'Africa/Dakar',
      slots: labels.map((label) => ({
        start: `${jour}T${label}:00Z`,
        label,
        available: !pris.includes(label),
      })),
    },
  };
}

async function choisirLe12Novembre(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Date' }));
  await user.click(await screen.findByRole('button', { name: /12 novembre 2026/i }));
}

describe('<PropertyVisitDialog> — TCK-590', () => {
  beforeEach(() => {
    submit.mockReset();
    submit.mockResolvedValue(undefined);
    apiFetch.mockReset();
    apiFetch.mockImplementation((path: string) => {
      const jour = /date=(\d{4}-\d{2}-\d{2})/.exec(path)?.[1] ?? '';
      return Promise.resolve(creneaux(jour, ['10:30']));
    });
    authUser = null;
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-11-01T08:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('le visiteur sans compte a le formulaire, pas « Se connecter », et la mention de confidentialité', () => {
    render(withIntl(<PropertyVisitDialog slug="villa-almadies" open onOpenChange={() => {}} />));

    expect(screen.queryByRole('link', { name: /se connecter/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Votre nom')).toBeInTheDocument();
    expect(screen.getByLabelText('Téléphone')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/legal\/privacy$/),
    );
  });

  it('un utilisateur connecté n’a ni nom, ni téléphone, ni mention', () => {
    authUser = { id: 5 };
    render(withIntl(<PropertyVisitDialog slug="villa-almadies" open onOpenChange={() => {}} />));

    expect(screen.queryByLabelText('Votre nom')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Politique de confidentialité' })).not.toBeInTheDocument();
  });

  it('les créneaux viennent de l’API, à la date choisie ; un créneau pris est visible et non choisissable', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<PropertyVisitDialog slug="villa-almadies" open onOpenChange={() => {}} />));

    await choisirLe12Novembre(user);

    expect(await screen.findByRole('button', { name: '10:00' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '10:30 — déjà pris' })).toBeDisabled();
    expect(apiFetch).toHaveBeenCalledWith('/public/properties/villa-almadies/visit-slots?date=2026-11-12');
    expect(screen.getByText('(heure de Dakar)')).toBeInTheDocument();
  });

  it('AC10 — navigateur à Paris : 10:00 le 12 novembre envoie 2026-11-12T10:00:00Z, puis l’écran de suite', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSuccess = vi.fn();
    render(withIntl(<PropertyVisitDialog slug="villa-almadies" open onOpenChange={() => {}} onSuccess={onSuccess} />));

    await choisirLe12Novembre(user);
    await user.click(await screen.findByRole('button', { name: '10:00' }));
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: /demander la visite/i }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    const payload = submit.mock.calls[0][0];
    expect(payload.scheduled_at).toBe('2026-11-12T10:00:00Z');
    expect(payload.visitor_name).toBe('Awa Diop');
    expect(payload.visitor_phone).toBe('+221771234567');
    expect(payload.visitor_email).toBeUndefined();

    expect(await screen.findByText('Demande envoyée')).toBeInTheDocument();
    expect(screen.getByText(/SMS au \+221771234567/)).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalled();
    // Nom et téléphone retenus pour le contact suivant, sur cet appareil.
    expect(JSON.parse(window.localStorage.getItem('takussan.coordonnees') ?? '{}')).toEqual({
      name: 'Awa Diop',
      phone: '+221771234567',
    });
  });

  it('sans téléphone, rien ne part', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<PropertyVisitDialog slug="villa-almadies" open onOpenChange={() => {}} />));

    await choisirLe12Novembre(user);
    await user.click(await screen.findByRole('button', { name: '10:00' }));
    await user.type(screen.getByLabelText('Votre nom'), 'Awa Diop');
    await user.click(screen.getByRole('button', { name: /demander la visite/i }));

    expect(await screen.findByText('Indiquez un numéro où l’agent peut vous joindre.')).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();
  });

  it('la source d’arrivée retenue part avec la demande', async () => {
    window.sessionStorage.setItem('takussan.arrivee', JSON.stringify({ source: 'whatsapp', medium: 'share' }));
    authUser = { id: 5 };
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(withIntl(<PropertyVisitDialog slug="villa-almadies" open onOpenChange={() => {}} />));

    await choisirLe12Novembre(user);
    await user.click(await screen.findByRole('button', { name: '09:30' }));
    await user.click(screen.getByRole('button', { name: /demander la visite/i }));

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][0]).toMatchObject({
      scheduled_at: '2026-11-12T09:30:00Z',
      source: 'whatsapp',
      medium: 'share',
    });
  });
});
