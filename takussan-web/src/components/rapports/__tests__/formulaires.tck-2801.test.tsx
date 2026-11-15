/**
 * TCK-2801 (fiche TCK-2629, O2, O3, O5) — les formulaires de « Rapports » reviennent à la maquette : le format
 * d'un export et la sévérité d'une alerte en contrôle segmenté (un groupe radio, une option choisie), les mots de
 * la maquette (« Balance âgée », « Cautions », « Excel », « Télécharger l’export », « Information »,
 * « Délai entre deux alertes » et son unité).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createThresholdAlertAction } from '@/app/actions/alerts';
import { useCan } from '@/hooks/useCan';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn(() => ({ can: true, isLoading: false })) }));
vi.mock('@/app/actions/alerts', () => ({
  createThresholdAlertAction: vi.fn(async () => ({ ok: false, error: 'non' })),
  deleteThresholdAlertAction: vi.fn(),
  updateThresholdAlertAction: vi.fn(),
}));

const { ExportForm } = await import('../exports/ExportForm');
const { AlertList } = await import('../alertes/AlertList');

describe('TCK-2801 — AC7 : l’export personnalisé', () => {
  it('le format est un groupe radio « CSV · Excel · PDF », Excel choisi au bureau ; un clic choisit PDF', () => {
    vi.mocked(useCan).mockReturnValue({ can: true, isLoading: false });
    render(withIntl(<QueryClientProvider client={new QueryClient()}><ExportForm staff /></QueryClientProvider>));
    const groupe = screen.getByRole('radiogroup', { name: 'Format' });
    const options = within(groupe).getAllByRole('radio');
    expect(options.map((o) => [o.textContent, o.getAttribute('aria-checked')])).toEqual([
      ['CSV', 'false'],
      ['Excel', 'true'],
      ['PDF', 'false'],
    ]);
    fireEvent.click(options[2]);
    expect(within(groupe).getByRole('radio', { name: 'PDF' }).getAttribute('aria-checked')).toBe('true');
  });

  it('les types disent « Balance âgée » et « Cautions », le bouton « Télécharger l’export »', () => {
    render(withIntl(<QueryClientProvider client={new QueryClient()}><ExportForm staff /></QueryClientProvider>));
    const types = within(screen.getByRole('group', { name: 'Type de données' })).getAllByRole('button').map((b) => b.textContent);
    expect(types).toContain('Balance âgée');
    expect(types).toContain('Cautions');
    expect(types.join()).not.toMatch(/ancienneté|détenues/);
    expect(screen.getByRole('button', { name: 'Télécharger l’export' })).toBeTruthy();
  });
});

describe('TCK-2801 — AC7 : la nouvelle alerte', () => {
  it('la sévérité est un groupe radio « Information · Attention · Critique », Attention par défaut ; le délai dit son unité', async () => {
    render(withIntl(<AlertList initialAlerts={[]} />));
    fireEvent.click(screen.getAllByRole('button', { name: fr.rapports.alertes.nouvelle })[0]);
    const groupe = await screen.findByRole('radiogroup', { name: 'Sévérité' });
    expect(within(groupe).getAllByRole('radio').map((o) => [o.textContent, o.getAttribute('aria-checked')])).toEqual([
      ['Information', 'false'],
      ['Attention', 'true'],
      ['Critique', 'false'],
    ]);
    fireEvent.click(within(groupe).getByRole('radio', { name: 'Critique' }));
    const delai = screen.getByLabelText('Délai entre deux alertes');
    expect(delai.getAttribute('aria-describedby')?.split(' ').map((id) => document.getElementById(id)?.textContent)[0]).toBe('heures');
    fireEvent.change(screen.getByLabelText(fr.dashboard.alerts.threshold), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: fr.dashboard.alerts.create }));
    await waitFor(() => expect(createThresholdAlertAction).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical', cooldown_hours: 24 })));
  });
});
