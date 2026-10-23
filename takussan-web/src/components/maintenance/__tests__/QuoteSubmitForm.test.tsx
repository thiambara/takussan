import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { MaintenanceRequest } from '@/types/maintenance';
import { QUOTE_ATTACHMENT_ACCEPT, QuoteSubmitForm } from '../QuoteSubmitForm';

const submit = { mutateAsync: vi.fn(), isPending: false, isError: false, error: null };

vi.mock('@/lib/queries/maintenance', () => ({
  useSubmitMaintenanceQuote: () => submit,
}));

// Le calendrier réel ne se pilote pas au clavier dans jsdom : un champ simple tient sa place.
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ id, value, onValueChange }: { id: string; value: string; onValueChange: (v: string) => void }) => (
    <input data-testid={id} value={value} onChange={(e) => onValueChange(e.target.value)} />
  ),
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

/**
 * TCK-1907 (P195.07) — `SubmitQuoteRequest` refuse toute pièce de plus de 5 Mo (`max:5120`). Le
 * formulaire l'écarte au choix, nommée avec le plafond, au lieu que le 422 n'arrive qu'après la
 * saisie des lignes. Aucune réduction : une pièce justificative part telle quelle (TCK-542).
 */
describe('<QuoteSubmitForm> — 5 Mo par pièce au plus', () => {
  beforeEach(() => submit.mutateAsync.mockReset());
  const lourde = (nom: string, type: string, octets: number) => new File([new Uint8Array(octets)], nom, { type });

  it('une pièce de 6 Mo est écartée et nommée avec le plafond, les autres restent', () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    const grosse = lourde('scan.pdf', 'application/pdf', 6 * 1024 * 1024);
    const photo = lourde('photo.jpg', 'image/jpeg', 6 * 1024 * 1024);
    const petite = lourde('devis.pdf', 'application/pdf', 1024);

    fireEvent.change(screen.getByLabelText('Pièces jointes (PDF ou images)'), {
      target: { files: [grosse, photo, petite] },
    });

    const alerte = screen.getByRole('alert');
    expect(alerte).toHaveTextContent('scan.pdf, photo.jpg');
    expect(alerte).toHaveTextContent('5 Mo');
    expect(screen.queryByText('scan.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('photo.jpg')).not.toBeInTheDocument();
    expect(screen.getByText('devis.pdf')).toBeInTheDocument();
  });

  it("la pièce écartée n'entre pas dans l'envoi", async () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    const petite = lourde('devis.pdf', 'application/pdf', 1024);
    fireEvent.change(screen.getByLabelText('Pièces jointes (PDF ou images)'), {
      target: { files: [lourde('scan.pdf', 'application/pdf', 6 * 1024 * 1024), petite] },
    });
    fireEvent.change(screen.getByLabelText('Désignation'), { target: { value: 'Joint' } });
    fireEvent.change(screen.getByLabelText('Prix unitaire'), { target: { value: '7500' } });
    fireEvent.change(screen.getByTestId('quote-valid-until'), { target: { value: '2026-12-31' } });

    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le devis' }));

    await waitFor(() => expect(submit.mutateAsync).toHaveBeenCalledTimes(1));
    expect(submit.mutateAsync.mock.calls[0][0].attachments).toEqual([petite]);
  });

  it('une pièce de 5 Mo exactement est gardée', () => {
    render(withIntl(<QuoteSubmitForm request={request} />));
    fireEvent.change(screen.getByLabelText('Pièces jointes (PDF ou images)'), {
      target: { files: [lourde('pile.pdf', 'application/pdf', 5 * 1024 * 1024)] },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('pile.pdf')).toBeInTheDocument();
  });
});
