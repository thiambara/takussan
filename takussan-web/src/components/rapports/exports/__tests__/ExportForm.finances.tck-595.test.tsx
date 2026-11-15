import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { useCan } from '@/hooks/useCan';
import { withIntl } from '@/test/intl';
import { ExportForm } from '../ExportForm';

/** TCK-2629 — le téléchargement relit « Derniers exports » : le formulaire vit sous un `QueryClient`. */
function avecClient(ui: ReactElement) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>;
}

/**
 * TCK-595 (§7, AC19 côté écran) — les exports financiers de l'agence (reversements, factures,
 * commissions, impayés par ancienneté, cautions détenues) s'offrent au personnel qui tient
 * `reports.export`, comme l'API les juge, et jamais au bailleur, à qui l'API les refuse.
 */
vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

function tenant(capacites: readonly string[]) {
  vi.mocked(useCan).mockImplementation((capability) => ({
    can: capacites.includes(capability),
    isLoading: false,
  }));
}

const T = fr.dashboard.exports;
const FINANCES = [
  T.entities.payouts,
  T.entities.invoices,
  T.entities.commissions,
  T.entities.aging,
  T.entities.deposits,
];

/** TCK-2629 — les types se choisissent en puces, dans le groupe « Type de données ». */
async function optionsOffertes(): Promise<string[]> {
  return within(screen.getByRole('group', { name: T.dataType }))
    .getAllByRole('button')
    .map((o) => o.textContent ?? '');
}

describe('ExportForm — exports financiers (TCK-595)', () => {
  beforeEach(() => {
    vi.mocked(useCan).mockReset();
  });

  it('le personnel qui tient reports.export se voit offrir les cinq exports financiers', async () => {
    tenant(['reports.export']);
    render(withIntl(avecClient(<ExportForm staff />)));

    const offertes = await optionsOffertes();
    for (const libelle of FINANCES) expect(offertes).toContain(libelle);
    expect(offertes).not.toContain(T.entities.customers);
  });

  it('le bailleur ne se voit offrir aucun export financier de l’agence', async () => {
    tenant(['reports.export']);
    render(withIntl(avecClient(<ExportForm staff={false} />)));

    const offertes = await optionsOffertes();
    for (const libelle of FINANCES) expect(offertes).not.toContain(libelle);
    expect(offertes).toContain(T.entities.payments);
  });
});
