/**
 * TCK-2773 (ADR-0099, amendement du 2026-11-13) — la fiche écrit qui a ajouté, vérifié, versionné ou
 * partagé, TEL QUE L'API LE SERT au lecteur (`*_person`) : le nom au personnel, le rôle traduit sinon
 * (« l’agence », « Takussan »), et rien de plus quand l'API ne nomme pas — la date seule, comme avant.
 * Le front ne déduit jamais un nom d'un identifiant.
 */
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { AuteurServi, DocumentShareLink, DocumentVersion, DocumentWithVersions } from '@/types/document';

const { etat } = vi.hoisted(() => ({
  etat: {
    document: null as unknown as DocumentWithVersions,
    versions: [] as DocumentVersion[],
    liens: [] as DocumentShareLink[],
  },
}));

vi.mock('@/lib/queries/documents', () => ({
  DOCUMENT_MAX_SIZE_BYTES: 10 * 1024 * 1024,
  DOCUMENT_MIME_ACCEPT: 'application/pdf',
  useDocumentWithVersions: () => ({ data: { data: etat.document }, isLoading: false, isError: false, refetch: () => undefined }),
  useDocumentVersions: () => ({ data: { data: etat.versions }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() }),
  useShareLinks: () => ({ data: { data: etat.liens }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() }),
  useCreateShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadDocumentVersion: () => ({ mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }),
  useRestoreDocumentVersion: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 11 } }) }));

import { DocumentDetailClient } from '../DocumentDetailClient';

const nom = (name: string): AuteurServi => ({ name, role: null });
const role = (r: AuteurServi['role']): AuteurServi => ({ name: null, role: r });

const version = (id: number, n: number, jour: string, personne: AuteurServi | null | undefined, actif = false): DocumentVersion => ({
  id,
  version_number: n,
  file_name: `piece-v${n}.pdf`,
  size: 1024,
  mime_type: 'application/pdf',
  uploaded_by_id: 40,
  uploaded_by_person: personne,
  created_at: `2026-06-${jour}T10:00:00Z`,
  comment: null,
  is_active: actif,
  url: null,
});

function fiche(auteurs: { ajoute?: AuteurServi | null; verifie?: AuteurServi | null; actif?: AuteurServi | null }): DocumentWithVersions {
  const active = version(2, 2, '28', auteurs.actif, true);
  return {
    id: 7,
    documentable_id: 3,
    documentable_type: 'App\\Models\\Lease',
    uploaded_by: 40,
    uploaded_by_person: auteurs.ajoute,
    name: 'Avenant signé',
    type: null,
    description: null,
    is_verified: true,
    verified_by: 50,
    verified_by_person: auteurs.verifie,
    verified_at: '2026-06-29T10:00:00Z',
    expiry_date: null,
    file_url: 'https://media.test/signe/avenant.pdf',
    file_name: 'avenant.pdf',
    file_size: 1024,
    mime_type: 'application/pdf',
    created_at: '2026-06-27T10:00:00Z',
    active_version: active,
    versions: [],
    abilities: { update: false, share: true, delete: false },
  };
}

const lienDe = (personne: AuteurServi | null | undefined): DocumentShareLink => ({
  id: 9,
  document_id: 7,
  token: 'jeton',
  expires_at: null,
  max_downloads: null,
  downloads_count: 0,
  has_password: false,
  revoked_at: null,
  created_at: '2026-11-05T09:00:00Z',
  created_by_person: personne,
});

const matchMediaDOrigine = window.matchMedia;
beforeEach(() => {
  window.matchMedia = ((requete: string) => ({
    matches: true,
    media: requete,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
});

function aPropos() {
  return within(screen.getByRole('complementary', { name: /propos/i }));
}

describe('TCK-2773 — les auteurs de la fiche, tels que l’API les sert', () => {
  it('le personnel lit les noms, et « Takussan » pour la vérification', () => {
    etat.document = fiche({ ajoute: nom('Ousmane Niang'), verifie: role('platform'), actif: nom('Ousmane Niang') });
    etat.versions = [version(2, 2, '28', nom('Ousmane Niang'), true), version(1, 1, '27', role('platform'))];
    etat.liens = [lienDe(nom('Sokhna Sene'))];
    render(withIntl(<DocumentDetailClient documentId={7} />));

    expect(aPropos().getByText('Ajouté par').nextSibling).toHaveTextContent('Ousmane Niang, le 27 juin 2026');
    expect(aPropos().getByText('Vérifié par').nextSibling).toHaveTextContent('Takussan, le 29 juin 2026');
    expect(screen.getByText(/ajoutée le 28 juin 2026 par Ousmane Niang/)).toBeInTheDocument();

    const versions = within(screen.getByRole('region', { name: /Versions/ })).getAllByRole('listitem');
    expect(versions[0]).toHaveTextContent('Ousmane Niang · 28 juin 2026');
    expect(versions[1]).toHaveTextContent('Takussan · 27 juin 2026');
    expect(screen.getByTestId('lien-actif')).toHaveTextContent('Créé le 5 nov. par Sokhna Sene');
  });

  it('le locataire lit « l’agence » et « Takussan », jamais un nom', () => {
    etat.document = fiche({ ajoute: role('agency'), verifie: role('platform'), actif: role('agency') });
    etat.versions = [version(2, 2, '28', role('agency'), true)];
    etat.liens = [lienDe(role('agency'))];
    render(withIntl(<DocumentDetailClient documentId={7} />));

    expect(aPropos().getByText('Ajouté par').nextSibling).toHaveTextContent('l’agence, le 27 juin 2026');
    expect(aPropos().getByText('Vérifié par').nextSibling).toHaveTextContent('Takussan, le 29 juin 2026');
    expect(screen.getByText(/ajoutée le 28 juin 2026 par l’agence/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Versions/ })).getByRole('listitem')).toHaveTextContent('L’agence · 28 juin 2026');
    expect(screen.getByTestId('lien-actif')).toHaveTextContent('Créé le 5 nov. par l’agence');
  });

  it('sans auteur servi, la date seule — comme avant TCK-2773', () => {
    etat.document = fiche({ ajoute: null, verifie: undefined, actif: null });
    etat.versions = [version(2, 2, '28', null, true)];
    etat.liens = [lienDe(undefined)];
    render(withIntl(<DocumentDetailClient documentId={7} />));

    expect(aPropos().getByText('Ajouté le').nextSibling).toHaveTextContent('27 juin 2026');
    expect(aPropos().getByText('Vérifié le').nextSibling).toHaveTextContent('29 juin 2026');
    expect(aPropos().queryByText('Ajouté par')).not.toBeInTheDocument();
    expect(screen.getByText(/ajoutée le 28 juin 2026$/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /Versions/ })).getByRole('listitem')).toHaveTextContent(/Version 2.*28 juin 2026/);
    expect(screen.getByTestId('lien-actif')).toHaveTextContent(/^Créé le 5 nov\./);
    expect(screen.getByTestId('lien-actif')).not.toHaveTextContent(' par ');
  });
});
