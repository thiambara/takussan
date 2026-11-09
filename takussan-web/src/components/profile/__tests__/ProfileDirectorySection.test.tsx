import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileDirectorySection } from '../ProfileDirectorySection';
import { withIntl } from '@/test/intl';

/**
 * TCK-2506 — « Paraître dans l'annuaire public des propriétaires » : l'interrupteur lit le choix du
 * compte, l'enregistre au geste par `PATCH /api/me`, et revient en arrière si l'API refuse.
 */
describe('ProfileDirectorySection', () => {
  const fetchMock = vi.fn();
  const libelle = "Paraître dans l'annuaire public des propriétaires";

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('montre le choix du compte, et « non » quand il est absent', () => {
    const { unmount } = render(withIntl(<ProfileDirectorySection listed />));
    expect(screen.getByRole('switch', { name: libelle })).toBeChecked();
    unmount();

    render(withIntl(<ProfileDirectorySection />));
    expect(screen.getByRole('switch', { name: libelle })).not.toBeChecked();
  });

  it('dit ce qui devient public', () => {
    render(withIntl(<ProfileDirectorySection />));
    expect(screen.getByRole('switch', { name: libelle })).toHaveAccessibleDescription(
      /Votre nom et vos biens publiés deviennent visibles/,
    );
  });

  it('enregistre le choix au geste par PATCH /api/me, dans les deux sens', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const user = userEvent.setup();
    render(withIntl(<ProfileDirectorySection />));

    await user.click(screen.getByRole('switch', { name: libelle }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/me');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ listed_in_public_directory: true });
    expect(await screen.findByText("Vous paraissez désormais dans l'annuaire public.")).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: libelle })).toBeChecked();

    await user.click(screen.getByRole('switch', { name: libelle }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body))).toEqual({
      listed_in_public_directory: false,
    });
    expect(await screen.findByText("Vous ne paraissez plus dans l'annuaire public.")).toBeInTheDocument();
  });

  it("revient à l'état enregistré et le dit quand l'API refuse", async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"x"}', { status: 422 }));
    const user = userEvent.setup();
    render(withIntl(<ProfileDirectorySection />));

    await user.click(screen.getByRole('switch', { name: libelle }));

    expect(await screen.findByText("Votre choix n'a pas pu être enregistré.")).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: libelle })).not.toBeChecked();
  });
});
