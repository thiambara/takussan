/**
 * TCK-2656, décision 2 (c) — la bibliothèque en mode `recherche`, ouverte depuis le coffre : la recherche
 * serveur des documents, sans ajout, sans dépôt par glisser ni mode d'emploi du bailleur ; un résultat vide
 * se dit comme tel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { Document } from '@/types/document';

const etat = { recherche: '' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(etat.recherche ? `vue=recherche&search=${etat.recherche}` : 'vue=recherche'),
}));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => false, useAgenceDuPersonnelActif: () => null }));
// Un bailleur : sans le mode `recherche`, la liste vide rendrait son mode d'emploi et l'ajout.
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 1, roles: ['owner'] }, token: 't', isLoading: false }) }));

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
const lignes: { data: Document[] } = { data: [] };
const appels: unknown[] = [];

vi.mock('@/lib/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/documents')>('@/lib/queries/documents');
  return {
    ...actual,
    useDocuments: (params: unknown) => {
      appels.push(params);
      return {
        data: { data: lignes.data, meta: { total: lignes.data.length, current_page: 1, last_page: 1, per_page: 30 } },
        isLoading: false,
        isError: false,
        error: null,
      };
    },
    useDeleteDocument: () => mutation,
    useUploadDocument: () => mutation,
    useCreateShareLink: () => mutation,
    useRevokeShareLink: () => mutation,
    useSetDocumentVisibility: () => ({ ...mutation, error: null }),
  };
});

import { DocumentsLibrary } from '../DocumentsLibrary';

beforeEach(() => {
  etat.recherche = '';
  lignes.data = [];
  appels.length = 0;
});

describe('TCK-2656 — la bibliothèque en mode recherche', () => {
  it('cherche par le serveur (`search` de l’URL), sans « Ajouter » ni mode d’emploi', () => {
    etat.recherche = 'assurance';
    render(withIntl(<DocumentsLibrary recherche />));
    expect(appels.at(-1)).toMatchObject({ search: 'assurance' });
    expect(screen.getByText('Aucun de vos documents ne correspond à cette recherche.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter|Téléverser|Importer/ })).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('sans requête et sans document : « aucun document ajouté », pas d’invitation à déposer', () => {
    render(withIntl(<DocumentsLibrary recherche />));
    expect(screen.getByText('Vous n’avez encore ajouté aucun document.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter|Téléverser|Importer/ })).not.toBeInTheDocument();
  });

  it('hors mode recherche, la bibliothèque garde son ajout', () => {
    render(withIntl(<DocumentsLibrary />));
    expect(screen.getAllByRole('button', { name: /Ajouter|Téléverser|Importer/ }).length).toBeGreaterThan(0);
  });
});
