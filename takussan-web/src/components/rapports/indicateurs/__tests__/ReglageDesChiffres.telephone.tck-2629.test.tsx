/**
 * TCK-2629 (L2 bis, fidélité a-1, O9) — au téléphone, la ligne du réglage portait libellé, aperçu, flèches,
 * interrupteur et corbeille sur 358 px : le libellé tombait à « Taux d'i… ». Décision a) : sous `lg`, l'aperçu
 * passe SOUS le libellé (avec la métrique), et le libellé n'est plus coupé (il passe à la ligne) ; dès `lg`, la
 * ligne d'avant (aperçu à droite, libellé d'une ligne). jsdom ne mesure rien : on juge les classes qui portent
 * ce partage, et le relevé de fidélité juge les pixels.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { KpiConfig } from '@/lib/queries/kpis';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/actions/kpis', () => ({ createKpiConfigAction: vi.fn(), deleteKpiConfigAction: vi.fn(), updateKpiConfigAction: vi.fn() }));

const { ReglageEnPage } = await import('../ReglageDesChiffres');

const R = fr.rapports.reglage;
const TAUX: KpiConfig = { id: 13, agency_id: 1, metric: 'unpaid_rate_percent', label: 'Taux d’impayés', format: 'percent', sort_order: 0, is_enabled: true, settings: null };

describe('TCK-2629 — la ligne du réglage au téléphone', () => {
  it('le libellé n’est coupé que dès lg ; l’aperçu est sous le libellé avant lg, à droite après', () => {
    render(withIntl(<ReglageEnPage configs={[TAUX]} catalog={['unpaid_rate_percent']} apercus={{ unpaid_rate_percent: 3.91 }} />));
    const ligne = within(screen.getByRole('list', { name: R.ordreAria })).getByRole('listitem');
    const libelle = within(ligne).getByText('Taux d’impayés');
    expect(libelle.className).not.toMatch(/(^|\s)truncate(\s|$)/);
    expect(libelle.className).toMatch(/lg:truncate/);
    const dessous = ligne.querySelector('[data-slot="apercu-dessous"]') as HTMLElement;
    expect(dessous).toHaveTextContent(/3,9\s%/u);
    expect(dessous.className).toMatch(/lg:hidden/);
    const aDroite = ligne.querySelector('[data-slot="apercu"]') as HTMLElement;
    expect(aDroite).toHaveTextContent(/3,9\s%/u);
    expect(aDroite.className).toMatch(/max-lg:hidden/);
  });
});
