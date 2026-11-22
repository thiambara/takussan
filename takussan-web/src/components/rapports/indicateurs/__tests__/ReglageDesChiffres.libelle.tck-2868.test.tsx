/**
 * TCK-2868 (AC6) — un chiffre DÉJÀ AFFICHÉ se déplie en « Libellé / Format » ; « Enregistrer » envoie le
 * `PATCH kpi-configs/{id}` de ce libellé et de ce format, puis relit la page (la tuile lit `label`).
 * « Annuler » rend le libellé d'avant ; un libellé vide est refusé à l'écran.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateKpiConfigAction } from '@/app/actions/kpis';
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
const CONFIGS = [config(11, 'properties_total', 'Biens', 0), config(12, 'revenue_month', 'Encaissé', 1, 'currency')];

function rendre() {
  render(withIntl(<ReglageEnPage configs={CONFIGS} catalog={['properties_total', 'revenue_month']} apercus={{ properties_total: 214, revenue_month: 1 }} />));
}

beforeEach(() => {
  refresh.mockReset();
  vi.mocked(updateKpiConfigAction).mockReset();
  vi.mocked(updateKpiConfigAction).mockImplementation(async (id, corps) => ({ ok: true, data: { ...CONFIGS.find((c) => c.id === id)!, ...corps } }));
});

describe('TCK-2868 — libellé et format d’un chiffre affiché', () => {
  it('AC6 — la ligne se déplie ; « Enregistrer » envoie le PATCH du libellé et du format, et relit la page', async () => {
    rendre();
    const depli = screen.getByRole('button', { name: 'Modifier le libellé et le format de Biens' });
    expect(depli).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(depli);
    expect(depli).toHaveAttribute('aria-expanded', 'true');
    const panneau = document.querySelector('[data-slot="edition-du-chiffre"]') as HTMLElement;
    expect(panneau).toHaveTextContent('Métrique : Biens au total (aujourd’hui : 214)'.replace('Biens au total', fr.dashboard.kpis.metrics.properties_total));
    fireEvent.change(within(panneau).getByLabelText(fr.dashboard.kpis.label), { target: { value: 'Biens publiés' } });
    fireEvent.click(within(within(panneau).getByRole('radiogroup', { name: fr.dashboard.kpis.format })).getByRole('radio', { name: R.formats.percent }));
    // Rien n'est écrit avant « Enregistrer ».
    expect(updateKpiConfigAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: R.enregistrer }));
    await waitFor(() => expect(updateKpiConfigAction).toHaveBeenCalledWith(11, { label: 'Biens publiés', format: 'percent' }));
    expect(updateKpiConfigAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByRole('list', { name: R.ordreAria })).toHaveTextContent('Biens publiés');
  });

  it('les formats se disent « Nombre · Montant · Pourcentage » (maquette)', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le libellé et le format de Encaissé' }));
    const formats = screen.getByRole('radiogroup', { name: fr.dashboard.kpis.format });
    expect(within(formats).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Nombre', 'Montant', 'Pourcentage']);
    expect(within(formats).getByRole('radio', { name: 'Montant' })).toBeChecked();
  });

  it('un libellé vide n’est pas envoyé : l’écran le dit', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le libellé et le format de Biens' }));
    fireEvent.change(screen.getByLabelText(fr.dashboard.kpis.label), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: R.enregistrer }));
    expect(await screen.findByTestId('reglage-libelle-vide')).toHaveTextContent(R.libelleVide);
    expect(updateKpiConfigAction).not.toHaveBeenCalled();
  });
});
