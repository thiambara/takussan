import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { MaintenanceRequest } from '@/types/maintenance';
import { QUOTE_ATTACHMENT_ACCEPT, QuoteSubmitForm } from '../QuoteSubmitForm';

const submit = { mutateAsync: vi.fn(), isPending: false, isError: false, error: null };

vi.mock('@/lib/queries/maintenance', () => ({
  useSubmitMaintenanceQuote: () => submit,
}));

const request = { id: 7, status: 'quote_requested' } as MaintenanceRequest;

/**
 * TCK-592 (E, G) — le sélecteur des pièces du devis n'offre que ce que l'API accepte
 * (`mimes:pdf,jpg,jpeg,png,webp`). Un fichier d'un autre type est nommé et écarté ; les autres
 * restent choisis.
 */
describe('<QuoteSubmitForm>', () => {
  beforeEach(() => submit.mutateAsync.mockReset());

  it("n'offre que les PDF et les images acceptés", () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    expect(screen.getByLabelText('Pièces jointes (PDF ou images)')).toHaveAttribute('accept', QUOTE_ATTACHMENT_ACCEPT);
    expect(QUOTE_ATTACHMENT_ACCEPT).not.toMatch(/html|svg|\*/);
  });

  it('écarte et nomme un fichier refusé, garde les autres', () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    const pdf = new File(['%PDF'], 'devis.pdf', { type: 'application/pdf' });
    const html = new File(['<p>'], 'devis.html', { type: 'text/html' });

    fireEvent.change(screen.getByLabelText('Pièces jointes (PDF ou images)'), { target: { files: [pdf, html] } });

    expect(screen.getByRole('alert')).toHaveTextContent('devis.html');
    expect(screen.getByText('devis.pdf')).toBeInTheDocument();
  });

  it("n'envoie ni montant ni devise : des lignes et une validité", () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    fireEvent.change(screen.getByLabelText('Désignation'), { target: { value: 'Joint' } });
    fireEvent.change(screen.getByLabelText('Prix unitaire'), { target: { value: '7500' } });

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le devis' }));

    // Sans date de validité, rien ne part.
    expect(submit.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

/**
 * TCK-1889 (P195.02) — au-delà de cinq pièces (`max:5` de `SubmitQuoteRequest`), la sélection est
 * refusée entière avec le message de `MediaDropzone`, au lieu que la sixième disparaisse en
 * silence.
 */
describe('<QuoteSubmitForm> — cinq pièces au plus', () => {
  const piece = (i: number) => new File(['%PDF'], `piece-${i}.pdf`, { type: 'application/pdf' });

  it('six pièces choisies : message visible, et aucune ajoutée', () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    fireEvent.change(screen.getByLabelText('Pièces jointes (PDF ou images)'), {
      target: { files: [1, 2, 3, 4, 5, 6].map(piece) },
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Maximum 5 fichiers.');
    expect(screen.queryByText('piece-1.pdf')).not.toBeInTheDocument();
  });

  it('deux pièces après quatre : la sélection est refusée, les quatre restent', () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    const champ = screen.getByLabelText('Pièces jointes (PDF ou images)');
    fireEvent.change(champ, { target: { files: [1, 2, 3, 4].map(piece) } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.change(champ, { target: { files: [5, 6].map(piece) } });

    expect(screen.getByRole('alert')).toHaveTextContent('Maximum 5 fichiers.');
    expect(screen.getByText('piece-4.pdf')).toBeInTheDocument();
    expect(screen.queryByText('piece-5.pdf')).not.toBeInTheDocument();
  });
});
