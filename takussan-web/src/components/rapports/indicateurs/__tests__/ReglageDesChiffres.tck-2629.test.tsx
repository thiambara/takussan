/**
 * TCK-2629 — « Personnaliser les chiffres » sur la page : réordonner écrit `sort_order`, masquer écrit
 * `is_enabled: false`, à « Enregistrer » seulement ; un échec rend l'ordre d'avant (écran ET API) et le dit.
 * Ajouter et supprimer s'écrivent tout de suite ; l'aperçu lit la valeur de la métrique.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createKpiConfigAction, deleteKpiConfigAction, updateKpiConfigAction } from '@/app/actions/kpis';
import type { KpiConfig } from '@/lib/queries/kpis';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/app/actions/kpis', () => ({
  createKpiConfigAction: vi.fn(),
  deleteKpiConfigAction: vi.fn(),
  updateKpiConfigAction: vi.fn(),
}));

const { ReglageEnPage } = await import('../ReglageDesChiffres');

const R = fr.rapports.reglage;
const config = (id: number, metric: string, label: string, sort_order: number, format: KpiConfig['format'] = 'number'): KpiConfig => ({
  id,
  agency_id: 1,
  metric,
  label,
  format,
  sort_order,
  is_enabled: true,
  settings: null,
});
const CONFIGS = [
  config(11, 'revenue_month', 'Encaissé', 0, 'currency'),
  config(12, 'leases_active', 'Baux actifs', 1),
  config(13, 'unpaid_rate_percent', 'Taux d’impayés', 2, 'percent'),
];
const APERCUS = { revenue_month: 95_200_000, leases_active: 92, unpaid_rate_percent: 3.91, customers_count: 141 };
const CATALOGUE = ['revenue_month', 'leases_active', 'unpaid_rate_percent', 'customers_count'];

const ordre = () => within(screen.getByRole('list', { name: R.ordreAria })).getAllByRole('listitem').map((li) => li.getAttribute('data-chiffre'));

function rendre() {
  render(withIntl(<ReglageEnPage configs={CONFIGS} catalog={CATALOGUE} apercus={APERCUS} />));
}

beforeEach(() => {
  refresh.mockReset();
  vi.mocked(updateKpiConfigAction).mockReset();
  vi.mocked(createKpiConfigAction).mockReset();
  vi.mocked(deleteKpiConfigAction).mockReset();
  vi.mocked(updateKpiConfigAction).mockImplementation(async (id, corps) => ({ ok: true, data: { ...CONFIGS.find((c) => c.id === id)!, ...corps } }));
});

describe('TCK-2629 — le réglage des chiffres', () => {
  it('AC5 — « Taux d’impayés » en premier puis « Enregistrer » : PATCH du nouveau sort_order, et rien avant', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Monter Taux d’impayés' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monter Taux d’impayés' }));
    expect(ordre()).toEqual(['unpaid_rate_percent', 'revenue_month', 'leases_active']);
    expect(updateKpiConfigAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: R.enregistrer }));
    await waitFor(() => expect(updateKpiConfigAction).toHaveBeenCalledTimes(3));
    expect(updateKpiConfigAction).toHaveBeenCalledWith(13, { sort_order: 0 });
    expect(updateKpiConfigAction).toHaveBeenCalledWith(11, { sort_order: 1 });
    expect(updateKpiConfigAction).toHaveBeenCalledWith(12, { sort_order: 2 });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('masquer écrit is_enabled: false, pour la seule ligne masquée', async () => {
    rendre();
    fireEvent.click(screen.getByRole('switch', { name: 'Afficher Baux actifs' }));
    fireEvent.click(screen.getByRole('button', { name: R.enregistrer }));
    await waitFor(() => expect(updateKpiConfigAction).toHaveBeenCalledTimes(1));
    expect(updateKpiConfigAction).toHaveBeenCalledWith(12, { is_enabled: false });
  });

  it('un échec rend l’ordre d’avant, défait les écritures passées, et le dit', async () => {
    vi.mocked(updateKpiConfigAction).mockImplementation(async (id, corps) =>
      id === 11 && corps.sort_order === 1 ? { ok: false, message: 'boom' } : { ok: true, data: { ...CONFIGS.find((c) => c.id === id)!, ...corps } },
    );
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Monter Taux d’impayés' }));
    fireEvent.click(screen.getByRole('button', { name: 'Monter Taux d’impayés' }));
    fireEvent.click(screen.getByRole('button', { name: R.enregistrer }));
    expect(await screen.findByTestId('reglage-echec')).toHaveTextContent(R.echec);
    expect(ordre()).toEqual(['revenue_month', 'leases_active', 'unpaid_rate_percent']);
    // Les deux écritures passées sont rendues à leur rang d'avant.
    expect(updateKpiConfigAction).toHaveBeenCalledWith(13, { sort_order: 2 });
    expect(updateKpiConfigAction).toHaveBeenCalledWith(12, { sort_order: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('l’aperçu de la valeur de chaque chiffre, et les métriques à ajouter', () => {
    rendre();
    const taux = screen.getByRole('list', { name: R.ordreAria }).querySelector('[data-chiffre="unpaid_rate_percent"]') as HTMLElement;
    expect(taux).toHaveTextContent(/3,9\s%/u);
    expect(screen.getByRole('button', { name: /Ajouter .*clients/i })).toBeInTheDocument();
  });

  it('ajouter un chiffre : métrique, libellé, format, écrit tout de suite', async () => {
    vi.mocked(createKpiConfigAction).mockResolvedValue({ ok: true, data: config(14, 'customers_count', 'Clients', 3) });
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter .*clients/i }));
    fireEvent.click(screen.getByRole('button', { name: R.ajouter }));
    await waitFor(() => expect(createKpiConfigAction).toHaveBeenCalledWith(expect.objectContaining({ metric: 'customers_count', format: 'number' })));
    await waitFor(() => expect(ordre()).toContain('customers_count'));
  });

  it('TCK-1491 — le libellé porte la borne de l’API (`StoreKpiConfigRequest`, 120), repris de KpiConfigList', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter .*clients/i }));
    expect((screen.getByRole('textbox') as HTMLInputElement).maxLength).toBe(120);
  });

  it('état vide : la vue d’ensemble garde ses six chiffres', () => {
    render(withIntl(<ReglageEnPage configs={[]} catalog={CATALOGUE} />));
    expect(screen.getByTestId('reglage-vide')).toHaveTextContent(R.vide);
  });
});
