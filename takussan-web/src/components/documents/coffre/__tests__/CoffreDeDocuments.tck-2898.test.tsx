/**
 * TCK-2898 — le coffre :
 *
 * - AC5 : chez un bailleur, le dossier du bien rend la ligne de sous-dossier « Bail de <locataire> », qui
 *   s'ouvre sur le contrat ; un bien sans document est listé avec « Aucun document » ;
 * - AC7 : chez un prestataire, la puce « Devis et rapports » porte le compte servi et filtre sur ce
 *   dossier ; « Télécharger » d'une facture appelle `GET /api/service-provider-bills/{id}/pdf` ;
 * - AC8 : chaque ligne, générée ou téléversée, porte « Télécharger » en fin de ligne, distinct de
 *   l'ouverture de la fiche ; une pièce s'ouvre par le fichier de sa fiche (`file_url`, URL signée), dans
 *   un onglet ouvert au clic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';

import type { CoffreDeDocuments as Coffre, DossierDuCoffre, EntreeDuCoffre } from '@/lib/documents/coffre';

const telecharger = vi.fn().mockResolvedValue(true);
vi.mock('@/hooks/useTelechargementApi', () => ({
  useTelechargementApi: () => ({ telecharger, enCours: false, echec: null }),
}));

const lireLaFiche = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, apiRequest: (chemin: string) => lireLaFiche(chemin) };
});

const ecran = { bureau: false };
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.bureau }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/app/documents',
}));

const reponse: { data: { data: Coffre } | undefined } = { data: undefined };
vi.mock('@/lib/queries/coffre', () => ({
  useArchivesPreparees: () => ({ data: undefined }),
  useDemanderLArchive: () => ({ isPending: false, isError: false, mutate: () => undefined }),
  useCoffreDeDocuments: () => ({ isPending: false, isError: false, data: reponse.data, refetch: vi.fn() }),
  useRechercheDansLeCoffre: () => ({ isPending: true }),
}));

import { CoffreDeDocuments } from '../CoffreDeDocuments';

const genere = (category: string, date: string, chemin: string, title: string | null = null): EntreeDuCoffre => ({
  kind: 'generated',
  category,
  title,
  date,
  download_path: chemin,
  targets: [],
  document_id: null,
  is_verified: null,
  expiry_date: null,
  versions_count: null,
});

const piece = (id: number, title: string, category = 'other'): EntreeDuCoffre => ({
  kind: 'uploaded',
  category,
  title,
  date: '2026-01-10',
  download_path: `/api/documents/${id}`,
  targets: [],
  document_id: id,
  is_verified: true,
  expiry_date: null,
  versions_count: 1,
});

const dossier = (partiel: Partial<DossierDuCoffre> & Pick<DossierDuCoffre, 'key' | 'kind'>): DossierDuCoffre => ({
  target: null,
  name: null,
  year: null,
  entries: [],
  read_only: false,
  parent: null,
  reference: null,
  ...partiel,
});

const rendre = () => render(withIntl(<CoffreDeDocuments />));
const region = (nom: string) => screen.getByRole('region', { name: nom });

beforeEach(() => {
  ecran.bureau = false;
  telecharger.mockClear();
  lireLaFiche.mockReset();
});

describe('TCK-2898 — AC5 : le bail sous son bien, chez le bailleur', () => {
  beforeEach(() => {
    reponse.data = {
      data: {
        folders: [
          dossier({
            key: 'property:1',
            kind: 'property',
            target: { type: 'property', id: 1 },
            name: 'Villa Almadies',
            entries: [piece(5, 'Titre foncier TF 14 208/DK')],
          }),
          dossier({
            key: 'lease:7',
            kind: 'lease',
            target: { type: 'lease', id: 7 },
            name: 'Fatou Kiné Diallo',
            reference: 'LS-7',
            parent: 'property:1',
            entries: [genere('lease_contract', '2026-01-12', '/api/leases/7/contract/pdf', 'LS-7'), genere('inventory_move_in', '2026-01-15', '/api/inventories/3/pdf')],
          }),
          dossier({ key: 'property:2', kind: 'property', target: { type: 'property', id: 2 }, name: 'Appartement Mermoz' }),
          dossier({ key: 'pieces', kind: 'pieces', target: { type: 'user', id: 12 } }),
        ],
        counts: { expiring_soon: 0, unverified: 0 },
        attachable_targets: [{ type: 'user', id: 12, folder: 'pieces', name: null }],
      },
    };
  });

  it('téléphone — la ligne « Bail de Fatou Kiné Diallo » s’ouvre sur le contrat ; le bien vide dit « Aucun document »', () => {
    rendre();
    const villa = region('Villa Almadies');
    const bail = within(villa).getByTestId('sous-dossier');
    const bascule = within(bail).getByRole('button', { name: /Bail de Fatou Kiné Diallo/ });
    expect(bascule).toHaveTextContent('Contrat, état des lieux · 2 documents');
    expect(bascule).toHaveAttribute('aria-expanded', 'false');
    expect(within(bail).queryByText('Contrat de bail signé')).not.toBeInTheDocument();

    fireEvent.click(bascule);
    expect(bascule).toHaveAttribute('aria-expanded', 'true');
    expect(within(bail).getByText('Contrat de bail signé')).toBeInTheDocument();
    // Le sous-dossier n'est pas un dossier à part : ni région, ni puce.
    expect(screen.queryByRole('region', { name: 'Bail de Fatou Kiné Diallo' })).not.toBeInTheDocument();
    const puces = screen.getByRole('group', { name: 'Filtrer par dossier' });
    expect(within(puces).queryByRole('button', { name: /Bail de/ })).not.toBeInTheDocument();
    // Le bien compte ses documents ET ceux de son bail.
    expect(within(puces).getByRole('button', { name: /Villa Almadies/ })).toHaveTextContent('3');

    expect(region('Appartement Mermoz')).toHaveTextContent('Aucun document');
  });

  it('bureau — l’arborescence liste chaque bien, même vide ; le sous-dossier vit dans le bien', () => {
    ecran.bureau = true;
    rendre();
    const arbre = screen.getByRole('navigation', { name: 'Dossiers' });
    expect(within(arbre).getByRole('button', { name: /Villa Almadies/ })).toHaveTextContent('3');
    expect(within(arbre).getByRole('button', { name: /Appartement Mermoz/ })).toHaveTextContent('0');
    expect(within(arbre).queryByRole('button', { name: /Bail de/ })).not.toBeInTheDocument();
    fireEvent.click(within(region('Villa Almadies')).getByRole('button', { name: /Bail de Fatou Kiné Diallo/ }));
    expect(within(region('Villa Almadies')).getByText('Contrat de bail signé')).toBeInTheDocument();
  });
});

describe('TCK-2898 — AC5 : les comptes de l’arborescence ne bougent pas sous un filtre', () => {
  it('bureau — sous « Expire bientôt », le bien compte toujours ses documents et ceux de son bail', () => {
    ecran.bureau = true;
    const bientot = { ...piece(9, 'Assurance habitation', 'insurance'), expiry_date: '2026-11-30' };
    reponse.data = {
      data: {
        folders: [
          dossier({ key: 'property:1', kind: 'property', target: { type: 'property', id: 1 }, name: 'Villa Almadies', entries: [piece(5, 'Titre foncier')] }),
          dossier({ key: 'lease:7', kind: 'lease', target: { type: 'lease', id: 7 }, name: 'Fatou Kiné Diallo', parent: 'property:1', entries: [genere('lease_contract', '2026-01-12', '/api/leases/7/contract/pdf'), genere('inventory_move_in', '2026-01-15', '/api/inventories/3/pdf')] }),
          dossier({ key: 'property:2', kind: 'property', target: { type: 'property', id: 2 }, name: 'Appartement Mermoz', entries: [bientot] }),
        ],
        counts: { expiring_soon: 1, unverified: 0 },
        attachable_targets: [],
      },
    };
    rendre();
    const arbre = screen.getByRole('navigation', { name: 'Dossiers' });
    fireEvent.click(within(arbre).getByRole('button', { name: /Expire bientôt/ }));
    expect(within(arbre).getByRole('button', { name: /Villa Almadies/ })).toHaveTextContent('3');
  });
});

describe('TCK-2898 — AC6 : « Relevés et factures » du bailleur', () => {
  beforeEach(() => {
    reponse.data = {
      data: {
        folders: [
          dossier({
            key: 'statements',
            kind: 'statements',
            entries: [
              genere('owner_statement', '2026-10-31', '/api/me/owner-statements/2026-10/pdf', '2026-10'),
              genere('provider_bill', '2026-11-06', '/api/service-provider-bills/12/pdf', 'SPB-202611-EJMRRUS0'),
              genere('provider_bill', '2026-11-08', '/api/service-provider-bills/13/pdf', 'SPB-202611-KQ2'),
            ],
          }),
        ],
        counts: { expiring_soon: 0, unverified: 0 },
        attachable_targets: [],
      },
    };
  });

  it('le dossier replié dit ses relevés puis ses factures ; une facture se télécharge en PDF', () => {
    rendre();
    const dossierDesReleves = region('Relevés et factures');
    expect(dossierDesReleves).toHaveTextContent(/oct\.? · 2 factures/);
    fireEvent.click(within(dossierDesReleves).getAllByRole('button', { name: /Relevés et factures/ })[0]);
    fireEvent.click(within(dossierDesReleves).getByRole('button', { name: /Facture SPB-202611-EJMRRUS0/ }));
    expect(telecharger).toHaveBeenCalledWith('/api/service-provider-bills/12/pdf', 'Facture SPB-202611-EJMRRUS0.pdf');
  });
});

describe('TCK-2898 — AC7 : le prestataire', () => {
  beforeEach(() => {
    reponse.data = {
      data: {
        folders: [
          dossier({ key: 'pieces', kind: 'pieces', target: { type: 'user', id: 40 }, entries: [piece(70, 'NINEA 008 214 563', 'ninea')] }),
          dossier({ key: 'bills', kind: 'bills', entries: [genere('provider_bill', '2026-11-06', '/api/service-provider-bills/12/pdf', 'SPB-202611-EJMRRUS0')] }),
          dossier({
            key: 'quotes_reports',
            kind: 'quotes_reports',
            entries: [
              genere('maintenance_quote', '2026-10-01', '/api/maintenance-requests/3/quote/pdf', 'Fuite sous l’évier'),
              genere('maintenance_completion_report', '2026-11-01', '/api/maintenance-requests/3/completion-report/pdf', 'Fuite sous l’évier'),
              genere('maintenance_completion_report', '2026-10-20', '/api/maintenance-requests/2/completion-report/pdf', 'Mitigeur'),
            ],
          }),
        ],
        counts: { expiring_soon: 0, unverified: 0 },
        attachable_targets: [{ type: 'user', id: 40, folder: 'pieces', name: null }],
      },
    };
  });

  it('« Devis et rapports » : la puce porte le compte servi, filtre, et le dossier replié se résume', () => {
    rendre();
    const puces = screen.getByRole('group', { name: 'Filtrer par dossier' });
    expect(within(puces).getByRole('button', { name: /Mes factures/ })).toHaveTextContent('1');
    expect(within(puces).getByRole('button', { name: /Mes pièces/ })).toHaveTextContent('1');
    const devis = within(puces).getByRole('button', { name: /Devis et rapports/ });
    expect(devis).toHaveTextContent('3');

    expect(region('Devis et rapports')).toHaveTextContent('1 devis · 2 rapports de fin d’intervention');
    fireEvent.click(devis);
    expect(screen.queryByRole('region', { name: 'Mes factures' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Mes pièces' })).not.toBeInTheDocument();
    expect(within(region('Devis et rapports')).getAllByTestId('entree-du-coffre')).toHaveLength(3);
  });

  it('« Télécharger » d’une facture appelle son PDF', () => {
    rendre();
    fireEvent.click(within(region('Mes factures')).getByRole('button', { name: /Facture SPB-202611-EJMRRUS0/ }));
    expect(telecharger).toHaveBeenCalledWith('/api/service-provider-bills/12/pdf', 'Facture SPB-202611-EJMRRUS0.pdf');
  });

  it('bureau — le bouton de fin de ligne d’une facture appelle son PDF', () => {
    ecran.bureau = true;
    rendre();
    fireEvent.click(within(region('Mes factures')).getByRole('button', { name: 'Télécharger : Facture SPB-202611-EJMRRUS0' }));
    expect(telecharger).toHaveBeenCalledWith('/api/service-provider-bills/12/pdf', 'Facture SPB-202611-EJMRRUS0.pdf');
  });
});

describe('TCK-2898 — AC8 : « Télécharger » en fin de chaque ligne', () => {
  beforeEach(() => {
    reponse.data = {
      data: {
        folders: [
          dossier({ key: 'lease:22', kind: 'lease', target: { type: 'lease', id: 22 }, entries: [genere('lease_contract', '2026-06-29', '/api/leases/22/contract/pdf', 'LS-0DPA75TK')] }),
          dossier({ key: 'pieces', kind: 'pieces', target: { type: 'user', id: 78 }, entries: [piece(301, 'Carte d’identité', 'id_card')] }),
        ],
        counts: { expiring_soon: 0, unverified: 0 },
        attachable_targets: [{ type: 'user', id: 78, folder: 'pieces', name: null }],
      },
    };
  });

  const onglet = () => {
    const fenetre = { location: { href: '' }, opener: {} as unknown, close: vi.fn() };
    const ouvrir = vi.fn(() => fenetre);
    vi.stubGlobal('open', ouvrir);
    return { fenetre, ouvrir };
  };
  afterEach(() => vi.unstubAllGlobals());

  it('téléphone — la pièce s’ouvre par sa ligne et se télécharge par son bouton, sans ouvrir la fiche', async () => {
    const { fenetre, ouvrir } = onglet();
    let rendreLaFiche: (v: unknown) => void = () => undefined;
    lireLaFiche.mockImplementation(() => new Promise((r) => (rendreLaFiche = r)));
    rendre();
    const ligne = within(region('Mes pièces')).getByTestId('entree-du-coffre');
    expect(within(ligne).getByRole('link', { name: /Carte d’identité/ })).toHaveAttribute('href', '/app/documents/301');
    const bouton = within(ligne).getByRole('button', { name: 'Télécharger : Carte d’identité' });
    // Le bouton est à côté du lien, jamais dedans.
    expect(bouton.closest('a')).toBeNull();

    fireEvent.click(bouton);
    // L'onglet s'ouvre AU CLIC, avant la réponse de la fiche (le bloqueur de fenêtres refuse après une attente).
    expect(ouvrir).toHaveBeenCalledTimes(1);
    expect(lireLaFiche).toHaveBeenCalledWith('/api/documents/301');
    rendreLaFiche({ data: { file_url: 'https://api.takussan.test/api/media/88/file?expires=1&signature=abc' } });
    await waitFor(() => expect(fenetre.location.href).toBe('https://api.takussan.test/api/media/88/file?expires=1&signature=abc'));
    expect(fenetre.opener).toBeNull();
    expect(telecharger).not.toHaveBeenCalled();

    // Le généré : la ligne entière le télécharge, par son endpoint.
    fireEvent.click(within(region('Mon bail')).getByRole('button', { name: /Contrat de bail signé/ }));
    expect(telecharger).toHaveBeenLastCalledWith('/api/leases/22/contract/pdf', 'Contrat de bail signé.pdf');
  });

  it('une pièce sans fichier le dit, et l’onglet ouvert se referme', async () => {
    const { fenetre } = onglet();
    lireLaFiche.mockResolvedValue({ data: { file_url: null } });
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger : Carte d’identité' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(fenetre.close).toHaveBeenCalled();
    expect(fenetre.location.href).toBe('');
  });

  it('bureau — chaque ligne finit par « Télécharger », l’aperçu garde « Ouvrir la fiche »', () => {
    ecran.bureau = true;
    rendre();
    expect(screen.getAllByTestId('telecharger-l-entree')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Télécharger : Carte d’identité' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ouvrir : Carte d’identité' })).not.toBeInTheDocument();
    fireEvent.click(within(region('Mes pièces')).getByRole('button', { name: /^Carte d’identité/ }));
    expect(within(screen.getByRole('complementary', { name: 'Aperçu' })).getByRole('link', { name: 'Ouvrir la fiche' })).toHaveAttribute('href', '/app/documents/301');
  });
});
