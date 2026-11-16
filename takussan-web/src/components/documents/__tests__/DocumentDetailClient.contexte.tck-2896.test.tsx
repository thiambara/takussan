/**
 * TCK-2896 (AC6) — la fiche d'un document dit à quoi il est rattaché (`context`, TCK-2895) :
 * « Rattaché à » (le bail, lien vers sa fiche) et « Bien » en tête des métadonnées ; au bureau, le fil
 * « Documents › Bien › Bail › dossier › nom » ; au téléphone, « ⋯ » porte « Ajouter une version » et
 * « Supprimer ». Sans `context`, la fiche d'avant.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { withIntl } from '@/test/intl';
import type { DocumentWithVersions } from '@/types/document';

const { etat } = vi.hoisted(() => ({ etat: { document: null as unknown as DocumentWithVersions, ajout: [] as boolean[] } }));

vi.mock('@/lib/queries/documents', () => ({
  useDocumentWithVersions: () => ({ data: { data: etat.document }, isLoading: false, isError: false, refetch: () => undefined }),
  useShareLinks: () => ({ data: { data: [] }, isLoading: false, isError: false, isSuccess: true, refetch: vi.fn() }),
  useCreateShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRevokeShareLink: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDocument: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 11 } }) }));
vi.mock('@/components/documents/fiche/VersionsDuDocument', () => ({
  VersionsDuDocument: ({ ajoutOuvert }: { ajoutOuvert?: boolean }) => {
    etat.ajout.push(ajoutOuvert === true);
    return <p>{ajoutOuvert ? 'ajout de version ouvert' : 'versions'}</p>;
  },
}));

import { DocumentDetailClient } from '../DocumentDetailClient';

const carte = (champs: Partial<DocumentWithVersions> = {}): DocumentWithVersions => ({
  id: 7,
  documentable_id: 12,
  documentable_type: 'App\\Models\\Lease',
  uploaded_by: 1,
  name: 'Carte d’identité — Ousmane Niang',
  type: 'id_card',
  description: null,
  is_verified: true,
  verified_by: null,
  verified_at: null,
  expiry_date: null,
  file_url: null,
  file_name: null,
  file_size: null,
  mime_type: null,
  created_at: '2026-06-28T10:00:00Z',
  active_version: null,
  versions: [],
  abilities: { update: true, share: false, delete: true },
  context: {
    property: { id: 5, title: 'Villa 4 chambres', neighborhood: 'Sacré-Cœur 3' },
    lease: { id: 12, reference_number: 'LS-0DPA75TK', tenant_name: 'Ousmane Niang' },
  },
  ...champs,
});

const matchMediaDOrigine = window.matchMedia;
function ecran(bureau: boolean) {
  window.matchMedia = ((requete: string) => ({
    matches: bureau,
    media: requete,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

/** La coque du téléphone, réduite à « ⋯ » et sa feuille (l'en-tête de détail rend les `actions` ainsi). */
function PlusDActions() {
  const { actions } = useDeclarationDEnTete();
  return actions ? (
    <FeuilleDuBas titre="Document" declencheur={<button type="button">Plus d’actions</button>}>
      {actions}
    </FeuilleDuBas>
  ) : null;
}

const rendre = () =>
  render(
    withIntl(
      <FournisseurDEnTete>
        <PlusDActions />
        <DocumentDetailClient documentId={7} />
      </FournisseurDEnTete>,
    ),
  );

beforeEach(() => {
  etat.ajout = [];
  ecran(false);
});
afterEach(() => {
  window.matchMedia = matchMediaDOrigine;
});

describe('TCK-2896 — « Rattaché à », « Bien » et le fil (AC6)', () => {
  it('une pièce de bail : « Rattaché à » mène au bail, « Bien » dit le bien et son quartier', () => {
    etat.document = carte();
    rendre();
    const meta = within(screen.getByRole('complementary', { name: 'À propos du document' }));
    const lien = meta.getByRole('link', { name: 'Bail LS-0DPA75TK' });
    expect(lien).toHaveAttribute('href', '/app/leases/12');
    expect(meta.getByText('Rattaché à')).toBeInTheDocument();
    expect(meta.getByText('Bien')).toBeInTheDocument();
    expect(meta.getByText('Villa 4 chambres, Sacré-Cœur 3')).toBeInTheDocument();
  });

  it('au bureau, le fil porte le bien, le bail et le dossier de l’arbre', () => {
    ecran(true);
    etat.document = carte();
    rendre();
    const fil = screen.getByRole('navigation', { name: "Fil d'Ariane" });
    expect(within(fil).getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/app/documents');
    expect(within(fil).getByRole('link', { name: 'Villa 4 chambres' })).toHaveAttribute('href', '/app/properties/5');
    expect(within(fil).getByRole('link', { name: 'Bail Ousmane Niang' })).toHaveAttribute('href', '/app/leases/12');
    expect(within(fil).getByRole('link', { name: 'Pièces du locataire' })).toHaveAttribute('href', '/app/documents?dossier=lease-12-tenant_pieces');
    expect(within(fil).getByText('Carte d’identité — Ousmane Niang')).toBeInTheDocument();
  });

  it('une pièce du bien : le bien, aucun bail', () => {
    etat.document = carte({ documentable_type: 'App\\Models\\Property', documentable_id: 5, context: { property: { id: 5, title: 'Villa 4 chambres', neighborhood: null }, lease: null } });
    rendre();
    const meta = within(screen.getByRole('complementary', { name: 'À propos du document' }));
    expect(meta.getByRole('link', { name: 'Villa 4 chambres' })).toHaveAttribute('href', '/app/properties/5');
    expect(meta.queryByText(/^Bail /)).not.toBeInTheDocument();
  });

  it('sans `context`, ni « Rattaché à » ni « Bien », et le fil d’avant', () => {
    ecran(true);
    etat.document = carte({ context: null });
    rendre();
    expect(screen.queryByText('Rattaché à')).not.toBeInTheDocument();
    const fil = screen.getByRole('navigation', { name: "Fil d'Ariane" });
    expect(within(fil).getAllByRole('link')).toHaveLength(1);
  });
});

describe('TCK-2896 — « ⋯ » au téléphone (AC6)', () => {
  it('« Plus d’actions » ouvre « Ajouter une version » et « Supprimer »', () => {
    etat.document = carte();
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    const feuille = screen.getByRole('dialog', { name: 'Document' });
    fireEvent.click(within(feuille).getByRole('button', { name: 'Ajouter une version' }));
    expect(screen.getByText('ajout de version ouvert')).toBeInTheDocument();
  });

  it('« Supprimer » de la feuille ouvre la confirmation', async () => {
    etat.document = carte();
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Document' })).getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByRole('dialog', { name: 'Supprimer ce document ?' })).toBeInTheDocument();
  });

  it('sans geste secondaire accordé, pas de « ⋯ »', () => {
    etat.document = carte({ abilities: { update: false, share: false, delete: false } });
    rendre();
    expect(screen.queryByRole('button', { name: 'Plus d’actions' })).not.toBeInTheDocument();
  });
});
