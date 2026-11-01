import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileTimezoneSection } from '../ProfileTimezoneSection';
import { withIntl } from '@/test/intl';

/**
 * TCK-1497 (P107.03, porteur 2026-10-22) — « un fuseau par compte : `timezone` accepté sur
 * `PATCH /api/me` avec un champ au profil ». Le champ lit le fuseau du compte et l'enregistre par
 * le relais `PATCH /api/me`.
 */
describe('ProfileTimezoneSection', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('montre le fuseau du compte, et Dakar sans fuseau', () => {
    const { unmount } = render(withIntl(<ProfileTimezoneSection timezone="Europe/Paris" />));
    expect(screen.getByRole('combobox', { name: 'Fuseau horaire' })).toHaveTextContent('Europe/Paris');
    unmount();

    render(withIntl(<ProfileTimezoneSection timezone={null} />));
    expect(screen.getByRole('combobox', { name: 'Fuseau horaire' })).toHaveTextContent('Africa/Dakar');
  });

  it('enregistre le fuseau choisi par PATCH /api/me', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { timezone: 'Europe/Paris' } }), { status: 200 }));
    const user = userEvent.setup();
    render(withIntl(<ProfileTimezoneSection timezone="Africa/Dakar" />));

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await user.click(screen.getByRole('combobox', { name: 'Fuseau horaire' }));
    await user.click(await screen.findByRole('option', { name: 'Europe/Paris' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/me');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ timezone: 'Europe/Paris' });
    expect(await screen.findByText('Fuseau horaire enregistré.')).toBeInTheDocument();
  });

  it("dit l'échec sans changer le fuseau enregistré", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: 'x' }), { status: 422 }));
    const user = userEvent.setup();
    render(withIntl(<ProfileTimezoneSection timezone="Africa/Dakar" />));

    await user.click(screen.getByRole('combobox', { name: 'Fuseau horaire' }));
    await user.click(await screen.findByRole('option', { name: 'Europe/Paris' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText("Le fuseau horaire n'a pas pu être enregistré.")).toBeInTheDocument();
  });
});
