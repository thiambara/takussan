/**
 * TCK-2656 (lot 1) — la fiche d'une pièce garde les gestes que la ligne de la bibliothèque offrait au
 * locataire et au bailleur : « Télécharger » (son fichier), « Partager » et « Supprimer » confirmé, aux
 * seuls verdicts de l'API.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import type { Document } from '@/types/document';

const supprimer = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/queries/documents', () => ({
  useDeleteDocument: () => ({ mutateAsync: supprimer, isPending: false }),
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('../DocumentShareDialog', () => ({
  DocumentShareDialog: ({ open }: { open: boolean }) => (open ? <p>feuille de partage</p> : null),
}));

import { GestesDuDocument } from '../GestesDuDocument';

const piece = (abilities: Document['abilities'], fichier: string | null = 'https://media.test/signe/cni.pdf'): Document =>
  ({ id: 301, name: 'Carte d’identité', file_url: fichier, abilities }) as Document;

beforeEach(() => {
  supprimer.mockClear();
  push.mockClear();
});

describe('TCK-2656 — les gestes de la fiche d’une pièce', () => {
  it('le lecteur sans droit de gestion télécharge le fichier, et rien d’autre', () => {
    render(withIntl(<GestesDuDocument document={piece({ update: false, share: false, delete: false })} />));
    expect(screen.getByRole('link', { name: 'Télécharger' })).toHaveAttribute('href', 'https://media.test/signe/cni.pdf');
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('l’auteur partage et supprime, après confirmation, puis revient au coffre', async () => {
    render(withIntl(<GestesDuDocument document={piece({ update: true, share: true, delete: true })} />));
    fireEvent.click(screen.getByRole('button', { name: 'Partager' }));
    expect(screen.getByText('feuille de partage')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(supprimer).not.toHaveBeenCalled();
    expect(screen.getByText('Supprimer ce document ?')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Supprimer' }).at(-1)!);
    await waitFor(() => expect(supprimer).toHaveBeenCalledWith({ id: 301 }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/documents'));
  });

  it('sans fichier ni droit, aucune rangée', () => {
    render(withIntl(<GestesDuDocument document={piece({ update: false, share: false, delete: false }, null)} />));
    expect(screen.queryByTestId('gestes-du-document')).not.toBeInTheDocument();
  });
});
