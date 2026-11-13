/**
 * La fiche d'un document ouvre chaque geste sur le verdict que l'API sert (`abilities`, TCK-1867
 * P189.01), et non sur la seule identité du téléverseur : le bailleur suspendu dans l'agence du
 * porteur reste téléverseur, et l'API lui refuse ces gestes.
 *
 * TCK-2656 (lot 3) — la fiche refaite d'après la maquette garde les gestes que la ligne de la
 * bibliothèque offrait (« Télécharger », « Partager », « Supprimer » confirmé, ex-`GestesDuDocument`),
 * ne lit les liens de partage qu'avec `abilities.share`, et ne propose pas « Ajouter une version » sur
 * une pièce de profil, que l'API refuse en 422.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { DocumentAbilities, DocumentWithVersions } from '@/types/document';

const { etat, supprimer, push } = vi.hoisted(() => ({
  etat: { document: null as unknown as DocumentWithVersions, liens: [] as unknown[] },
  supprimer: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/queries/documents', () => ({
  useDocumentWithVersions: () => ({ data: { data: etat.document }, isLoading: false, isError: false, refetch: () => undefined }),
  useShareLinks: (...args: unknown[]) => {
    etat.liens.push(args);
    return { data: { data: [] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() };
  },
  useCreateShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDocument: () => ({ mutateAsync: supprimer, isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 11 } }) }));
vi.mock('@/components/documents/fiche/VersionsDuDocument', () => ({
  VersionsDuDocument: ({ peutAjouter, peutRestaurer, echeanceActuelle }: { peutAjouter: boolean; peutRestaurer: boolean; echeanceActuelle?: string | null }) => (
    <p data-echeance={echeanceActuelle ?? ''}>
      {peutAjouter ? 'ajout ouvert' : 'ajout fermé'} · {peutRestaurer ? 'restauration ouverte' : 'restauration fermée'}
    </p>
  ),
}));

import { DocumentDetailClient } from '../DocumentDetailClient';

const piece = (abilities: DocumentAbilities | undefined, champs: Partial<DocumentWithVersions> = {}): DocumentWithVersions => ({
  id: 7,
  documentable_id: 3,
  documentable_type: 'App\\Models\\Property',
  uploaded_by: 1,
  name: 'Titre foncier',
  type: null,
  description: null,
  is_verified: false,
  verified_by: null,
  verified_at: null,
  expiry_date: null,
  file_url: 'https://media.test/signe/titre.pdf',
  file_name: 'titre.pdf',
  file_size: 2.4 * 1024 * 1024,
  mime_type: 'application/pdf',
  created_at: '2026-06-28T10:00:00Z',
  active_version: null,
  versions: [],
  abilities,
  ...champs,
});

const matchMediaDOrigine = window.matchMedia;
function auBureau() {
  window.matchMedia = ((requete: string) => ({
    matches: true,
    media: requete,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  etat.liens = [];
  supprimer.mockReset().mockResolvedValue(undefined);
  push.mockClear();
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
});

describe('<DocumentDetailClient> — les gestes au verdict de l’API', () => {
  it('le téléverseur que l’API refuse ne voit pas la gestion des versions', () => {
    etat.document = piece({ update: false, share: false, delete: false });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.getByText('ajout fermé · restauration fermée')).toBeInTheDocument();
  });

  it('sans `abilities`, aucune gestion, et les liens ne sont pas lus', () => {
    etat.document = piece(undefined);
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.getByText('ajout fermé · restauration fermée')).toBeInTheDocument();
    expect(etat.liens).toHaveLength(0);
  });

  it('la gestion s’ouvre quand l’API l’accorde, et la nouvelle version reçoit l’échéance actuelle', () => {
    etat.document = piece({ update: true, share: true, delete: true }, { expiry_date: '2026-12-22' });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.getByText('ajout ouvert · restauration ouverte')).toHaveAttribute('data-echeance', '2026-12-22');
  });

  it('une pièce de profil ne propose pas de nouvelle version (422 de l’API), mais se restaure', () => {
    etat.document = piece({ update: true, share: false, delete: false }, { type: 'id_card', documentable_type: 'App\\Models\\OwnerProfile' });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.getByText('ajout fermé · restauration ouverte')).toBeInTheDocument();
  });

  it('le lecteur sans droit de gestion télécharge le fichier, et rien d’autre', () => {
    etat.document = piece({ update: false, share: false, delete: false });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    for (const lien of screen.getAllByRole('link', { name: 'Télécharger' })) {
      expect(lien).toHaveAttribute('href', 'https://media.test/signe/titre.pdf');
    }
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer ce document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Liens de partage/ })).not.toBeInTheDocument();
  });

  it('sans fichier ni droit, ni « Télécharger », ni « Partager », ni barre collante', () => {
    etat.document = piece({ update: false, share: false, delete: false }, { file_url: null, file_name: null, mime_type: null, file_size: null });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.queryByRole('link', { name: 'Télécharger' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="barre-d-action"]')).toBeNull();
    expect(within(screen.getByTestId('apercu-du-document')).getByText('Aucun fichier')).toBeInTheDocument();
  });

  it('l’auteur partage (les liens se lisent), et supprime après confirmation, puis revient aux documents', async () => {
    etat.document = piece({ update: true, share: true, delete: true });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(etat.liens[0]).toEqual([7]);
    expect(screen.getByRole('heading', { name: 'Liens de partage (0)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Partager' }));
    expect(await screen.findByText('Partager par lien')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer ce document' }));
    expect(supprimer).not.toHaveBeenCalled();
    const confirmation = await screen.findByRole('dialog');
    expect(within(confirmation).getByText('Supprimer ce document ?')).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(supprimer).toHaveBeenCalledWith({ id: 7 }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/documents'));
  });

  it('une image s’affiche en aperçu ; un PDF dit son format', () => {
    etat.document = piece({ update: false, share: false, delete: false }, { mime_type: 'image/jpeg', file_name: 'cni.jpg', file_url: 'https://media.test/cni.jpg', name: 'Carte d’identité' });
    const { unmount } = render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.getByRole('img', { name: 'Aperçu de « Carte d’identité »' })).toHaveAttribute('src', 'https://media.test/cni.jpg');
    unmount();

    etat.document = piece({ update: false, share: false, delete: false });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(within(screen.getByTestId('apercu-du-document')).getByText('Fichier PDF')).toBeInTheDocument();
  });

  it('les métadonnées : « vous » pour son propre ajout, la date seule pour celui d’un autre ; format et taille', () => {
    etat.document = piece({ update: false, share: false, delete: false }, { uploaded_by: 11, is_verified: true, verified_by: 40, verified_at: '2026-06-29T10:00:00Z' });
    const { unmount } = render(withIntl(<DocumentDetailClient documentId={7} />));
    const meta = within(screen.getByRole('complementary', { name: 'À propos du document' }));
    expect(meta.getByText('Ajouté par').nextSibling).toHaveTextContent('vous, le 28 juin 2026');
    expect(meta.getByText('Vérifié le').nextSibling).toHaveTextContent('29 juin 2026');
    expect(meta.getByText('Fichier').nextSibling).toHaveTextContent('PDF · 2,4 Mo');
    unmount();

    etat.document = piece({ update: false, share: false, delete: false });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    const autre = within(screen.getByRole('complementary', { name: 'À propos du document' }));
    expect(autre.getByText('Ajouté le').nextSibling).toHaveTextContent('28 juin 2026');
    expect(autre.queryByText('Ajouté par')).not.toBeInTheDocument();
  });

  it('au bureau, « Plus d’actions » ne paraît qu’avec le droit de supprimer', () => {
    auBureau();
    etat.document = piece({ update: true, share: true, delete: false });
    const { unmount } = render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.queryByRole('button', { name: 'Plus d’actions' })).not.toBeInTheDocument();
    unmount();

    etat.document = piece({ update: true, share: true, delete: true });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.getByRole('button', { name: 'Plus d’actions' })).toBeInTheDocument();
  });
});
