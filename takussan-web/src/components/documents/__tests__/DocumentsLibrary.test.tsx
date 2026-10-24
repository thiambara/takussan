import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { DocumentsLibrary } from '../DocumentsLibrary';
// TCK-1041 — chargé par `next/dynamic` dans la bibliothèque : importé ici, son module est déjà
// transformé quand le test ouvre le dialogue, qui arrive au tick suivant.
import '../DocumentUploadDialog';
import fr from '@/messages/fr.json';
import type { Document, DocumentType } from '@/types/document';
import type { User } from '@/lib/auth';

const routerReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(''),
}));

const authState = {
  user: null as User | null,
};

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user,
    token: 'token',
    isLoading: false,
  }),
}));

const mutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
};

const documentsQuery = {
  data: {
    data: [] as Document[],
    meta: {
      total: 0,
      current_page: 1,
      last_page: 1,
      per_page: 30,
      counts: undefined as Partial<Record<DocumentType, number>> | undefined,
    },
    links: { first: null, last: null, prev: null, next: null },
  },
  isLoading: false,
  isError: false,
  error: null,
};

vi.mock('@/lib/queries/documents', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/documents')>(
    '@/lib/queries/documents',
  );
  return {
    ...actual,
    useDocuments: () => documentsQuery,
    useDeleteDocument: () => mutation,
    useUploadDocument: () => mutation,
    useCreateShareLink: () => mutation,
    useRevokeShareLink: () => mutation,
  };
});

function wrap(ui: React.ReactElement) {
  return (
    // Dictionnaire RÉEL depuis TCK-246 : l'état vide générique passe désormais par
    // `documents.library.*`, et un jeu de messages stub laisserait passer un chemin de clé faux.
    <NextIntlClientProvider locale="fr" messages={fr} timeZone="Africa/Dakar">
      {ui}
    </NextIntlClientProvider>
  );
}

function ownerUser(): User {
  return {
    id: 1,
    first_name: 'Aminata',
    last_name: 'Diop',
    full_name: 'Aminata Diop',
    email: 'owner@example.test',
    phone: null,
    bio: null,
    avatar_url: null,
    email_verified_at: null,
    phone_verified_at: null,
    two_factor_enabled: false,
    roles: ['owner'],
    status: 'active',
    created_at: '2026-05-06T00:00:00.000Z',
  };
}

describe('<DocumentsLibrary>', () => {
  beforeEach(() => {
    authState.user = ownerUser();
    documentsQuery.data.data = [];
    documentsQuery.data.meta.total = 0;
    documentsQuery.data.meta.counts = undefined;
    documentsQuery.isLoading = false;
    documentsQuery.isError = false;
    routerReplace.mockClear();
    mutation.mutate.mockClear();
    mutation.mutateAsync.mockClear();
  });

  it('renders an owner-specific empty state without fake documents', () => {
    render(wrap(<DocumentsLibrary />));

    expect(screen.getByText('Aucun document propriétaire')).toBeInTheDocument();
    expect(screen.getAllByText(/titre foncier/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/bail signé/i)).toBeInTheDocument();
    expect(screen.getAllByText(/quittance/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/devis ou facture/i)).toBeInTheDocument();
    expect(screen.getAllByText(/pièce propriétaire/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Bien')).toBeInTheDocument();
    expect(screen.getByText('Bail')).toBeInTheDocument();
    expect(screen.getByText('Utilisateur')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /document/i })).not.toBeInTheDocument();
  });

  it('opens the existing upload flow from the owner empty-state CTA', async () => {
    const user = userEvent.setup();
    render(wrap(<DocumentsLibrary />));

    await user.click(screen.getAllByRole('button', { name: /Téléverser un document/i })[1]);

    // TCK-1041 — le dialogue est chargé par `next/dynamic` à sa première ouverture : il arrive après.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Téléverser un document' })).toBeInTheDocument();
    expect(screen.getByText(/Associez le fichier à une entité/i)).toBeInTheDocument();
  });

  it('keeps the generic empty state for non-owner users', () => {
    authState.user = { ...ownerUser(), roles: ['tenant'] };

    render(wrap(<DocumentsLibrary />));

    expect(screen.queryByText('Aucun document propriétaire')).not.toBeInTheDocument();
    // Depuis TCK-246, l'état vide générique est le composant partagé : le message unique est
    // devenu un titre de section + une description, tous deux traduits.
    expect(
      screen.getByRole('heading', { level: 2, name: fr.documents.library.empty_title }),
    ).toBeInTheDocument();
    expect(screen.getByText(fr.documents.library.empty_description)).toBeInTheDocument();
  });
});

/**
 * TCK-1272 (P134.02) — les pièces `rib` et `ninea`, que l'enum de l'API émet et que l'accueil du
 * bailleur crée, ont leur titre de groupe, et se rangent à leur place : `indexOf` rendait -1, qui
 * plaçait leur groupe AVANT « Contrat de bail ».
 */
