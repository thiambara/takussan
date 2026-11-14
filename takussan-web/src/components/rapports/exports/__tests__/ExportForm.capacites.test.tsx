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
 * TCK-587 (ADR-0031 §2) — l'export n'est proposé qu'à qui en détient la capacité.
 *
 * L'écran ouvrait les clients à tout agent (`isAdmin || isAgent`) ; le serveur exige désormais
 * `crm.export`, `payments.export` ou `reports.export` selon l'entité, et le rôle système d'agent
 * n'en tient aucune. Le bailleur exporte ses propres données, sans capacité.
 */
vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

function tenant(capacites: readonly string[]) {
  vi.mocked(useCan).mockImplementation((capability) => ({
    can: capacites.includes(capability),
    isLoading: false,
  }));
}

const T = fr.dashboard.exports;

describe('ExportForm — exports jugés par capacité (TCK-587)', () => {
  beforeEach(() => {
    vi.mocked(useCan).mockReset();
  });

  it('le personnel sans aucune capacité d’export ne se voit offrir aucun téléchargement', () => {
    tenant([]);
    render(withIntl(avecClient(<ExportForm staff />)));

    expect(screen.getByTestId('exports-none')).toHaveTextContent(T.noneAllowed);
    expect(screen.queryByRole('button', { name: fr.rapports.exports.telechargerLExport })).not.toBeInTheDocument();
  });

  it('le personnel qui tient crm.export seul se voit offrir les clients, d’emblée', () => {
    tenant(['crm.export']);
    render(withIntl(avecClient(<ExportForm staff />)));

    expect(screen.getByRole('button', { name: fr.rapports.exports.telechargerLExport })).toBeInTheDocument();
    // TCK-2629 — le type se choisit en puces : la seule offerte est enfoncée d'emblée.
    expect(screen.getByRole('group', { name: T.dataType })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.entities.customers })).toHaveAttribute('aria-pressed', 'true');
  });

  it('le bailleur exporte ses paiements, baux et biens sans capacité', () => {
    tenant([]);
    render(withIntl(avecClient(<ExportForm staff={false} />)));

    expect(screen.getByRole('button', { name: fr.rapports.exports.telechargerLExport })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: T.entities.payments })).toHaveAttribute('aria-pressed', 'true');
    // TCK-2629 (AC2) — trois types, et trois seulement.
    expect(within(screen.getByRole('group', { name: T.dataType })).getAllByRole('button')).toHaveLength(3);
  });
});
