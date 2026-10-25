import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { MaintenanceRequest } from '@/types/maintenance';
import { QuoteSubmitForm } from '../QuoteSubmitForm';

const submit = { mutateAsync: vi.fn(), isPending: false, isError: false, error: null };

vi.mock('@/lib/queries/maintenance', () => ({
  useSubmitMaintenanceQuote: () => submit,
}));

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ id, value, onValueChange }: { id: string; value: string; onValueChange: (v: string) => void }) => (
    <input data-testid={id} value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));

const request = { id: 7, status: 'quote_requested' } as MaintenanceRequest;
const MO = 1024 * 1024;

function piece(nom: string, octets: number): File {
  const fichier = new File(['x'], nom, { type: 'application/pdf' });
  Object.defineProperty(fichier, 'size', { value: octets });
  return fichier;
}

function choisir(fichiers: File[]) {
  fireEvent.change(screen.getByLabelText('Pièces jointes (PDF ou images)'), { target: { files: fichiers } });
}

/**
 * TCK-2330 (P222.05) — cinq pièces de 5 Mo, chacune admise (`max:5120`, TCK-1907), font
 * 26 214 400 o : la borne même du proxy, que les lignes du devis franchissent (413 sans corps).
 * La somme se juge au choix, sous la borne moins une marge (24 Mo).
 */
describe('<QuoteSubmitForm> — somme des pièces bornée', () => {
  beforeEach(() => submit.mutateAsync.mockReset());

  it('cinq pièces de 5 Mo sont refusées ensemble, et dites', () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    choisir(Array.from({ length: 5 }, (_, i) => piece(`scan-${i}.pdf`, 5 * MO)));

    expect(screen.getByRole('alert')).toHaveTextContent('Ces pièces dépassent 24 Mo à elles toutes');
    expect(screen.queryByText('scan-0.pdf')).not.toBeInTheDocument();
  });

  it('une sélection qui ferait passer la somme au-delà est refusée, les pièces déjà choisies restent', () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    choisir([piece('a.pdf', 5 * MO), piece('b.pdf', 5 * MO), piece('c.pdf', 5 * MO), piece('d.pdf', 5 * MO)]);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    choisir([piece('e.pdf', 5 * MO)]);

    expect(screen.getByRole('alert')).toHaveTextContent('24 Mo');
    expect(screen.getByText('d.pdf')).toBeInTheDocument();
    expect(screen.queryByText('e.pdf')).not.toBeInTheDocument();
  });
});
