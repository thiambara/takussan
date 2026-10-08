import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { useCan } from '@/hooks/useCan';
import { withIntl } from '@/test/intl';
import { ExportForm } from '../ExportForm';

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
    render(withIntl(<ExportForm staff />));

    expect(screen.getByTestId('exports-none')).toHaveTextContent(T.noneAllowed);
    expect(screen.queryByRole('button', { name: T.download })).not.toBeInTheDocument();
  });

  it('le personnel qui tient crm.export seul se voit offrir les clients, d’emblée', () => {
    tenant(['crm.export']);
    render(withIntl(<ExportForm staff />));

    expect(screen.getByRole('button', { name: T.download })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: T.dataType })).toHaveTextContent(T.entities.customers);
  });

  it('le bailleur exporte ses paiements, baux et biens sans capacité', () => {
    tenant([]);
    render(withIntl(<ExportForm staff={false} />));

    expect(screen.getByRole('button', { name: T.download })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: T.dataType })).toHaveTextContent(T.entities.payments);
  });
});
