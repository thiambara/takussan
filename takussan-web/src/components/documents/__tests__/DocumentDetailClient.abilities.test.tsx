/**
 * TCK-1867 (P189.01) — la fiche d'un document ouvre la gestion des versions (« Nouvelle version »,
 * « Restaurer ») sur le verdict que l'API sert (`abilities.update`, `DocumentPolicy::update`), et
 * non plus sur la seule identité du téléverseur : le bailleur suspendu dans l'agence du porteur
 * reste téléverseur, et l'API lui refuse ces gestes.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { DocumentAbilities } from '@/types/document';

const { etat } = vi.hoisted(() => ({
  etat: { abilities: undefined as DocumentAbilities | undefined },
}));

vi.mock('@/lib/queries/documents', () => ({
  useDocumentWithVersions: () => ({
    data: {
      data: {
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
        file_url: null,
        file_name: null,
        file_size: null,
        mime_type: null,
        created_at: null,
        active_version: null,
        versions: [],
        abilities: etat.abilities,
      },
    },
    isLoading: false,
    isError: false,
    refetch: () => undefined,
  }),
}));

vi.mock('@/components/documents/DocumentVersionsList', () => ({
  DocumentVersionsList: ({ canManage }: { canManage?: boolean }) => (
    <p>{canManage ? 'gestion ouverte' : 'gestion fermée'}</p>
  ),
}));

import { DocumentDetailClient } from '../DocumentDetailClient';

describe('<DocumentDetailClient> — gestion des versions par `abilities.update`', () => {
  beforeEach(() => {
    etat.abilities = undefined;
  });

  it('le téléverseur que l’API refuse ne voit pas la gestion des versions', () => {
    etat.abilities = { update: false, share: false, delete: false };
    render(withIntl(<DocumentDetailClient documentId={7} />));

    expect(screen.getByText('gestion fermée')).toBeInTheDocument();
  });

  it('sans `abilities`, aucune gestion', () => {
    render(withIntl(<DocumentDetailClient documentId={7} />));

    expect(screen.getByText('gestion fermée')).toBeInTheDocument();
  });

  it('la gestion s’ouvre quand l’API l’accorde', () => {
    etat.abilities = { update: true, share: true, delete: true };
    render(withIntl(<DocumentDetailClient documentId={7} />));

    expect(screen.getByText('gestion ouverte')).toBeInTheDocument();
  });
});
