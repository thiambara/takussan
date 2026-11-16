/**
 * TCK-2896 — `/app/documents` pour le personnel d'une agence : l'arbre « bien › bail › dossier »
 * (`GET /api/agency/document-vault`, TCK-2895) au téléphone, trois colonnes au bureau ; puces et
 * recherche jugées par le SERVEUR (`filter[agency]=current` + filtres), jamais sur une liste lue ;
 * « Généré » sans gestes ; partager ouvre le partage de la fiche.
 *
 * Le patron de TCK-2815 : les vraies requêtes (`useApiQuery`), un vrai `QueryClient`, un `fetch`
 * simulé qui lit la requête partie et répond comme l'API.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';
import { createQueryClient } from '@/lib/query-client';
import type { CoffreDeLAgence } from '@/lib/documents/coffre-de-l-agence';
import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';

vi.mock('next/navigation', async () => ({ ...(await import('@/test/navigation-url')).moduleNavigation, usePathname: () => '/app/documents' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 77 }, isLoading: false }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 77 }, isLoading: false }) }));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    isPending: false,
    data: { data: [{ id: 'p1', type: 'agency_admin', status: 'active', agency_id: 3, agency: { id: 3, name: 'Dakar Immo', slug: 'dakar-immo' } }], meta: { active_profile_id: 'p1' } },
  }),
}));
vi.mock('@/hooks/useTelechargementApi', () => ({ useTelechargementApi: () => ({ telecharger: vi.fn(), enCours: false, echec: null }) }));
const ecran = { bureau: false };
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: (requete: string) => (requete.includes('80rem') || requete.includes('48rem') ? ecran.bureau : false) }));

// L'historique du navigateur : la vue écrit `?dossier=`, `?filtre=`, `?q=` par `pushState`/`replaceState`.
const versLaNavigation = (_etat: unknown, _titre: string, url?: string | URL | null) => navigationDeTest.replace(String(url ?? ''));
vi.spyOn(window.history, 'pushState').mockImplementation(versLaNavigation);
vi.spyOn(window.history, 'replaceState').mockImplementation(versLaNavigation);

import { DocumentsDeLAgence } from '../DocumentsDeLAgence';

/* ── L'API ── */

const dossier = (key: string, kind: 'generated' | 'uploaded', type: 'property' | 'lease' | 'agency', id: number, documents: number, alertes: Partial<{ expiring_soon: number; unverified: number; next_expiry_date: string | null }> = {}) => ({
  key,
  kind,
  target: { type, id },
  documents,
  expiring_soon: 0,
  unverified: 0,
  next_expiry_date: null,
  ...alertes,
});

function arbre(tenantPieces: { expiring_soon: number; unverified: number } = { expiring_soon: 1, unverified: 1 }): CoffreDeLAgence {
  return {
    agency: { id: 3 },
    totals: { documents: 100, expiring_soon: 4, unverified: 7, next_expiry_date: '2026-12-25' },
    properties: [
      {
        id: 5,
        title: 'Villa 4 chambres',
        neighborhood: 'Sacré-Cœur 3',
        documents: 16,
        expiring_soon: tenantPieces.expiring_soon,
        unverified: tenantPieces.unverified,
        next_expiry_date: '2026-12-25',
        folders: [dossier('property_pieces', 'uploaded', 'property', 5, 5) as never],
        leases: [
          {
            id: 12,
            reference_number: 'LS-0DPA75TK',
            status: 'active',
            start_date: '2026-07-01',
            tenant: { name: 'Ousmane Niang' },
            documents: 11,
            expiring_soon: tenantPieces.expiring_soon,
            unverified: tenantPieces.unverified,
            next_expiry_date: '2026-12-25',
            folders: [
              dossier('contract', 'generated', 'lease', 12, 1),
              dossier('inventories', 'generated', 'lease', 12, 1),
              dossier('receipts', 'generated', 'lease', 12, 6),
              dossier('tenant_pieces', 'uploaded', 'lease', 12, 3, { ...tenantPieces, next_expiry_date: '2026-12-25' }),
            ] as never,
          },
        ],
      },
      {
        id: 6,
        title: 'Garage Ouest Foire',
        neighborhood: 'Ouest Foire',
        documents: 12,
        expiring_soon: 0,
        unverified: 2,
        next_expiry_date: null,
        folders: [dossier('property_pieces', 'uploaded', 'property', 6, 0) as never],
        leases: [{ id: 13, reference_number: 'LS-2', status: 'active', start_date: '2026-01-01', tenant: { name: 'Mamadou Seck' }, documents: 12, expiring_soon: 0, unverified: 2, next_expiry_date: null, folders: [] }],
      },
      { id: 7, title: 'Terrain nu', neighborhood: null, documents: 0, expiring_soon: 0, unverified: 0, next_expiry_date: null, folders: [], leases: [] },
    ],
    agency_folder: dossier('agency_pieces', 'uploaded', 'agency', 3, 9) as never,
  };
}

