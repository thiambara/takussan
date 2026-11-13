/**
 * TCK-2729 (décision 5a du porteur) — le bailleur bloqué ne partage plus (`abilities.share` faux), mais l'API lui
 * sert `abilities.manage_own_share_links` sur la fiche : il voit les liens qu'il a créés (l'API ne lui rend que
 * ceux-là) et les révoque, sans jamais se voir offrir « Partager » — ni dans l'en-tête du bureau, ni dans la
 * barre collante, ni dans la feuille du bas.
 *
 * Trois cas : qui partage (la liste et « Partager ») ; le bailleur bloqué (« Vos liens », « Révoquer », pas de
 * « Partager ») ; ni l'un ni l'autre (aucune liste, et les liens ne sont pas lus).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { DocumentAbilities, DocumentShareLink, DocumentWithVersions } from '@/types/document';

const { etat, revoquer } = vi.hoisted(() => ({
  etat: { document: null as unknown as DocumentWithVersions, lectures: [] as unknown[], liens: [] as unknown[] },
  revoquer: vi.fn(),
}));

vi.mock('@/lib/queries/documents', () => ({
  useDocumentWithVersions: () => ({ data: { data: etat.document }, isLoading: false, isError: false, refetch: () => undefined }),
  useShareLinks: (...args: unknown[]) => {
    etat.lectures.push(args);
    return { data: { data: etat.liens }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() };
  },
  useCreateShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeShareLink: () => ({ mutateAsync: revoquer, isPending: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 11 } }) }));
vi.mock('@/components/documents/fiche/VersionsDuDocument', () => ({ VersionsDuDocument: () => null }));

import { DocumentDetailClient } from '../DocumentDetailClient';

const piece = (abilities: DocumentAbilities): DocumentWithVersions => ({
  id: 7,
  documentable_id: 3,
  documentable_type: 'App\\Models\\Property',
  uploaded_by: 11,
  name: 'Titre foncier',
  type: null,
  description: null,
  is_verified: false,
  verified_by: null,
  verified_at: null,
  expiry_date: null,
  file_url: 'https://media.test/signe/titre.pdf',
  file_name: 'titre.pdf',
  file_size: 1024,
  mime_type: 'application/pdf',
  created_at: '2026-06-28T10:00:00Z',
  active_version: null,
  versions: [],
  abilities,
});

const sonLien = {
  id: 31,
  document_id: 7,
  token: 'jeton-du-bailleur',
  expires_at: null,
  max_downloads: null,
  downloads_count: 2,
  has_password: false,
  created_at: '2026-10-02T09:00:00Z',
  created_by_person: { name: null, role: null },
} as unknown as DocumentShareLink;

const BLOQUE: DocumentAbilities = { update: false, share: false, delete: false, manage_own_share_links: true };

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
  etat.lectures = [];
  etat.liens = [sonLien];
  revoquer.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
});

describe('TCK-2729 (5a) — les liens du bailleur bloqué sur la fiche', () => {
  it('qui partage voit la liste et « Partager »', () => {
    etat.document = piece({ update: true, share: true, delete: false });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(etat.lectures[0]).toEqual([7]);
    expect(screen.getByRole('heading', { name: 'Liens de partage (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partager' })).toBeInTheDocument();
  });

  it('le bailleur bloqué voit SES liens et les révoque, sans « Partager » nulle part (téléphone)', async () => {
    etat.document = piece(BLOQUE);
    render(withIntl(<DocumentDetailClient documentId={7} />));

    expect(etat.lectures[0]).toEqual([7]);
    const section = screen.getByRole('region', { name: 'Vos liens de partage (1)' });
    expect(within(section).getAllByTestId('lien-actif')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
    // La barre collante ne garde que « Télécharger ».
    const barre = document.querySelector('[data-slot="barre-d-action"]');
    expect(barre).not.toBeNull();
    expect(within(barre as HTMLElement).queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();

    fireEvent.click(within(section).getByRole('button', { name: /Révoquer le lien créé le/ }));
    await waitFor(() => expect(revoquer).toHaveBeenCalledWith({ document_id: 7, link_id: 31 }));
    await waitFor(() => expect(within(section).queryByTestId('lien-actif')).not.toBeInTheDocument());
    expect(within(section).getByText('Aucun lien créé par vous n’est actif.')).toBeInTheDocument();
  });

  it('au bureau non plus, le bailleur bloqué ne se voit pas offrir « Partager »', () => {
    auBureau();
    etat.document = piece(BLOQUE);
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(screen.getByRole('heading', { name: 'Vos liens de partage (1)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
  });

  it('sans l’un ni l’autre, aucune liste, et les liens ne sont pas lus', () => {
    etat.document = piece({ update: false, share: false, delete: false, manage_own_share_links: false });
    render(withIntl(<DocumentDetailClient documentId={7} />));
    expect(etat.lectures).toHaveLength(0);
    expect(screen.queryByRole('heading', { name: /liens de partage/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partager' })).not.toBeInTheDocument();
  });
});