describe('<DocumentsLibrary> — pièces RIB et NINEA (TCK-1272, P134.02)', () => {
  function doc(id: number, type: Document['type'], name: string): Document {
    return {
      id,
      documentable_id: 1,
      documentable_type: 'user',
      uploaded_by: 1,
      name,
      type,
      description: null,
      is_verified: false,
      verified_by: null,
      verified_at: null,
      expiry_date: null,
      file_url: null,
      file_name: `${name}.pdf`,
      file_size: 1000,
      mime_type: 'application/pdf',
      created_at: '2026-10-01T10:00:00+00:00',
    };
  }

  beforeEach(() => {
    authState.user = ownerUser();
    documentsQuery.data.meta.counts = undefined;
    documentsQuery.data.meta.last_page = 1;
  });

  /**
   * P199.03 (TCK-2165) — le badge d'un groupe comptait les documents de SA page de 30 : il lit
   * désormais le compte par type de toute la liste filtrée, rendu par l'API (`meta.counts`).
   */
  it('affiche au badge du groupe le compte du type sur toute la liste, pas sur la page', () => {
    documentsQuery.data.data = [doc(1, 'lease_contract', 'bail-1'), doc(2, 'lease_contract', 'bail-2')];
    documentsQuery.data.meta.total = 35;
    documentsQuery.data.meta.last_page = 2;
    documentsQuery.data.meta.counts = { lease_contract: 20, receipt: 15 };
    render(wrap(<DocumentsLibrary />));

    const entete = screen.getByRole('heading', { level: 2, name: fr.documents.types.lease_contract })
      .parentElement;
    expect(entete?.textContent).toContain('20');
  });

  it('nomme le groupe RIB et le range après « Contrat de bail »', () => {
    documentsQuery.data.data = [doc(1, 'rib', 'mon-rib'), doc(2, 'lease_contract', 'mon-bail')];
    documentsQuery.data.meta.total = 2;
    render(wrap(<DocumentsLibrary />));

    const titres = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titres).toContain(fr.owners.onboarding.kyc.labels.rib);
    expect(titres.indexOf(fr.documents.types.lease_contract)).toBeLessThan(
      titres.indexOf(fr.owners.onboarding.kyc.labels.rib),
    );
  });

  it('range un type inconnu de l’ordre en dernier', () => {
    documentsQuery.data.data = [
      doc(1, 'inconnu' as Document['type'], 'mystere'),
      doc(2, 'lease_contract', 'mon-bail'),
    ];
    documentsQuery.data.meta.total = 2;
    render(wrap(<DocumentsLibrary />));

    const sections = document.querySelectorAll('section');
    expect(sections[0].textContent).toContain('mon-bail');
  });

  it('l’ordre d’affichage couvre exactement les cas de l’enum de l’API', async () => {
    const { DOCUMENT_TYPE_ORDER } = await import('../constants');
    const source = readFileSync(
      resolve(__dirname, '../../../../../takussan-api/app/Models/Enums/DocumentType.php'),
      'utf8',
    );
    const api = [...source.matchAll(/case\s+\w+\s*=\s*'([^']+)'/g)].map((m) => m[1]);
    expect([...DOCUMENT_TYPE_ORDER].sort()).toEqual(api.sort());
  });

  it('le téléversement de la bibliothèque n’offre pas les pièces du bailleur', async () => {
    const { DOCUMENT_TYPE_UPLOAD_ORDER } = await import('../constants');
    expect(DOCUMENT_TYPE_UPLOAD_ORDER).not.toContain('rib');
    expect(DOCUMENT_TYPE_UPLOAD_ORDER).not.toContain('ninea');
    expect(DOCUMENT_TYPE_UPLOAD_ORDER).toContain('lease_contract');
  });
});

/**
 * TCK-1867 (P189.01) — « Partager » et « Supprimer » suivent les verdicts que l'API sert sur chaque
 * ligne (`abilities.share`, `abilities.delete`, `DocumentPolicy`) : le téléverseur suspendu comme
 * bailleur dans l'agence du porteur ne se voit plus offrir des gestes refusés en 403.
 */
describe('<DocumentsLibrary> — gestes d’une ligne par `abilities` (TCK-1867, P189.01)', () => {
  function doc(abilities: Document['abilities']): Document {
    return {
      id: 1,
      documentable_id: 1,
      documentable_type: 'property',
      uploaded_by: 1,
      name: 'titre-foncier',
      type: 'lease_contract',
      description: null,
      is_verified: false,
      verified_by: null,
      verified_at: null,
      expiry_date: null,
      file_url: null,
      file_name: 'titre-foncier.pdf',
      file_size: 1000,
      mime_type: 'application/pdf',
      created_at: '2026-10-01T10:00:00+00:00',
      abilities,
    };
  }

  beforeEach(() => {
    authState.user = ownerUser();
    documentsQuery.data.meta.total = 1;
  });

  it('ni « Partager » ni « Supprimer » quand l’API les refuse', () => {
    documentsQuery.data.data = [doc({ update: false, share: false, delete: false })];
    render(wrap(<DocumentsLibrary />));

    expect(screen.getByText('titre-foncier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: fr.documents.library.share })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: fr.documents.library.delete_aria }),
    ).not.toBeInTheDocument();
  });

  it('sans `abilities`, aucun des deux', () => {
    documentsQuery.data.data = [doc(undefined)];
    render(wrap(<DocumentsLibrary />));

    expect(screen.queryByRole('button', { name: fr.documents.library.share })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: fr.documents.library.delete_aria }),
    ).not.toBeInTheDocument();
  });

  it('chaque geste suit son propre verdict', () => {
    documentsQuery.data.data = [doc({ update: false, share: true, delete: false })];
    render(wrap(<DocumentsLibrary />));

    expect(screen.getByRole('button', { name: fr.documents.library.share })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: fr.documents.library.delete_aria }),
    ).not.toBeInTheDocument();
  });
});