const piece = (id: number, champs: Record<string, unknown> = {}) => ({
  id,
  documentable_id: 12,
  documentable_type: 'App\\Models\\Lease',
  lease: { id: 12, reference_number: 'LS-0DPA75TK', status: 'active' },
  uploaded_by: 1,
  name: `Pièce ${id}`,
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
  abilities: { update: true, share: true, delete: true },
  ...champs,
});

const RESEAU = { arbre: arbre(), requetes: [] as URL[], liste: [piece(1)] as unknown[] };

const reponse = (corps: unknown) =>
  ({ ok: true, status: 200, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => corps }) as unknown as Response;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-13T10:00:00Z'));
  ecran.bureau = false;
  navigationDeTest.reinitialiser('');
  RESEAU.arbre = arbre();
  RESEAU.requetes.length = 0;
  RESEAU.liste = [piece(1)];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL) => {
      const url = new URL(String(entree), 'http://api.test');
      RESEAU.requetes.push(url);
      const chemin = url.pathname;
      if (chemin.endsWith('/api/agency/document-vault')) return reponse({ data: RESEAU.arbre });
      if (chemin.endsWith('/api/documents/generated')) {
        return reponse({
          data: [
            { kind: 'generated', category: 'lease_contract', title: 'LS-0DPA75TK', date: '2026-07-01', download_path: '/api/leases/12/contract/pdf' },
            { kind: 'generated', category: 'receipt_rent', title: 'LPY-1', date: '2026-08-05', download_path: '/api/leases/12/receipts/1/pdf' },
          ],
        });
      }
      if (/\/api\/documents\/\d+\/(versions|share-links)$/.test(chemin)) return reponse({ data: [] });
      const fiche = chemin.match(/\/api\/documents\/(\d+)$/);
      if (fiche) return reponse({ data: { ...piece(Number(fiche[1])), active_version: null, versions: [] } });
      if (chemin.endsWith('/api/documents')) {
        const n = RESEAU.liste.length;
        return reponse({ data: RESEAU.liste, meta: { total: n, per_page: 20, current_page: 1, last_page: 1 } });
      }
      return reponse({ data: [] });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const listes = () => RESEAU.requetes.filter((u) => u.pathname.endsWith('/api/documents'));
const derniereListe = () => listes().at(-1);

/** L'en-tête du téléphone, réduit à l'action de page qu'une racine y déclare. */
function EnTete() {
  const { action } = useDeclarationDEnTete();
  return <header data-testid="en-tete">{action}</header>;
}

function rendre() {
  return render(
    withIntl(
      <QueryClientProvider client={createQueryClient()}>
        <FournisseurDEnTete>
          <EnTete />
          <DocumentsDeLAgence />
        </FournisseurDEnTete>
      </QueryClientProvider>,
    ),
  );
}

describe('TCK-2896 — l’arbre de l’agence au téléphone (AC1, AC4)', () => {
  it('AC1 — la carte du bien dépliée porte le bail et ses quatre sous-dossiers comptés, jamais un groupe par type', async () => {
    rendre();
    const bien = await screen.findByTestId('bien-deplie');
    expect(within(bien).getByText('Villa 4 chambres')).toBeInTheDocument();
    expect(within(bien).getByText('Sacré-Cœur 3 · 16 documents')).toBeInTheDocument();
    expect(within(bien).getByText('Pièces du bien')).toBeInTheDocument();
    expect(within(bien).getByText('Bail Ousmane Niang')).toBeInTheDocument();
    expect(within(bien).getByText('LS-0DPA75TK · depuis le 1 juil. 2026')).toBeInTheDocument();
    const dossiers = within(bien).getAllByTestId('dossier-de-l-arbre').map((d) => d.textContent);
    expect(dossiers).toEqual([
      expect.stringContaining('Pièces du bien5'),
      expect.stringContaining('Contrat1'),
      expect.stringContaining('États des lieux1'),
      expect.stringContaining('Quittances6'),
      expect.stringContaining('Pièces du locataire3'),
    ]);
    // Les trois dossiers générés portent « Généré » ; les pièces du locataire, non.
    expect(within(bien).getAllByText('Généré')).toHaveLength(3);
    // Plus de bibliothèque par type : ni « Pièce d’identité » ni « Quittance » en titre de groupe.
    expect(screen.queryByRole('heading', { name: 'Pièce d’identité' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Quittance' })).not.toBeInTheDocument();
    // L'arbre se lit sans liste : aucune requête de liste ne part tant qu'aucune puce ni recherche.
    expect(listes()).toHaveLength(0);
  });

  it('les autres biens repliés se résument, le dossier de l’agence porte son nom, les biens sans document sont comptés', async () => {
    rendre();
    await screen.findByTestId('bien-deplie');
    expect(screen.getByText('Bail Mamadou Seck · 12 documents')).toBeInTheDocument();
    expect(screen.getByText('2 à vérifier')).toBeInTheDocument();
    expect(screen.getByText('Dakar Immo')).toBeInTheDocument();
    expect(screen.getByText('NINEA, registre de commerce, modèles · 9 documents')).toBeInTheDocument();
    expect(screen.getByTestId('biens-sans-document')).toHaveTextContent('1 bien sans document');
    expect(screen.queryByText('Terrain nu')).not.toBeInTheDocument();
  });

  it('AC4 — une expiration et une pièce à vérifier : « 1 expire dans 42 jours · 1 à vérifier »', async () => {
    rendre();
    await screen.findByTestId('bien-deplie');
    expect(screen.getByTestId('alerte-du-dossier')).toHaveTextContent(/^1 expire dans 42 jours · 1 à vérifier$/);
  });

  it('AC4 — deux expirations et deux pièces : « 2 expirent bientôt · 2 à vérifier »', async () => {
    RESEAU.arbre = arbre({ expiring_soon: 2, unverified: 2 });
    rendre();
    await screen.findByTestId('bien-deplie');
    expect(screen.getByTestId('alerte-du-dossier')).toHaveTextContent(/^2 expirent bientôt · 2 à vérifier$/);
  });

  it('à 390, aucune ligne ne déborde : chaque libellé se tronque dans une colonne qui peut rétrécir', async () => {
    rendre();
    const arbreDuTelephone = await screen.findByTestId('arbre-du-telephone');
    const boutons = within(arbreDuTelephone).getAllByRole('button');
    expect(boutons.length).toBeGreaterThan(5);
    for (const bouton of boutons) {
      // La colonne du texte rétrécit (`min-w-0 flex-1`) ; le nom s'y tronque (`truncate`).
      const colonne = bouton.querySelector(':scope > span.min-w-0');
      expect(colonne, bouton.textContent ?? '').not.toBeNull();
      expect(colonne!.querySelector('.truncate'), bouton.textContent ?? '').not.toBeNull();
    }
  });

  it('le dossier touché s’ouvre en liste, bornée par le serveur au bail', async () => {
    rendre();
    await screen.findByTestId('bien-deplie');
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le dossier « Pièces du locataire »' }));
    expect(navigationDeTest.requete()).toBe('dossier=lease-12-tenant_pieces');
    await screen.findByTestId('liste-de-l-agence');
    const q = derniereListe()!.searchParams;
    expect(q.get('filter[agency]')).toBe('current');
    expect(q.get('filter[documentable_type]')).toBe('lease');
    expect(q.get('filter[documentable_id]')).toBe('12');
    expect(screen.getByTestId('fil-du-dossier')).toHaveTextContent('Villa 4 chambres›Bail Ousmane Niang›Pièces du locataire');
  });
});

describe('TCK-2896 — puces et recherche jugées par le serveur (AC2, AC3)', () => {
  it('AC2 — « Non vérifiés » envoie `filter[is_verified]=false` sur la cible agence et rend ce que le serveur sert', async () => {
    RESEAU.liste = [piece(4, { name: 'Attestation à vérifier', is_verified: false })];
    rendre();
    await screen.findByTestId('bien-deplie');
    fireEvent.click(screen.getByRole('button', { name: /^Non vérifiés/ }));
    await screen.findByTestId('liste-de-l-agence');
    const q = derniereListe()!.searchParams;
    expect(q.get('filter[agency]')).toBe('current');
    expect(q.get('filter[is_verified]')).toBe('false');
    expect(within(screen.getByTestId('liste-de-l-agence')).getAllByTestId('ligne-de-l-agence')).toHaveLength(1);
    expect(screen.getByText('Attestation à vérifier')).toBeInTheDocument();
  });

  it('AC2 — « Expire bientôt » envoie `filter[expiring_within_days]=60`', async () => {
    rendre();
    await screen.findByTestId('bien-deplie');
    fireEvent.click(screen.getByRole('button', { name: /^Expire bientôt/ }));
    await waitFor(() => expect(derniereListe()?.searchParams.get('filter[expiring_within_days]')).toBe('60'));
    expect(derniereListe()!.searchParams.get('filter[agency]')).toBe('current');
  });

  it('AC2 — « Générés » envoie `filter[generated]=1`, et un généré n’a ni partage ni fiche', async () => {
    RESEAU.liste = [
      { kind: 'generated', category: 'receipt_rent', title: 'LPY-9', date: '2026-10-05', download_path: '/api/leases/12/receipts/9/pdf', document_id: null, is_verified: null, expiry_date: null, versions_count: null, targets: [], context: { property: null, lease: { id: 12, reference_number: 'LS-0DPA75TK', tenant_name: 'Ousmane Niang' } } },
    ];
    rendre();
    await screen.findByTestId('bien-deplie');
    fireEvent.click(screen.getByRole('button', { name: /^Générés/ }));
    const liste = await screen.findByTestId('liste-de-l-agence');
    expect(derniereListe()!.searchParams.get('filter[generated]')).toBe('1');
    const ligne = within(liste).getByTestId('ligne-de-l-agence');
    expect(within(ligne).getByText('Généré')).toBeInTheDocument();
    expect(within(ligne).queryByRole('button', { name: /^Partager/ })).not.toBeInTheDocument();
    expect(within(ligne).queryByRole('link')).not.toBeInTheDocument();
    expect(within(ligne).getByText(/Ousmane Niang/)).toBeInTheDocument();
  });

  it('AC3 — « Niang » part en `filter[search]=Niang` ; la liste rend ce que le serveur trouve, sans refiltrer', async () => {
    // Le nom de la pièce ne contient pas « Niang » : le serveur la trouve par son locataire (TCK-2895 AC4).
    RESEAU.liste = [piece(8, { name: 'Carte d’identité' })];
    rendre();
    await screen.findByTestId('bien-deplie');
    const champ = screen.getByRole('searchbox', { name: 'Chercher un document, un locataire, un bien' });
    fireEvent.change(champ, { target: { value: 'Niang' } });
    fireEvent.submit(champ.closest('form')!);
    await screen.findByTestId('liste-de-l-agence');
    expect(derniereListe()!.searchParams.get('filter[search]')).toBe('Niang');
    expect(derniereListe()!.searchParams.get('filter[agency]')).toBe('current');
    expect(screen.getByText('Carte d’identité')).toBeInTheDocument();
  });
});

describe('TCK-2896 — partager ouvre le partage de la fiche (AC7)', () => {
  it('au téléphone, le bouton de la ligne ouvre la feuille « Partager par lien »', async () => {
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    rendre();
    await screen.findByTestId('bien-deplie');
    fireEvent.click(screen.getByRole('button', { name: /^Non vérifiés/ }));
    await screen.findByTestId('liste-de-l-agence');
    await user.click(screen.getByRole('button', { name: 'Partager « Pièce 1 »' }));
    expect(await screen.findByRole('dialog', { name: 'Partager par lien' })).toBeInTheDocument();
  });

  it('au bureau, « Partager » de l’aperçu ouvre la carte flottante', async () => {
    ecran.bureau = true;
    navigationDeTest.reinitialiser('dossier=lease-12-tenant_pieces');
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    rendre();
    const apercu = await screen.findByTestId('apercu-de-l-agence');
    await act(async () => {
      await user.click(within(apercu).getByRole('button', { name: 'Partager' }));
    });
    expect(await screen.findByText('Partager par lien')).toBeInTheDocument();
    // Ni la feuille du téléphone, ni l'ancien dialogue.
    expect(screen.queryByRole('button', { name: /^Partager « / })).not.toBeInTheDocument();
  });
});

describe('TCK-2896 — trois colonnes au bureau (AC5)', () => {
  it('l’arbre, la liste et l’aperçu côte à côte ; le fil et « Dans le même bail »', async () => {
    ecran.bureau = true;
    navigationDeTest.reinitialiser('dossier=lease-12-tenant_pieces');
    rendre();
    const arbreDuBureau = await screen.findByTestId('arbre-du-bureau');
    await screen.findByTestId('liste-de-l-agence');
    expect(await screen.findByTestId('apercu-de-l-agence')).toBeInTheDocument();
    // Les trois colonnes sont sœurs d'une même rangée.
    const rangee = arbreDuBureau.parentElement!;
    expect(rangee).toHaveClass('flex-row');
    expect(within(rangee).getByRole('complementary', { name: 'Aperçu du document' })).toBeInTheDocument();
    expect(screen.getByTestId('fil-du-dossier')).toHaveTextContent('Villa 4 chambres›Bail Ousmane Niang›Pièces du locataire');
    // L'arbre montre le dossier choisi.
    expect(within(arbreDuBureau).getByRole('button', { name: /Pièces du locataire/, pressed: true })).toBeInTheDocument();
    // Les puces locales du dossier, comptées par l'arbre.
    expect(screen.getByRole('button', { name: /^Tout\s*3$/ })).toBeInTheDocument();
    const memeBail = screen.getByRole('region', { name: 'Dans le même bail' });
    expect(within(memeBail).getByText('Contrat')).toBeInTheDocument();
    expect(within(memeBail).getAllByText('1 · généré')).toHaveLength(2);
    expect(within(memeBail).getByText('6 · générés')).toBeInTheDocument();
    // En-tête : sous-titre compté et recherche dans la tête de page.
    expect(screen.getByText('100 documents · 4 expirent bientôt · 7 à vérifier')).toBeInTheDocument();
  });

  it('un dossier généré se liste depuis sa source, borné à ses catégories', async () => {
    ecran.bureau = true;
    navigationDeTest.reinitialiser('dossier=lease-12-receipts');
    rendre();
    const liste = await screen.findByTestId('liste-de-l-agence');
    expect(RESEAU.requetes.some((u) => u.pathname.endsWith('/api/documents/generated') && u.searchParams.get('target') === 'lease:12')).toBe(true);
    const lignes = within(liste).getAllByTestId('ligne-de-l-agence');
    // Le contrat est rendu par l'API pour le bail, mais il n'est pas une quittance.
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toHaveTextContent('Quittance');
  });
});

describe('TCK-2896 — « Ajouter un document » et la page au-delà de la dernière', () => {
  it('au téléphone, le « + » de l’en-tête ouvre le dépôt', async () => {
    rendre();
    await screen.findByTestId('bien-deplie');
    const plus = within(screen.getByTestId('en-tete')).getByRole('button', { name: 'Ajouter un document' });
    fireEvent.click(plus);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('une page au-delà de la dernière le dit, au lieu d’une agence sans document (TCK-2815)', async () => {
    RESEAU.liste = [];
    const fetchDOrigine = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entree: RequestInfo | URL) => {
        const url = new URL(String(entree), 'http://api.test');
        if (url.pathname.endsWith('/api/documents')) {
          RESEAU.requetes.push(url);
          return reponse({ data: [], meta: { total: 45, per_page: 20, current_page: 9, last_page: 3 } });
        }
        return fetchDOrigine(entree);
      }),
    );
    navigationDeTest.reinitialiser('filtre=nonVerifies&page=9');
    rendre();
    expect(await screen.findByText("Cette page n'existe pas")).toBeInTheDocument();
    expect(screen.queryByTestId('liste-de-l-agence-vide')).not.toBeInTheDocument();
  });
});
